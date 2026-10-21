"""Build a deterministic bundle from the canonical package, with no runtime state."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
PACKAGE = REPO / 'tools/qlm-transformer'
TARGET = REPO / 'demo/transformer/dist/downloads/qlm-transformer-airflow.zip'
if not PACKAGE.is_dir():
    PACKAGE = ROOT / 'vendor/qlm-transformer'
    TARGET = ROOT / 'dist/qlm-transformer-airflow.zip'
ALLOWED_TOP = {'README.md','LICENSE','DATA_LICENSES.md','pyproject.toml','build_download.py','MANIFEST.in','.gitignore'}
ALLOWED_DIRS = {'src','dags','config','profiles','samples','provenance','schemas','tests','scripts'}
EXTENSIONS = {'.py','.json','.jsonl','.ndjson','.csv','.md','.toml','.txt','.sql','.cff','.sh'}
NAMES = {'LICENSE','NOTICE','.gitignore','MANIFEST.in'}
EXCLUDED = {'__pycache__','build','dist','outputs','inputs','.airflow','.git','.pytest_cache','private-cache','private-records'}


def files(folder):
    for path in sorted(folder.rglob('*')):
        relative = path.relative_to(folder)
        if not path.is_file() or path.is_symlink():continue
        if any(x in EXCLUDED or x.startswith('.venv') or x.endswith('.egg-info') for x in relative.parts):continue
        if '.private.' in path.name or path.name.startswith('.env'):continue
        if path.suffix in EXTENSIONS or path.name in NAMES:yield path, relative.as_posix()


def main():
    content = {}
    for path, name in files(ROOT):
        if name.split('/')[0] in ALLOWED_TOP | ALLOWED_DIRS:content[name] = path.read_bytes()
    for path, name in files(PACKAGE):content['vendor/qlm-transformer/' + name] = path.read_bytes()
    content['requirements.txt'] = b'./vendor/qlm-transformer\n.\nrfc8785==0.1.4\njsonschema==4.26.0\n'
    manifest = {'schema':'qlm-airflow-download-manifest-0.3', 'pipeline_version':'0.5.0rc1',
                'files':[{'path':name,'sha256':hashlib.sha256(value).hexdigest(),'bytes':len(value)} for name,value in sorted(content.items())]}
    content['DOWNLOAD_MANIFEST.json'] = (json.dumps(manifest,indent=2)+'\n').encode()
    TARGET.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(TARGET,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,value in sorted(content.items()):
            info=zipfile.ZipInfo('qlm-transformer-airflow/'+name,date_time=(2026,10,20,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            archive.writestr(info,value)
    metadata={'filename':TARGET.name,'bytes':TARGET.stat().st_size,
              'sha256':hashlib.sha256(TARGET.read_bytes()).hexdigest(),'files':len(content),
              'pipeline_version':'0.5.0rc1','transformer_version':'0.3.0rc1',
              'contained_writer_version':'0.2.1','source_adapter_version':'0.4.0-research-adapters',
              'capture_payload_version':'0.1.0-draft','capture_binding_version':'0.1.1-draft',
              'release_status':'prepared','raw_zenodo_idetrace_telemetry_bundled':False}
    TARGET.with_suffix('.json').write_text(json.dumps(metadata,indent=2)+'\n')
    print(json.dumps(metadata,indent=2))


if __name__=='__main__':main()
