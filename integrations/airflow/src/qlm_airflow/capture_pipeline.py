"""Retryable file workflow; source rows and capture payloads stay off XCom."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile

from qlm_transformer.capture.workflow import run_demo, run_research
import qlm_transformer.capture

SAFE = re.compile(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\Z')


def file_hash(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def implementation_digest():
    package = Path(qlm_transformer.capture.__file__).parent
    files = {str(p.relative_to(package)): file_hash(p) for p in sorted(package.rglob('*'))
             if p.is_file() and '__pycache__' not in p.parts and p.suffix in {'.py', '.json', '.sql'}}
    files['airflow_capture_pipeline.py'] = file_hash(__file__)
    return hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()


def inside(root, value):
    if not isinstance(value, str) or not value or Path(value).is_absolute():
        raise ValueError('Manifest paths must be relative to QLM_PIPELINE_ROOT')
    path = (root / value).resolve()
    if not path.is_relative_to(root):
        raise ValueError('Manifest path escapes the configured root')
    return path


def execute(root, manifest, run_id):
    root = Path(root).resolve(strict=True)
    if not SAFE.fullmatch(run_id):
        raise ValueError('Invalid run identifier')
    manifest_path = inside(root, manifest)
    if manifest_path.stat().st_size > 10_000:
        raise ValueError('Manifest exceeds size limit')
    config = json.loads(manifest_path.read_text())
    allowed = {'schema', 'mode', 'zenodo_archive', 'tutortrace_json', 'allow_tutortrace_research'}
    if not isinstance(config, dict) or set(config) - allowed or config.get('schema') != 'qlm-capture-airflow-1':
        raise ValueError('Unsupported capture manifest')
    mode = config.get('mode')
    if mode not in {'synthetic', 'research'}:
        raise ValueError('Mode must be synthetic or research')
    if mode == 'synthetic' and set(config) != {'schema', 'mode'}:
        raise ValueError('Synthetic mode cannot include source data configuration')
    inputs = {}
    identity = {'config': config, 'package': 'qlm-transformer-0.3.0rc1',
                'implementation_sha256': implementation_digest()}
    if mode == 'research':
        if not isinstance(config.get('allow_tutortrace_research', False), bool):
            raise ValueError('Research opt-in must be boolean')
        if config.get('tutortrace_json') and config.get('allow_tutortrace_research') is not True:
            raise ValueError('Explicit research opt-in is required before reading IDETrace telemetry')
        for field in ('zenodo_archive', 'tutortrace_json'):
            if config.get(field):
                inputs[field] = inside(root, config[field])
                identity[field] = file_hash(inputs[field])
        if not inputs:
            raise ValueError('Research mode requires pinned native source files')
    fingerprint = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()
    outputs = inside(root, 'outputs')
    outputs.mkdir(exist_ok=True, mode=0o700)
    folder = inside(root, 'outputs/capture-' + run_id)
    lock_path = inside(root, 'outputs/.capture-' + run_id + '.lock')
    with lock_path.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        completion = folder / 'COMPLETE.json'
        if folder.exists():
            if not completion.is_file():
                raise ValueError('Existing output has no completion marker; use a new run identifier')
            saved = json.loads(completion.read_text())
            if saved['fingerprint'] != fingerprint:
                raise ValueError('Run identifier already belongs to a different configuration')
            for name, expected in saved['files'].items():
                path = inside(folder, name)
                if not path.is_file() or file_hash(path) != expected:
                    raise ValueError('Completed artifact has changed')
            return dict(saved['summary'], reused=True)
        temporary = Path(tempfile.mkdtemp(prefix='.capture-', dir=outputs))
        try:
            kwargs = {'output_dir': temporary / 'public', 'private_dir': temporary / 'private'}
            result = run_demo(**kwargs) if mode == 'synthetic' else run_research(
                **kwargs, **inputs, allow_tutortrace_research=config.get('allow_tutortrace_research', False))
            summary = {'artifact_directory': str(folder.relative_to(root)), 'synthetic': mode == 'synthetic',
                       'recorded_request_observations': result['aggregate']['assistance_request_observations'],
                       'shared_query_results_identical': True}
            files = {str(p.relative_to(temporary)): hashlib.sha256(p.read_bytes()).hexdigest()
                     for p in sorted(temporary.rglob('*')) if p.is_file()}
            (temporary / 'COMPLETE.json').write_text(json.dumps({'fingerprint': fingerprint, 'summary': summary, 'files': files}, indent=2)+'\n')
            os.replace(temporary, folder)
            return dict(summary, reused=False)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)
