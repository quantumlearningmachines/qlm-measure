import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transform,getSample,verify,digest,aggregate} from '../dist/engine.mjs';
import {ASSISTANCE_CONTEXT_PROFILE,IMPORT_EVENT_SCHEMA,LIFECYCLE_EVENT_SCHEMA,normalizeContext,getSemanticContract,assessPoolingCompatibility} from '../dist/research-semantics.mjs';
import {createDataset,createCSV,sourceKind} from '../dist/view-model.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
const key='k'.repeat(32),time='2026-10-17T00:00:00Z';
const fixture=JSON.parse('['+getSample('explicit-assistance-events').trim().split('\n').join(',')+']');
const input=rows=>({profileId:'explicit-assistance-events',text:JSON.stringify(rows),sourceName:'test.json',secret:key,importedAt:time});
const fixtureRun=await transform({...input(fixture),text:getSample('explicit-assistance-events')});

test('Published semantic and event schema files exactly match embedded offline specifications',()=>{
 for(const [filename,value]of [['assistance-context-v0.1.0.json',ASSISTANCE_CONTEXT_PROFILE],['research-import-v2.json',IMPORT_EVENT_SCHEMA],['assistance-lifecycle-v1.json',LIFECYCLE_EVENT_SCHEMA]])assert.deepEqual(JSON.parse(readFileSync(new URL('../dist/schemas/'+filename,import.meta.url),'utf8')),value);
});
test('Unknown context remains unknown and permission never becomes observed use',()=>{
 assert.deepEqual(normalizeContext(),{phase:'unknown',permission:'unknown',observed_use:'unknown',capture:'unknown',capture_boundary:null,product_version:null,model_version:null});
 assert.equal(normalizeContext({permission:'permitted'}).observed_use,'unknown');
 assert.equal(normalizeContext({permission:'prohibited'}).observed_use,'unknown');
});
test('Coverage cannot claim completeness without a boundary; malformed context is rejected',()=>{
 for(const value of [null,[],true,{phase:'exam'},{permission:true},{observed_use:false},{capture:'complete_within_boundary'},{capture_boundary:''},{extra:'guessed'}])assert.throws(()=>normalizeContext(value));
});
test('All five explicit lifecycle states remain distinct without inferring later states',()=>{
 assert.equal(fixtureRun.records.length,5);assert.equal(fixtureRun.summary.unit,'assistance_lifecycle_events');
 assert.deepEqual(fixtureRun.records.map(record=>record.entries[0].event.data.lifecycle.event_type),['help_requested','help_generated','help_transmitted','help_displayed','learner_response_observed']);
 for(const record of fixtureRun.records){const event=record.entries[0].event;assert.equal(event.name,'qlm_import:assistance_lifecycle_observed');assert.deepEqual(event.actor,{role:'system',kind:'software',id:'QLM-transformer'});assert.equal(event.data.original_source_timestamp,null);assert.equal(event.data.time_basis,'import_time');assert.equal(Object.hasOwn(event.data,'read'),false);assert.equal(Object.hasOwn(event.data,'learned'),false);}
});
test('Synthetic fixture is unmistakably separate from authenticated empirical research',()=>{
 assert.equal(fixtureRun.sourceKind,'synthetic_fixture');assert.equal(fixtureRun.sourceVerified,false);assert.equal(sourceKind(fixtureRun),'synthetic_fixture');
 const dataset=createDataset([fixtureRun]);assert.equal(dataset.inputs[0].synthetic_fixture,true);assert.equal(dataset.inputs[0].reference_release,null);assert.equal(dataset.pooling_compatibility.eligible,false);
 assert.match(createCSV([fixtureRun]),/synthetic_fixture/);
});
test('Explicit unknown origin and native hint depth are not converted to delivery order',async()=>{
 const row={...fixture[0],event_type:'help_displayed',native_hint_depth:3};delete row.delivery_order;delete row.request_origin;
 const run=await transform(input([row])),data=run.records[0].entries[0].event.data;
 assert.equal(data.lifecycle.request_event_id,null);assert.equal(data.lifecycle.request_origin,'unknown');assert.equal(data.lifecycle.native_hint_depth,3);assert.equal(data.lifecycle.delivery_order,null);
});
test('Declared source clock is preserved separately from import clock and phase is not inferred',async()=>{
 const row={...fixture[0],source_timestamp:'2025-01-01T12:30:00Z'};delete row.context;
 const run=await transform(input([row])),entry=run.records[0].entries[0];assert.equal(entry.time,time);assert.equal(entry.event.data.original_source_timestamp,row.source_timestamp);assert.equal(entry.event.data.lifecycle.source_timestamp,row.source_timestamp);assert.equal(entry.event.data.assistance_context.phase,'unknown');
});
test('Native event identity is stable across imports, revisions and key changes, while subject is source scoped',async()=>{
 const first=await transform(input([fixture[0]])),again=await transform({...input([{...fixture[0],source_revision:1}]),secret:'z'.repeat(32)});
 assert.equal(first.records[0].entries[0].event.data.provenance.native_identity_sha256,again.records[0].entries[0].event.data.provenance.native_identity_sha256);
 const other=await transform(input([{...fixture[0],source_id:'second-source'}]));assert.notEqual(first.records[0].header.subject,other.records[0].header.subject);
 assert.equal(aggregate([first,other]).products.length,2);assert.notEqual(aggregate([first,other]).products[0].sourceNamespace,aggregate([first,other]).products[1].sourceNamespace);
});
test('Ambiguous native identities, boolean revisions, unsupported states and conflicting origins are rejected',async()=>{
 const invalid=[{source_revision:true},{source_revision:-1},{event_type:'read'},{event_type:'learned'},{source_id:''},{event_id:1},{source_timestamp:'yesterday'},{native_hint_depth:true},{delivery_order:0},{request_origin:'unsolicited',request_event_id:'fixture-event-1'}];
 for(const patch of invalid)await assert.rejects(transform(input([{...fixture[0],...patch}])));
 await assert.rejects(transform(input([fixture[0],fixture[0]])),/Repeated native/);
 await assert.rejects(transform(input([fixture[0],{...fixture[1],source_id:'different'}])),/one source_id/);
});
test('A same-batch request link must resolve to a request by the same learner and activity',async()=>{
 await assert.rejects(transform(input([{...fixture[0],event_type:'help_generated'},fixture[1]])),/Request link/);
 await assert.rejects(transform(input([fixture[0],{...fixture[1],activity_id:'different-task'}])),/Request link/);
 const unresolved=await transform(input([{...fixture[1],request_event_id:'not-in-this-batch'}]));assert.equal(unresolved.records[0].entries[0].event.data.lifecycle.request_event_id,'not-in-this-batch');
});
test('Schema interpretation and semantic profile are bound in hashed headers and verified',async()=>{
 const record=fixtureRun.records[0],header=record.header;
 assert.equal(header.semantic_profile_binding.sha256,await digest(ASSISTANCE_CONTEXT_PROFILE));assert.equal(header.event_schema_bindings[0].sha256,await digest(LIFECYCLE_EVENT_SCHEMA));
 for(const mutate of [d=>d.records[0].event_schemas[0]='https://example.invalid/reinterpret.json',d=>d.records[0].header.semantic_profile_binding.sha256='0'.repeat(64),d=>d.records[0].header.event_schema_bindings[0].sha256='0'.repeat(64),d=>d.records[0].header.semantic_mapping.target_unit='changed']){const changed=clone(fixtureRun.document);mutate(changed);await assert.rejects(verify(changed));}
});
const review={status:'independently_reviewed',reviewer:'SYNTHETIC TEST reviewer declaration',scope:'SYNTHETIC unit-test compatibility only',reference:'https://example.invalid/review-fixture'};
const declared={source_id:'source-a',source_kind:'declaration_test_only',mapping:{...getSemanticContract('explicit-assistance-events'),review,coverage:{status:'complete_within_boundary',boundary:'same operational capture definition'}},context:{phase:'practice',permission:'permitted',observed_use:'recorded',capture:'complete_within_boundary',capture_boundary:'same operational capture definition'}};
const pair=()=>[clone(declared),{...clone(declared),source_id:'source-b'}];
test('Compatibility screen can pass complete declarations without claiming verified review or causal validity',()=>{
 const result=assessPoolingCompatibility(pair());assert.equal(result.eligible,true);assert.equal(result.source_strata.length,2);assert.match(result.limitations.join(' '),/does not validate declarations/);assert.match(result.limitations.join(' '),/causal effects/);
});
test('Every required measurement dimension independently blocks pooling when missing or incompatible',()=>{
 for(const key of ['measurement_profile','target_unit','denominator','coding_method','source_unit','definition'])for(const value of [undefined,'',false,[],{}]){const inputs=pair();if(value===undefined)delete inputs[1].mapping[key];else inputs[1].mapping[key]=value;assert.equal(assessPoolingCompatibility(inputs).eligible,false,key+' '+JSON.stringify(value));}
 for(const key of ['measurement_profile','target_unit','denominator','coding_method']){const inputs=pair();inputs[1].mapping[key]='different';assert.equal(assessPoolingCompatibility(inputs).eligible,false,key);}
});
test('Unreviewed, undocumented, synthetic and malformed descriptors are blocked without crashing',()=>{
 for(const patch of [{review:null},{review:{status:'independently_reviewed'}},{review:{...review,reference:'javascript:alert(1)'}},{coverage:null},{coverage:{status:'complete_within_boundary',boundary:true}},{transformations:[]},{information_loss:'none'}]){const inputs=pair();Object.assign(inputs[1].mapping,patch);assert.equal(assessPoolingCompatibility(inputs).eligible,false);}
 for(const value of [null,false,[],1,'text',{source_id:'x',mapping:null},{source_id:'x',mapping:true},{source_id:'x',mapping:clone(declared.mapping),context:[]},{source_id:'x',mapping:clone(declared.mapping),context:{phase:true}}])assert.equal(assessPoolingCompatibility([declared,value]).eligible,false);
 const inputs=pair();inputs[1].source_kind='synthetic_fixture';assert.equal(assessPoolingCompatibility(inputs).eligible,false);
 const same=pair();same[1].source_id=same[0].source_id;assert.equal(assessPoolingCompatibility(same).eligible,false);
});
test('Real-source mappings identify semantic losses and block heterogeneous pooling',async()=>{
 const runs=await Promise.all(['tutormoments','oatutor'].map(profileId=>transform({profileId,text:getSample(profileId),sourceName:profileId==='oatutor'?'a.csv':'a.jsonl',secret:key,importedAt:time})));
 const result=assessPoolingCompatibility(runs);assert.equal(result.eligible,false);assert.ok(result.reasons.some(reason=>reason.code==='target_unit_incompatible'));assert.ok(result.reasons.some(reason=>reason.code==='mapping_unreviewed'));
 for(const run of runs){assert.ok(run.semanticContract.information_loss.length);assert.equal(run.semanticContract.review.status,'implementation_checked_not_independently_reviewed');for(const record of run.records)for(const entry of record.entries){assert.equal(entry.event.actor.kind,'software');assert.equal(entry.event.data.original_source_timestamp,null);assert.equal(entry.event.data.assistance_context.observed_use,'unknown');}}
});

test('Public source attribution and schema contracts are immutable module definitions',async()=>{
 const {ALL_PROFILES}=await import('../dist/engine.mjs');const profile=ALL_PROFILES.find(item=>item.id==='oatutor');
 assert.throws(()=>{profile.source.sampleSha256='0'.repeat(64);},TypeError);assert.throws(()=>{ASSISTANCE_CONTEXT_PROFILE.version='changed';},TypeError);
});
test('Conflicting request revisions are rejected regardless of source array order',async()=>{
 const rows=[fixture[0],{...fixture[0],source_revision:1,event_type:'help_generated'},fixture[3]];
 for(const order of [rows,[rows[1],rows[0],rows[2]],[rows[2],rows[0],rows[1]]])await assert.rejects(transform(input(order)),/Request link/);
});
test('Explicit context primitives and oversize native identifiers are rejected',async()=>{
 for(const context of [null,false,0,''])await assert.rejects(transform(input([{...fixture[0],context}])));
 for(const field of ['subject_id','source_id','event_id','activity_id','request_event_id','assistance_id'])await assert.rejects(transform(input([{...fixture[0],[field]:'x'.repeat(513)}])));
});
test('Contradictory operational definitions cannot pass on matching labels',()=>{
 const inputs=pair();inputs[0].mapping.definition='Count requests made by a learner';inputs[1].mapping.definition='Count explanations generated by a tutor';
 assert.equal(assessPoolingCompatibility(inputs).eligible,false);assert.ok(assessPoolingCompatibility(inputs).reasons.some(reason=>reason.code==='definition_incompatible'));
});

test('Rehashed lifecycle provenance cannot contradict source kind, native identity or revision',async()=>{
 for(const mutate of [event=>event.data.provenance.source_kind='verified_public_sample',event=>event.data.provenance.native_identity_sha256='0'.repeat(64),event=>event.data.provenance.source_revision=9]){
  const document=clone(fixtureRun.document),record=document.records[0];mutate(record.entries[0].event);
  const recordHash=await digest(record.header);let previous=recordHash;
  for(const entry of record.entries){entry.event_hash=await digest(entry.event);entry.prev_hash=previous;entry.entry_hash=await digest({record_hash:recordHash,seq:entry.seq,time:entry.time,event_hash:entry.event_hash,prev_hash:entry.prev_hash});previous=entry.entry_hash;}
  await assert.rejects(verify(document));
 }
});
