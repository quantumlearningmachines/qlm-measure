"""Package current contract and research code without copying learner telemetry."""
from pathlib import Path
import hashlib
import json
import zipfile

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parents[1]
CAPTURE=REPO/'tools/qlm-transformer/qlm_transformer/capture'
CONTRACT=CAPTURE/'reference/analysis/vendor_contract'
DOWNLOADS=ROOT/'dist/downloads'
FORBIDDEN={'__pycache__','.git','outputs','inputs','private-cache','private-records','build','dist'}


def pack(target,prefix,files):
    with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,value in sorted(files.items()):
            info=zipfile.ZipInfo(prefix+'/'+name,date_time=(2026,10,20,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16
            z.writestr(info,value)


def source_files(root):
    return {p.relative_to(root).as_posix():p.read_bytes() for p in root.rglob('*')
            if p.is_file() and not p.is_symlink() and not set(p.relative_to(root).parts)&FORBIDDEN
            and '.private.' not in p.name and p.suffix in {'.py','.json','.sql','.md','.txt'}}


def main():
    DOWNLOADS.mkdir(parents=True,exist_ok=True)
    files=source_files(CONTRACT);files['LICENSE']=(CONTRACT/'LICENSE').read_bytes()
    files['examples/carriers/demo-bindings.json']=(ROOT/'dist/examples/assistance-profile-bindings.json').read_bytes()
    for name in ('learnlog-assistance-profile-draft','learnlog-assistance-contract-draft'):
        pack(DOWNLOADS/(name+'.zip'),name,files)
    research=source_files(CAPTURE/'reference')
    research['LICENSE']=(CONTRACT/'LICENSE').read_bytes()
    research['README.md']=(REPO/'tools/qlm-transformer/README.md').read_bytes()
    research['requirements.txt']=b'jsonschema==4.26.0\n'
    pack(DOWNLOADS/'learnlog-cross-source-analysis.zip','learnlog-cross-source-analysis',research)
    airflow=json.loads((DOWNLOADS/'qlm-transformer-airflow.json').read_text())
    release={'status':'prepared','source_repository':'https://github.com/quantumlearningmachines/qlm-measure',
             'source_published':False,'preprint_published':False,
             'transformer_version':'0.3.0rc1','pipeline_version':'0.5.0rc1',
             'downloads':{p.name:{'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted(DOWNLOADS.glob('*.zip'))},
             'assistance_rules':['separate stages','declare capture','preserve unknowns','retain mapping provenance'],
             'independent_human_mapping_review':False,'airflow_download':airflow['filename']}
    (ROOT/'dist/release-candidate.json').write_text(json.dumps(release,indent=2)+'\n')
    (ROOT/'dist/release-candidate-data.mjs').write_text('export default '+json.dumps(release,indent=2)+';\n')
    (DOWNLOADS/'qlm-transformer-airflow-verification.json').write_text(json.dumps({
        'release_status':'prepared','verification_report':'See private release preparation report; no hosted CI or production deployment claimed.',
        'historical_source_adapter_version':'0.4.0-research-adapters'},indent=2)+'\n')
    print(json.dumps({'downloads':len(release['downloads']),'status':'prepared'},indent=2))


if __name__=='__main__':main()
