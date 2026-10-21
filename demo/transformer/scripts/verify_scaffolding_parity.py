"""Compare the browser and Python measurement contracts on real transformed data.

No model is called. Both implementations receive the same Learnlog records so
random writer IDs cannot hide a semantic mismatch. The pipeline integration
tests separately exercise the Python source adapters and published artifacts.
"""
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parents[1] / 'integrations/airflow/src'))
from qlm_airflow.scaffolding import measure_scaffolding, create_scaffolding_csv

NODE = r"""
import {transform,getSample,PROFILES} from './dist/engine.mjs';
import {measureScaffolding,createScaffoldingCSV} from './dist/scaffolding-measurement.mjs';
const runs=[];
for(const p of PROFILES) runs.push(await transform({profileId:p.id,text:getSample(p.id),sourceName:p.sampleName,secret:'parity-key-for-local-demo-only-32-bytes',tenant:'measurement-parity',importedAt:'2026-10-17T00:30:00Z'}));
const clone=x=>JSON.parse(JSON.stringify(x));
const edited=clone(runs[0]);edited.records[0].entries[26].event.data.dialogue.text='Changed text must not inherit labels';
const booleanTurn=clone(runs[0]);booleanTurn.records[0].entries[0].event.data.dialogue.turn_number=true;booleanTurn.records[0].entries[0].event.data.raw_source_fields.turn.turn_number=true;
const unverified=await transform({profileId:'tutormoments',text:getSample('tutormoments')+'\n',sourceName:'edited.jsonl',secret:'parity-key-for-local-demo-only-32-bytes',tenant:'measurement-parity',importedAt:'2026-10-17T00:30:00Z'});
const cases={combined:runs,transcript:[runs[0]],summary_only:[runs[1]],empty:[],duplicate_session:[runs[0],runs[0]],changed_transformed_dialogue:[edited],boolean_turn_number:[booleanTurn],unverified_input:[unverified]};
process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(cases).map(([name,input])=>{const measurement=measureScaffolding(input);return[name,{runs:input,measurement,csv:createScaffoldingCSV(measurement)}];}))));
"""

def verify():
    evidence = json.loads((ROOT / 'dist/provenance/scaffolding-evidence.json').read_text())
    cases = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', NODE], cwd=ROOT))
    results = {}
    for name, case in cases.items():
        actual = measure_scaffolding(case['runs'], evidence)
        assert actual == case['measurement'], name + ': Python/browser JSON contracts differ'
        assert create_scaffolding_csv(actual) == case['csv'], name + ': CSV bytes differ'
        results[name] = {'status': actual['status'], **actual['totals']}
    return {'result': 'PASS', 'cases': results,
            'scope': 'Complete measurement JSON and CSV bytes on the same real transformed Learnlog records, including duplicate, edited and unverified inputs.'}

if __name__ == '__main__':
    print(json.dumps(verify(), indent=2))
