"""Cross-runtime checks over real imports and explicitly synthetic declarations.

This checks representation behavior, not independent mapping validity. The
positive pooling control is an authored declaration, never a real review.
"""
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parents[1] / "integrations/airflow/src"))
from qlm_airflow.research_adapters import adapt, verify_import_document
from qlm_airflow.semantics import normalize_context, pooling_compatibility

NODE = r"""
import {transform,getSample,ALL_PROFILES} from './dist/engine.mjs';
import {getSemanticContract,normalizeContext,assessPoolingCompatibility} from './dist/research-semantics.mjs';
const clone=x=>JSON.parse(JSON.stringify(x));
const imports=[];
for(const id of ['tutormoments','oatutor','explicit-assistance-events']){
 const profile=ALL_PROFILES.find(p=>p.id===id);
 for(const changed of [false,true]){
  const text=getSample(id)+(changed?'\n':'');
  const run=await transform({profileId:id,text,sourceName:profile.sampleName,tenant:'semantic-parity',secret:'semantic-parity-key-only-not-for-production',importedAt:'2026-10-17T00:30:00Z'});
  imports.push({id,changed,text,rows:run.rows,run});
 }
}
const mapping=getSemanticContract('explicit-assistance-events');
mapping.review={status:'independently_reviewed',reviewer:'SYNTHETIC TEST declaration',scope:'Authored compatibility control only',reference:'https://example.invalid/not-a-real-review'};
mapping.coverage={status:'complete_within_boundary',boundary:'SYNTHETIC shared definition'};
const d=id=>({source_id:id,source_kind:'declaration_test_only',mapping:clone(mapping),context:{phase:'practice',permission:'permitted',observed_use:'recorded',capture:'complete_within_boundary',capture_boundary:'SYNTHETIC shared definition'}});
const pair=()=>[d('SYNTHETIC-a'),d('SYNTHETIC-b')];
const cases={empty:[],one_source:[d('SYNTHETIC-a')],complete_synthetic_declarations:pair()};
for(const name of ['measurement_profile','target_unit','denominator','coding_method','source_unit','definition']){
 const rows=pair();rows[1].mapping[name]='';cases['missing_'+name]=rows;
}
for(const [name,change]of Object.entries({synthetic:x=>x.source_kind='synthetic_fixture',unreviewed:x=>x.mapping.review.status='unreviewed',different_definition:x=>x.mapping.definition='A different construct',different_phase:x=>x.context.phase='assessment',partial_capture:x=>x.context.capture='partial',unknown_use:x=>x.context.observed_use='unknown'})){
 const rows=pair();change(rows[1]);cases[name]=rows;
}
cases.malformed=[d('SYNTHETIC-a'),null];cases.duplicate_source=[d('SYNTHETIC-a'),d('SYNTHETIC-a')];
const contexts=[{}, {permission:'permitted'}, {phase:'assessment',permission:'prohibited',capture:'partial',capture_boundary:'Source system only'}];
process.stdout.write(JSON.stringify({imports,cases:Object.fromEntries(Object.entries(cases).map(([n,x])=>[n,{input:x,output:assessPoolingCompatibility(x)}])),contexts:contexts.map(input=>({input,output:normalizeContext(input)}))}));
"""


def event_without_salt(event):
    return {key: value for key, value in event.items() if key != "salt"}


def verify():
    payload = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", NODE], cwd=ROOT))
    imports = []
    event_count = 0
    for case in payload["imports"]:
        profile = json.loads((ROOT.parents[1] / "integrations/airflow/profiles" / (case["id"] + ".json")).read_text())
        document, status = adapt(case["rows"], case["text"].encode(), profile,
                                 b"semantic-parity-key-only-not-for-production", "semantic-parity",
                                 "2026-10-17T00:30:00Z")
        verify_import_document(document)
        expected = case["run"]
        assert status["sourceKind"] == expected["sourceKind"], case["id"]
        assert status["sourceVerified"] == expected["sourceVerified"], case["id"]
        assert len(document["records"]) == len(expected["records"]), case["id"]
        for actual_record, expected_record in zip(document["records"], expected["records"]):
            for field in ("subject", "source_sha256", "mapping_sha256", "semantic_profile_binding",
                          "semantic_mapping", "event_schema_bindings", "assistance_context"):
                assert actual_record["header"].get(field) == expected_record["header"].get(field), (case["id"], field)
            assert len(actual_record["entries"]) == len(expected_record["entries"])
            for actual, target in zip(actual_record["entries"], expected_record["entries"]):
                assert actual["time"] == target["time"]
                assert event_without_salt(actual["event"]) == event_without_salt(target["event"]), (case["id"], actual["seq"])
                event_count += 1
        imports.append({"source": case["id"], "byte_changed": case["changed"], "source_kind": status["sourceKind"], "records": len(document["records"]), "events": sum(len(r["entries"]) for r in document["records"])})
    for name, case in payload["cases"].items():
        assert pooling_compatibility(case["input"]) == case["output"], name
    for case in payload["contexts"]:
        assert normalize_context(case["input"]) == case["output"]
    return {"result": "PASS", "imports": imports, "events_compared": event_count,
            "pooling_cases": len(payload["cases"]), "context_cases": len(payload["contexts"]),
            "scope": "Event objects excluding random salts, protected semantic headers, source status, context normalization and complete pooling reports; synthetic declarations are authored controls, not independent reviews."}


if __name__ == "__main__":
    print(json.dumps(verify(), indent=2))
