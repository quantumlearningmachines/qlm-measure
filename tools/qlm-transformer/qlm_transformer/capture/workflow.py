"""Public entry points around the corrected, bounded reference analysis.

The reference code is retained beside its schema, SQL and regression tests.
These helpers do not infer missing assistance or call an estimation service.
"""
from argparse import Namespace
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path

from .reference.analysis import aggregate as engine
from .reference.sql_analysis import run_sql

CONTRACT = Path(__file__).parent / 'reference/analysis/vendor_contract'


def directories(output_dir, private_dir):
    public, private = Path(output_dir).resolve(), Path(private_dir).resolve()
    if public == private or public.is_relative_to(private) or private.is_relative_to(public):
        raise ValueError('Public and private directories must be separate, non-nested paths')
    for folder in (public, private):
        if folder.exists() and (not folder.is_dir() or any(folder.iterdir())):
            raise ValueError('Use new or empty output directories; existing artifacts are never overwritten')
    public.mkdir(parents=True, exist_ok=True)
    private.mkdir(parents=True, exist_ok=True, mode=0o700)
    private.chmod(0o700)
    return public, private


def analyze_carriers(private_dir, output_dir):
    private, public = Path(private_dir), Path(output_dir)
    validator, bindings = engine.load_contract(CONTRACT)
    representations = {}
    for name, filename, extract in (
        ('direct_capture', 'capture.private.jsonl', lambda value: value),
        ('recovered_xapi', 'xapi.private.jsonl', bindings.extract_xapi),
        ('recovered_caliper', 'caliper.private.jsonl', bindings.extract_caliper),
    ):
        representations[name] = run_sql.query_representation([private / filename], extract, validator.validate)
    expected = representations['direct_capture']['query_rows']
    if any(result['query_rows'] != expected for result in representations.values()):
        raise ValueError('Shared SQL results differ between carriers')
    result = {'representations': representations, 'shared_query_results_identical': True,
              'query_sha256': engine.sha_file(run_sql.ROOT / 'query.sql'),
              'unit': 'Source-scoped released-record occurrence; no unique-person or causal claim'}
    (public / 'SQL_RESULTS.json').write_text(json.dumps(result, indent=2) + '\n')
    return result


def run_research(*, output_dir, private_dir, zenodo_archive=None,
                 tutortrace_json=None, allow_tutortrace_research=False):
    if not zenodo_archive and not tutortrace_json:
        raise ValueError('Supply at least one pinned source file')
    if tutortrace_json and not allow_tutortrace_research:
        raise ValueError('Explicit research opt-in is required before reading IDETrace telemetry')
    # Check source integrity before creating outputs.
    for value, expected in ((zenodo_archive, engine.ZENODO_SHA),
                            (tutortrace_json, engine.TUTORTRACE_SHA)):
        if value:
            engine.check_pin(value, expected)
    public, private = directories(output_dir, private_dir)
    result = engine.run(Namespace(contract_dir=CONTRACT, output_dir=public,
                                 private_dir=private, zenodo_archive=zenodo_archive,
                                 tutortrace_json=tutortrace_json,
                                 allow_tutortrace_research=allow_tutortrace_research))
    analyze_carriers(private, public)
    for path in private.iterdir():
        path.chmod(0o600)
    return result


def run_demo(*, output_dir, private_dir):
    """Two SYNTHETIC request sources plus one displayed teaching fixture."""
    public, private = directories(output_dir, private_dir)
    validator, bindings = engine.load_contract(CONTRACT)
    records = [json.loads((CONTRACT / 'examples' / ('SYNTHETIC_hint_' + stage + '.json')).read_text())
               for stage in ('requested', 'displayed')]
    request = deepcopy(records[0])
    request['record_id'] = {'scope': 'urn:learnlog:synthetic:second-source', 'local_id': 'query-1'}
    request['source']['source_id'] = 'urn:learnlog:synthetic:second-source'
    request['assistance']['label'] = 'SYNTHETIC chat request'
    reference = 'urn:learnlog:synthetic:second-source:raw'
    request['provenance']['native_record_reference'] = reference
    request['evidence'][0]['reference'] = reference
    request['evidence'][0]['description'] = 'SYNTHETIC second-source request fixture; no real learner data.'
    records.append(request)
    created = datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    paths = {name: (private / filename).open('w') for name, filename in
             (('capture', 'capture.private.jsonl'), ('xapi', 'xapi.private.jsonl'), ('caliper', 'caliper.private.jsonl'))}
    try:
        for record in records:
            validator.validate(record)
            xapi = bindings.xapi_statement(record, 'urn:learnlog:synthetic:importer', created,
                                           account_homepage='https://example.org/', account_name='SYNTHETIC importer')
            caliper = bindings.caliper_event(record, 'urn:learnlog:synthetic:importer', created)
            if record != bindings.extract_xapi(xapi) or record != bindings.extract_caliper(caliper):
                raise ValueError('Carrier recovery changed a synthetic capture')
            for name, value in (('capture', record), ('xapi', xapi), ('caliper', caliper)):
                paths[name].write(engine.canonical(value) + '\n')
    finally:
        for handle in paths.values():
            handle.close()
    inventory = engine.RequestAggregator().extend(records).result()
    replay = engine.RequestAggregator().extend(records).extend(records).result()
    if inventory != replay:
        raise ValueError('Synthetic replay changed the inventory')
    sql = analyze_carriers(private, public)
    result = {'synthetic': True, 'aggregate': inventory, 'captured_records': len(records),
              'source_request_count': 2, 'actual_request_total': None, 'request_rate': None,
              'learning_effect': None, 'shared_query_results_identical': sql['shared_query_results_identical'],
              'replay_idempotent': True,
              'independent_human_mapping_review': False,
              'interpretation': 'Two synthetic requests and one synthetic display; no new research result.'}
    (public / 'aggregate.public.json').write_text(json.dumps(result, indent=2) + '\n')
    for path in private.iterdir():
        path.chmod(0o600)
    return result
