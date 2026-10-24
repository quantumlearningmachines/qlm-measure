// Sandpiper (National Tutoring Observatory) PER_UTTERANCE utterances-CSV adapter.
// The bundled input is a SYNTHETIC fixture built from Sandpiper's documentation examples (MIT).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {transform,verify,digest,subjectId,getSample,parseInput,ALL_PROFILES,ADAPTER_PROFILES,PROFILES} from '../dist/engine.mjs';
import {SEMANTIC_PROFILES,ASSISTANCE_CONTEXT_PROFILE,SANDPIPER_EVENT_SCHEMA,semanticProfileFor,getSemanticContract} from '../dist/research-semantics.mjs';

const key='sandpiper-test-key-only-not-for-production-0001',tenant='sandpiper-test',importedAt='2026-10-24T00:00:00Z';
const STAGES=['requested','offered','generated','transmitted','displayed','accepted'];
const NOT_RECORDED=Object.fromEntries(STAGES.map(s=>[s,'not_recorded']));
const BASE='_id,session_id,sequence_id,role,content,start_time,end_time';
const profile=ADAPTER_PROFILES.find(p=>p.id==='sandpiper');
const sampleBytes=readFileSync(new URL('../dist/samples/sandpiper-SYNTHETIC.csv',import.meta.url));
const run=text=>transform({profileId:'sandpiper',text,sourceName:'export.csv',secret:key,tenant,importedAt});
const sample=()=>transform({profileId:'sandpiper',text:getSample('sandpiper'),sourceName:profile.sampleName,secret:key,tenant,importedAt});
const binding=async p=>({id:p.profile_id??p.$id,...(p.version?{version:p.version}:{}),sha256:await digest(p),hash_basis:'RFC8785'});
async function rechain(record){
  const recordHash=await digest(record.header);let prev=recordHash;
  for(const [i,entry]of record.entries.entries()){entry.seq=i+1;entry.event_hash=await digest(entry.event);entry.prev_hash=prev;entry.entry_hash=await digest({record_hash:recordHash,seq:entry.seq,time:entry.time,event_hash:entry.event_hash,prev_hash:entry.prev_hash});prev=entry.entry_hash;}
}

test('Sandpiper is an engine adapter, labeled SYNTHETIC, and not added to the demo page list',()=>{
  assert.deepEqual(ALL_PROFILES.map(p=>p.id),['tutormoments','oatutor','explicit-assistance-events']);
  assert.deepEqual(PROFILES.map(p=>p.id),['tutormoments','oatutor']);
  assert.deepEqual(ADAPTER_PROFILES.map(p=>p.id),['tutormoments','oatutor','explicit-assistance-events','sandpiper']);
  assert.equal(profile.mode,'annotated_dialogue');assert.equal(profile.mapping.platform,'sandpiper');
  assert.match(profile.name,/SYNTHETIC/);assert.match(profile.source.summary,/SYNTHETIC/);
  assert.equal(profile.source.kind,'synthetic_contract_fixture');
  assert.match(profile.source.license,/MIT/);assert.match(profile.source.license,/National Tutoring Observatory/);
  assert.match(profile.source.url,/National-Tutoring-Observatory\/sandpiper/);
  assert.ok(profile.source.limitations.some(x=>/SYNTHETIC/.test(x)));
  assert.equal(profile.source.sampleSha256,undefined);
  assert.equal(getSample('sandpiper'),sampleBytes.toString('utf8'));
  assert.equal(createHash('sha256').update(sampleBytes).digest('hex'),profile.source.fixtureSha256);
  assert.ok(Object.isFrozen(profile)&&Object.isFrozen(profile.source.limitations));
});

test('The browser profile matches the Python profile file exactly',()=>{
  const python=JSON.parse(readFileSync(new URL('../../../integrations/airflow/profiles/sandpiper.json',import.meta.url),'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(profile)),python);
  assert.deepEqual(readFileSync(new URL('../../../integrations/airflow/tests/fixtures/sandpiper-SYNTHETIC.csv',import.meta.url)),sampleBytes);
});

test('Profile v0.2.0 only adds the sandpiper contract; existing platforms keep v0.1.0',async()=>{
  const [old,newer]=SEMANTIC_PROFILES;
  assert.equal(old,ASSISTANCE_CONTEXT_PROFILE);
  assert.deepEqual([old.version,newer.version],['0.1.0','0.2.0']);
  assert.equal(newer.profile_id,'qlm:assistance-context:0.2.0');
  assert.equal(newer.$id,'https://transformer.quantumlearningmachines.com/schemas/assistance-context-v0.2.0.json');
  for(const k of new Set([...Object.keys(old),...Object.keys(newer)]))if(!['$id','profile_id','version','semantics'].includes(k))assert.deepEqual(newer[k],old[k],k);
  const {sandpiper,...rest}=newer.semantics;assert.deepEqual(rest,old.semantics);assert.ok(sandpiper);
  assert.equal(old.semantics.sandpiper,undefined);
  for(const id of ['tutormoments','oatutor','explicit-assistance-events'])assert.equal(semanticProfileFor(id),old);
  assert.equal(semanticProfileFor('sandpiper'),newer);
  assert.throws(()=>semanticProfileFor('unknown'),/No versioned semantic mapping/);
  for(const [file,value]of [['assistance-context-v0.1.0.json',old],['assistance-context-v0.2.0.json',newer],['sandpiper-utterance-v1.json',SANDPIPER_EVENT_SCHEMA]]){
    const published=JSON.parse(readFileSync(new URL('../dist/schemas/'+file,import.meta.url),'utf8'));
    assert.equal(await digest(published),await digest(value),file);
    const python=JSON.parse(readFileSync(new URL('../../../integrations/airflow/src/qlm_airflow/resources/'+file,import.meta.url),'utf8'));
    assert.equal(await digest(python),await digest(value),file);
  }
});

test('The sandpiper contract is explicit, partial, unreviewed and records no help stage',()=>{
  const c=getSemanticContract('sandpiper');
  assert.equal(c.source_unit,'sandpiper_session');assert.equal(c.target_unit,'dialogue_turn');
  assert.equal(c.coverage.status,'partial');assert.ok(c.coverage.boundary.trim());
  assert.equal(c.review.status,'implementation_checked_not_independently_reviewed');
  assert.match(c.coding_method,/inferred/);
  assert.equal(c.measurement_profile,null);assert.equal(c.denominator,null);
  assert.ok(c.transformations.length&&c.information_loss.length);
  assert.deepEqual(c.assistance_stages,NOT_RECORDED);
});

test('Sample: SYNTHETIC fixture, one record per session, entries in sequence order',async()=>{
  const r=await sample();
  assert.equal(r.sourceKind,'synthetic_fixture');assert.equal(r.sourceVerified,false);
  assert.deepEqual(r.summary,{inputRowCount:8,rowCount:8,recordCount:2,eventCount:8,unit:'transcript_utterances',eventTypes:{'qlm_import:transcript_utterance_observed':8},missingMetricCount:0,assistanceUnknownCount:0});
  assert.equal(r.sourceNamespace,'sandpiper');
  const newer=SEMANTIC_PROFILES[1];
  for(const [i,[session,seq]]of [['session_001',['1','2','3','4','5','6']],['session_002',['1','2']]].entries()){
    const record=r.records[i],h=record.header;
    assert.equal(h.subject,await subjectId('sandpiper',tenant,session,key));
    assert.deepEqual([h.source_platform,h.import_mode,h.record_scope,h.source_kind],['sandpiper','annotated_dialogue','sandpiper_session','synthetic_fixture']);
    assert.equal(h.event_order_basis,'source_sequence_id_numeric_order');
    assert.equal(h.assistance_coverage,'source_dialogue_and_inferred_codes_only_no_help_stage_recorded');
    assert.equal(h.subject_scope,profile.subjectScope);
    assert.deepEqual(h.semantic_profile_binding,await binding(newer));
    assert.deepEqual(h.semantic_mapping,getSemanticContract('sandpiper'));
    assert.deepEqual(h.event_schema_bindings,[{id:SANDPIPER_EVENT_SCHEMA.$id,sha256:await digest(SANDPIPER_EVENT_SCHEMA),hash_basis:'RFC8785'}]);
    assert.deepEqual(record.event_schemas,[SANDPIPER_EVENT_SCHEMA.$id]);
    assert.equal(h.source_provenance,undefined);
    assert.deepEqual(record.entries.map(e=>e.event.data.utterance.sequence_id),seq);
    for(const e of record.entries){assert.equal(e.event.name,'qlm_import:transcript_utterance_observed');assert.deepEqual(e.event.activity,{id:session});assert.deepEqual(e.event.actor,{role:'system',kind:'software',id:'QLM-transformer'});assert.equal(e.time,importedAt);}
  }
  const changed=await run(getSample('sandpiper')+'\n');
  assert.equal(changed.sourceKind,'unverified_user_input');
  assert.ok(changed.records.every(x=>x.header.source_kind==='unverified_user_input'));
});

test('Rows are ordered by numeric sequence_id, sessions by first appearance',async()=>{
  const r=await run(BASE+'\nb,s2,2,Student,later,,\na,s1,10,Tutor,ten,,\nc,s1,9,Student,nine,,\nd,s2,1,Tutor,first,,\ne,s1,1,Tutor,one,,\n');
  assert.deepEqual(r.records.map(x=>x.entries[0].event.activity.id),['s2','s1']);
  assert.deepEqual(r.records.map(x=>x.entries.map(e=>e.event.data.utterance.sequence_id)),[['1','2'],['1','9','10']]);
  assert.deepEqual(r.records.map(x=>x.entries.map(e=>e.event.data.provenance.source_row)),[[4,1],[5,3,2]]);
});

test('Utterances keep source text and unparsed time strings; empty times become null',async()=>{
  const r=await sample(),rows=parseInput(getSample('sandpiper'),'x.csv');
  const first=r.records[0].entries[0].event.data;
  assert.deepEqual(first.utterance,{_id:'0',session_id:'session_001',sequence_id:'1',role:'Tutor',content:"Hello! Today we're going to work on fractions.",start_time:'00:00:00',end_time:'00:00:05'});
  assert.deepEqual({...first.raw_source_fields},{...rows[0]});
  assert.deepEqual(first.provenance,{platform:'sandpiper',source_kind:'synthetic_fixture',source_sha256:createHash('sha256').update(sampleBytes).digest('hex'),source_row:1,source_record_sha256:await digest(rows[0]),imported_at:importedAt,mapping_sha256:await digest(profile.mapping)});
  assert.deepEqual([first.time_basis,first.source_time_basis,first.original_source_timestamp],['import_time','source_strings_unparsed',null]);
  assert.deepEqual([first.reported_metrics,first.missing_metrics],[{},[]]);
  assert.deepEqual(r.records[1].entries[1].event.data.utterance,{_id:'1',session_id:'session_002',sequence_id:'2',role:'Student',content:"Hello! I've been practicing.",start_time:null,end_time:null});
  const odd=await run(BASE+'\nx,s,1,Tutor,hi,  0:01 ,yesterday-ish\n');
  assert.deepEqual([odd.records[0].entries[0].event.data.utterance.start_time,odd.records[0].entries[0].event.data.utterance.end_time],['  0:01 ','yesterday-ish']);
});

test('Any nonempty role label is kept exactly',async()=>{
  const r=await run(BASE+'\n0,s,1,Teacher,a,,\n1,s,2,STUDENT_1,b,,\n2,s,3, tutor ,c,,\n3,s,4,Tutor,,,\n');
  const d=r.records[0].entries.map(e=>e.event.data);
  assert.deepEqual(d.map(x=>x.utterance.role),['Teacher','STUDENT_1',' tutor ','Tutor']);
  assert.equal(d[3].utterance.content,'');
  assert.deepEqual([...new Set(d.map(x=>x.assistance))],['utterance_recorded_no_help_stage']);
});

test('Annotation codes are inferred assertions and never set a help stage',async()=>{
  const r=await sample(),d=r.records.flatMap(x=>x.entries.map(e=>e.event.data));
  assert.deepEqual(d[2].inferred_annotations,[{basis:'inferred',annotator:'AI-0',index:0,fields:{given_praise:'Great!'}}]);
  assert.deepEqual(d.map(x=>x.inferred_annotations.length),[0,0,1,0,0,0,0,0]);
  for(const x of d){assert.equal(x.assistance,'utterance_recorded_no_help_stage');assert.deepEqual(x.assistance_stages,NOT_RECORDED);assert.equal(x.help_evidence,undefined);assert.equal(x.lifecycle,undefined);assert.equal(x.assistance_context.observed_use,'unknown');}
});

test('Annotator name, slot index, fields and identifiedBy are kept in column order',async()=>{
  const header=BASE+',annotator[joe][0]TUTOR_MOVE,annotator[joe][1]TUTOR_MOVE,annotator[joe][0]identifiedBy,annotator[AI-0][0]TUTOR_MOVE,annotator[AI-0][0]reasoning,annotator[AI-0][0]identifiedBy,annotator[a]b][0]x';
  const r=await run(header+'\n0,s,1,Tutor,What do you notice?,,,PROBING_UNDERSTAND,GIVING_HINT,HUMAN,GIVING_HINT,asks a question,AI,\n1,s,2,Student,Oh,,,,,,,,,odd name\n');
  const [first,second]=r.records[0].entries.map(e=>e.event.data.inferred_annotations);
  assert.deepEqual(first,[{basis:'inferred',annotator:'joe',index:0,fields:{TUTOR_MOVE:'PROBING_UNDERSTAND'},identifiedBy:'HUMAN'},{basis:'inferred',annotator:'joe',index:1,fields:{TUTOR_MOVE:'GIVING_HINT'}},{basis:'inferred',annotator:'AI-0',index:0,fields:{TUTOR_MOVE:'GIVING_HINT',reasoning:'asks a question'},identifiedBy:'AI'}]);
  assert.deepEqual(second,[{basis:'inferred',annotator:'a]b',index:0,fields:{x:'odd name'}}]);
  const only=await run(BASE+',annotator[AI-0][0]identifiedBy\n0,s,1,Tutor,hi,,,AI\n');
  assert.deepEqual(only.records[0].entries[0].event.data.inferred_annotations,[{basis:'inferred',annotator:'AI-0',index:0,fields:{},identifiedBy:'AI'}]);
});

test('Pooling screens a sandpiper run by its own contract and blocks it',async()=>{
  const {assessPoolingCompatibility}=await import('../dist/research-semantics.mjs');
  const r=await sample();
  const report=assessPoolingCompatibility([{profile:{id:'sandpiper'},sourceKind:'synthetic_fixture',records:r.records},{profile:{id:'not-an-adapter'},records:[]}]);
  assert.equal(report.eligible,false);
  assert.equal(report.source_strata[0].signature.coding_method,getSemanticContract('sandpiper').coding_method);
  assert.ok(report.reasons.some(x=>x.source_id==='sandpiper'&&x.code==='synthetic_fixture'));
  assert.ok(report.reasons.some(x=>x.source_id==='not-an-adapter'&&x.code==='source_unit_unknown'));
});

test('Same sequence_id in different sessions is allowed',async()=>{
  assert.equal((await run(BASE+'\n0,a,1,Tutor,x,,\n0,b,1,Tutor,y,,\n')).records.length,2);
});

test('Invalid exports are rejected with clear errors',async()=>{
  const good='0,s,1,Tutor,hi,,';
  const cases=[
    ['_id,session_id,role,content,start_time,end_time\n0,s,Tutor,hi,,',/missing Sandpiper utterance column/],
    [BASE+',notes\n'+good+',x',/neither a Sandpiper utterance column nor/],
    [BASE+',annotator[joe]TUTOR_MOVE\n'+good+',x',/neither a Sandpiper utterance column nor/],
    [BASE+',annotator[][0]x\n'+good+',x',/neither a Sandpiper utterance column nor/],
    [BASE+',annotator[joe][01]x\n'+good+',x',/neither a Sandpiper utterance column nor/],
    [BASE+',annotator[joe][0]\n'+good+',x',/neither a Sandpiper utterance column nor/],
    [BASE+',annotator[joe][9007199254740992]x\n'+good+',x',/annotation index/],
    [BASE+'\n0,s,1,Tutor,hi,,\n1,s,1,Student,hey,,',/unique within a session/],
    [BASE+'\n0,s,1,,hi,,',/role/],
    [BASE+'\n0,,1,Tutor,hi,,',/session_id/],
    [BASE+'\n0,   ,1,Tutor,hi,,',/session_id/],
    [BASE+'\n0,s,,Tutor,hi,,',/positive integer string/],
  ];
  for(const s of ['0','01','1.0','-1','abc',' 1','１','+1','1e3'])cases.push([BASE+'\n0,s,'+s+',Tutor,hi,,',/positive integer string/]);
  for(const [text,message]of cases)await assert.rejects(()=>run(text+'\n'),message,text);
  const row={_id:'0',session_id:'s',sequence_id:1,role:'Tutor',content:'hi',start_time:'',end_time:''};
  for(const bad of [row,{...row,sequence_id:'1',content:null},{...row,sequence_id:'1','annotator[a][0]x':3}])
    await assert.rejects(()=>transform({profileId:'sandpiper',text:JSON.stringify([bad]),sourceName:'x.json',secret:key,tenant,importedAt}),/text/);
});

test('Verifier rejects reinterpretation even with a recalculated chain',async()=>{
  const base=await sample();
  assert.deepEqual(await verify(base.document),base.checkpoint);
  const ann=d=>d.records[0].entries[2].event.data;
  const mutations={
    observed_basis:d=>{ann(d).inferred_annotations[0].basis='observed';},
    help_stage_recorded:d=>{ann(d).assistance_stages.displayed='recorded';},
    stage_none:d=>{ann(d).assistance_stages.offered='none';},
    stage_missing:d=>{delete ann(d).assistance_stages.accepted;},
    added_code:d=>{d.records[0].entries[0].event.data.inferred_annotations.push({basis:'inferred',annotator:'AI-0',index:0,fields:{given_praise:'Hello'}});},
    dropped_code:d=>{ann(d).inferred_annotations=[];},
    changed_code:d=>{ann(d).inferred_annotations[0].fields.given_praise='GIVING_HINT';},
    role_differs_from_source:d=>{ann(d).utterance.role='Student';},
    content_differs_from_source:d=>{ann(d).utterance.content='Changed';},
    time_parsed:d=>{ann(d).utterance.start_time='2026-01-01T00:00:08Z';},
    empty_time_kept_as_blank:d=>{d.records[1].entries[0].event.data.utterance.start_time='';},
    raw_row_digest:d=>{ann(d).raw_source_fields.content='Changed';},
    help_label:d=>{ann(d).assistance='tutor_utterance_recorded';},
    absolute_time:d=>{ann(d).original_source_timestamp='2026-01-01T00:00:00Z';},
    session_differs_from_activity:d=>{ann(d).utterance.session_id='session_002';},
    out_of_order:d=>{d.records[0].entries.reverse();},
    duplicate_sequence:d=>{d.records[0].entries[1].event.data.utterance.sequence_id='1';},
    extra_data_field:d=>{ann(d).help_evidence={condition:'ChatGPT'};},
    import_mode:d=>{d.records[0].header.import_mode='dialogue';},
    mapping:d=>{d.records[0].header.semantic_mapping.coverage={status:'complete_within_boundary',boundary:'x'};},
    old_profile:async d=>{d.records[0].header.semantic_profile_binding=await binding(ASSISTANCE_CONTEXT_PROFILE);},
    schema:d=>{d.records[0].header.event_schema_bindings[0].id='https://transformer.quantumlearningmachines.com/schemas/research-import-v2.json';},
    coverage_declaration:d=>{d.records[0].header.assistance_coverage='explicit_source_lifecycle_assertions_only';},
    order_declaration:d=>{d.records[0].header.event_order_basis='input_row_order_not_independently_verified';},
    raw_unknown_column:d=>{ann(d).raw_source_fields.notes='x';},
    activity_renamed:d=>{d.records[0].entries[2].event.activity.id='session_002';},
    repeated_entry:d=>{d.records[0].entries.splice(1,0,JSON.parse(JSON.stringify(d.records[0].entries[0])));},
    extra_event_field:d=>{d.records[0].entries[2].event.instrument={id:'x'};},
    second_session:d=>{d.records[0].entries.push(JSON.parse(JSON.stringify(d.records[1].entries[1])));},
    verified_claim:d=>{d.records[0].header.source_kind='verified_public_sample';for(const e of d.records[0].entries)e.event.data.provenance.source_kind='verified_public_sample';},
  };
  const control=JSON.parse(JSON.stringify(base.document));
  for(const record of control.records)await rechain(record);
  await verify(control);
  for(const [name,mutate]of Object.entries(mutations)){
    const changed=JSON.parse(JSON.stringify(base.document));
    await mutate(changed);
    for(const record of changed.records)await rechain(record);
    // The chain is recalculated, so a rejection must come from interpretation, not from hashes.
    await assert.rejects(()=>verify(changed),error=>!/hash mismatch|Broken LearnLog sequence/.test(error.message),name);
  }
});
