"""Install wheel and sdist pairs outside the checkout and exercise their CLIs."""
import argparse
import base64
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import zipfile


def checked(command, *, cwd, env=None):
    result=subprocess.run([str(x) for x in command],cwd=cwd,env=env,text=True,capture_output=True)
    if result.returncode:
        raise RuntimeError('Distribution check failed: '+str(command[0])+'\n'+result.stdout+'\n'+result.stderr)
    return result.stdout


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dist-dir',type=Path,required=True)
    parser.add_argument('--airflow-zip',type=Path,required=True)
    args=parser.parse_args();dist=args.dist_dir.resolve();archive=args.airflow_zip.resolve()
    report=[]
    with tempfile.TemporaryDirectory(prefix='qlm-distributions-') as temporary:
        root=Path(temporary)
        for kind,extension in [('wheel','*.whl'),('sdist','*.tar.gz'),('standalone_zip',None)]:
            work=root/kind;work.mkdir()
            checked([sys.executable,'-m','venv',work/'venv'],cwd=work)
            python=work/'venv/bin/python';bin_dir=work/'venv/bin'
            with zipfile.ZipFile(archive) as z:
                for name in z.namelist():
                    if Path(name).is_absolute() or '..' in Path(name).parts:raise ValueError('Unsafe ZIP member')
                z.extractall(work)
            pipeline_root=work/'qlm-transformer-airflow'
            if extension:
                artifacts=sorted(dist.glob(extension))
                if len(artifacts)!=2:raise ValueError('Expected exactly the transformer and Airflow '+kind)
                checked([python,'-m','pip','install',*artifacts],cwd=work)
            else:
                checked([python,'-m','pip','install','-r','requirements.txt'],cwd=pipeline_root)
            checked([python,'-m','pip','check'],cwd=work)
            versions=json.loads(checked([python,'-c',
                'import json,importlib.metadata as m,qlm_transformer,qlm_airflow;'
                'print(json.dumps({"transformer":m.version("qlm-transformer"),"airflow":m.version("qlm-transformer-airflow-demo"),"transformer_module":qlm_transformer.__version__,"airflow_module":qlm_airflow.__version__}))'],cwd=work))
            if versions!={'transformer':'0.3.0rc1','airflow':'0.5.0rc1','transformer_module':'0.3.0rc1','airflow_module':'0.5.0rc1'}:
                raise ValueError('Installed distribution and module versions disagree')
            checked([bin_dir/'qlm-capture','demo','--output-dir',work/'public','--private-dir',work/'private'],cwd=work)
            capture=json.loads((work/'public/aggregate.public.json').read_text())
            if capture['aggregate']['assistance_request_observations']!=2 or not capture['synthetic']:
                raise ValueError('Installed capture demo does not reconcile')
            checked([bin_dir/'qlm-transformer','init-demo','--output-dir',work/'writer-demo'],cwd=work)
            env=os.environ.copy();env.pop('PYTHONPATH',None)
            env['QLM_PSEUDONYM_KEY']=secrets.token_hex(32)
            checked([bin_dir/'qlm-transformer','convert','--platform','mathia','--input',work/'writer-demo/examples/mathia.json',
                     '--profile',work/'writer-demo/profiles/mathia.json','--tenant','SYNTHETIC-release-test',
                     '--output',work/'writer.json'],cwd=work,env=env)
            checked([bin_dir/'qlm-transformer','verify',work/'writer.json'],cwd=work,env=env)
            env['QLM_PSEUDONYM_KEY_B64']=base64.b64encode(secrets.token_bytes(32)).decode()
            result=json.loads(checked([bin_dir/'qlm-pipeline','--root',pipeline_root,'--manifest','config/demo.json','--run-id','installed-package'],cwd=work,env=env))
            if result['observations']!=322 or result['records']!=14:raise ValueError('Installed transcript/participant workflow differs')
            report.append({'kind':kind,'versions':versions,'pip_check':True,
                           'synthetic_request_observations':2,'writer_convert_and_verify':True,
                           'transcript_and_participant_observations':322,'contained_records':14,
                           'execution_outside_source_checkout':True})
    print(json.dumps({'passed':True,'checks':report},indent=2))
    return 0


if __name__=='__main__':raise SystemExit(main())
