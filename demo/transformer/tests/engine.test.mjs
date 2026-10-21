import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {transform,verify,canonicalize,digest,sha256,subjectId,parseStrictJSON,parseCSV,parseInput,aggregate,getSample,PROFILES,ENGINE_VERSION,IMPORT_SCHEMA} from '../dist/engine.mjs';

const KEY='k'.repeat(32),TIME='2026-10-17T00:30:00Z';
const clean=v=>JSON.parse(JSON.stringify(v));
const profile=id=>PROFILES.find(p=>p.id===id);
const options=id=>({profileId:id,text:getSample(id),sourceName:profile(id).sampleName,secret:KEY,tenant:'test',importedAt:TIME});
const tmRows=parseInput(getSample('tutormoments'),profile('tutormoments').sampleName);
const oatRows=parseInput(getSample('oatutor'),profile('oatutor').sampleName);
const tm=await transform(options('tutormoments')),oat=await transform(options('oatutor'));
const dialogueInput=row=>({...options('tutormoments'),text:JSON.stringify([row]),sourceName:'test.json'});
const summaryInput=rows=>({...options('oatutor'),text:JSON.stringify(rows),sourceName:'test.json'});

test('Built-in adapters are two differently structured, verified research sources',()=>{
  assert.equal(PROFILES.length,2);assert.deepEqual(PROFILES.map(p=>p.mode),['dialogue','summary']);
  assert.ok(Array.isArray(tmRows[0].turns));assert.equal(typeof tmRows[0].session,'object');
  assert.equal(Array.isArray(oatRows[0].turns),false);assert.equal(oatRows[0].condition,'ChatGPT');
  assert.equal(tmRows.length,2);assert.equal(oatRows.length,12);
});
test('Embedded samples equal downloadable source excerpt bytes and metadata hashes',async()=>{
  for(const p of PROFILES){const bytes=readFileSync(new URL('../dist/samples/'+p.sampleName,import.meta.url));assert.equal(getSample(p.id),bytes.toString('utf8'));assert.equal(await sha256(bytes),p.source.sampleSha256);}
});
test('Real dialogue turns become 310 events in two session records',()=>{
  assert.equal(tm.summary.inputRowCount,2);assert.equal(tm.summary.rowCount,310);assert.equal(tm.summary.eventCount,310);assert.equal(tm.summary.recordCount,2);assert.equal(tm.summary.unit,'dialogue_turns');
  assert.equal(tm.summary.eventTypes['qlm_import:dialogue_turn_observed'],310);
  for(const [i,record]of tm.records.entries()){
    assert.equal(record.entries.length,tmRows[i].turns.length);
    assert.equal(record.header.import_mode,'dialogue');assert.equal(record.header.producer.version,ENGINE_VERSION);assert.equal(record.header.subject_scope,'dataset + tenant + key');assert.equal(record.header.record_scope,'transcript_session');
    assert.deepEqual(record.event_schemas,[IMPORT_SCHEMA]);
    for(const [j,entry]of record.entries.entries()){
      const turn=tmRows[i].turns[j];assert.deepEqual(clean(entry.event.data.dialogue),clean(turn));assert.deepEqual(clean(entry.event.data.raw_source_fields.turn),clean(turn));
      assert.deepEqual(entry.event.actor,{role:'system',kind:'software',id:'QLM-transformer'});assert.equal(entry.event.data.dialogue.role,turn.role);
      assert.equal(entry.event.data.assistance,turn.role==='Tutor'?'tutor_utterance_recorded':'student_utterance_recorded');
      assert.equal(entry.event.data.provenance.source_field_path,'turns['+j+']');assert.equal(entry.event.data.provenance.source_row,i+1);
    }
  }
});
test('Recorded request and tutor response are retained without invented semantic labels',()=>{
  const entries=tm.records[0].entries;assert.equal(entries[26].event.data.dialogue.text,'I need help on nine.');
  assert.equal(entries[26].event.data.dialogue.role,'Student');assert.equal(entries[27].event.data.dialogue.role,'Tutor');
  assert.equal(entries[32].event.data.dialogue.text,"Yeah, so what's the opposite of subtraction?");
  for(const entry of entries)assert.deepEqual(Object.keys(entry.event.data).sort(),['assistance','assistance_context','dialogue','missing_metrics','original_source_timestamp','provenance','raw_source_fields','reported_metrics','source_time_basis','time_basis']);
  assert.equal(entries[0].event.data.assistance,'tutor_utterance_recorded'); // Greeting is not classified as scaffolding.
});
test('No absolute source clock is fabricated from relative transcript offsets',()=>{
  for(const record of tm.records)for(const entry of record.entries){assert.equal(entry.time,TIME);assert.equal(entry.event.data.time_basis,'import_time');assert.equal(entry.event.data.source_time_basis,'relative_offsets_seconds');assert.equal('source_timestamp' in entry.event.data,false);}
  assert.equal(tm.records[0].entries[0].event.data.dialogue.start_seconds,614);
});
test('Source array order is retained even if turn numbers and offsets run backwards',async()=>{
  const row=clean(tmRows[0]);row.turns=[row.turns[32],row.turns[26]];const run=await transform(dialogueInput(row));
  assert.deepEqual(run.records[0].entries.map(e=>e.event.data.dialogue.turn_number),[33,27]);assert.equal(run.records[0].entries[0].seq,1);
});
test('Dialogue identifiers and model-generated enrichments are omitted from event fields',async()=>{
  const serialized=JSON.stringify(tm.document);
  for(const row of tmRows){assert.equal(serialized.includes(row.session.student_id),false);assert.equal(serialized.includes(row.session.tutor_id),false);assert.equal(serialized.includes(row.session.session_id),false);}
  for(const record of tm.records)for(const entry of record.entries){assert.equal('enrichments' in entry.event.data.raw_source_fields,false);assert.equal('eedi_content_link' in entry.event.data.raw_source_fields,false);assert.deepEqual(Object.keys(entry.event.data.raw_source_fields.session).sort(),['primary_language','prior_session_count','transcription_by']);}
  const row=clean(tmRows[0]);row.turns=[{...row.turns[0],student_id:'TEST-ID-MUST-NOT-LEAK'}];row.annotations='TEST-ANNOTATION-MUST-NOT-LEAK';
  const run=await transform(dialogueInput(row));assert.equal(JSON.stringify(run.document).includes('TEST-ID-MUST-NOT-LEAK'),false);assert.equal(JSON.stringify(run.document).includes('TEST-ANNOTATION-MUST-NOT-LEAK'),false);
});
test('Participant table preserves original columns and reports assignment, not help delivery',()=>{
  assert.equal(oat.summary.inputRowCount,12);assert.equal(oat.summary.eventCount,12);assert.equal(oat.summary.recordCount,12);assert.equal(oat.summary.assistanceUnknownCount,12);
  for(const [i,record]of oat.records.entries()){
    const event=record.entries[0].event,row=oatRows[i],data=event.data;
    assert.equal(record.header.subject_scope,'dataset + tenant + key');assert.equal(record.header.record_scope,'participant_summary');assert.equal(event.name,'qlm_import:participant_summary_observed');assert.deepEqual(event.actor,{role:'system',kind:'software',id:'QLM-transformer'});
    assert.equal(data.assistance,'assigned_condition_only');assert.deepEqual(data.help_evidence,{condition:row.condition,actual_help_use:'not_reported_in_participant_table'});
    assert.deepEqual(clean(data.raw_source_fields),Object.fromEntries(Object.entries(row).filter(([key])=>key!=='anonUserID')));
    assert.deepEqual(clean(data.reported_metrics),Object.fromEntries(Object.keys(profile('oatutor').metrics).map(key=>[key,row[key]])));
    assert.equal(Object.hasOwn(data.raw_source_fields,'anonUserID'),false);assert.equal(data.time_basis,'import_time');
  }
  assert.equal(oat.records[5].entries[0].event.data.help_evidence.condition,'No-hint control');assert.equal(oat.records[5].entries[0].event.data.assistance,'assigned_condition_only');
});
test('Missing source metrics remain explicit, with no substituted scores or usage',async()=>{
  const run=await transform(summaryInput([{anonUserID:'test-user',lesson:'test',condition:'ChatGPT',preTest:'',postTest:null}]));
  const d=run.records[0].entries[0].event.data;assert.deepEqual(clean(d.reported_metrics),{});assert.deepEqual(d.missing_metrics,Object.keys(profile('oatutor').metrics));assert.equal(d.assistance,'assigned_condition_only');
});
test('Verified sample provenance binds exact original-file row locators',()=>{
  for(const run of [tm,oat]){
    assert.equal(run.sourceVerified,true);assert.equal(run.sourceKind,'verified_public_sample');
    for(const [i,record]of run.records.entries()){
      assert.equal(record.header.source_kind,'verified_public_sample');assert.equal(record.header.source_provenance.sourceSha256,run.profile.source.sourceSha256);
      assert.equal(record.entries[0].event.data.provenance.source_file_row,run.profile.source.sourceRows[i]);assert.equal(record.entries[0].event.data.provenance.source_file_sha256,run.profile.source.sourceSha256);
    }
  }
});
test('A changed byte or fabricated caller sourceKind cannot confer published provenance',async()=>{
  const run=await transform({...options('oatutor'),text:getSample('oatutor')+'\r\n',sourceKind:'verified_public_sample'});
  assert.equal(run.sourceVerified,false);assert.equal(run.sourceKind,'unverified_user_input');assert.equal('source_provenance' in run.records[0].header,false);assert.equal('source_file_row' in run.records[0].entries[0].event.data.provenance,false);assert.notEqual(run.sourceHash,oat.sourceHash);
});
test('Renamed identical public sample remains an exact verified byte match',async()=>{const run=await transform({...options('oatutor'),sourceName:'renamed.csv'});assert.equal(run.sourceVerified,true);});
test('UTF-8 BOM and CRLF are hashed as exact original input bytes',async()=>{
  const text='\ufeff'+getSample('oatutor');const run=await transform({...options('oatutor'),text});assert.equal(run.sourceHash,createHash('sha256').update(text,'utf8').digest('hex'));assert.equal(run.sourceVerified,false);assert.equal(run.summary.rowCount,12);
});
test('Mixed-source aggregation counts event types and keeps measurement units distinct',()=>{
  const result=aggregate([tm,oat]);assert.equal(result.inputRowCount,14);assert.equal(result.rowCount,322);assert.equal(result.recordCount,14);assert.equal(result.eventCount,322);assert.equal(result.productCount,2);assert.equal(result.assistanceUnknownCount,12);
  assert.deepEqual(result.eventTypes,{'qlm_import:dialogue_turn_observed':310,'qlm_import:participant_summary_observed':12});
  assert.deepEqual(result.products.map(p=>p.unit),['dialogue_turns','participant_summaries']);assert.equal(result.products[0].metricSummaries.length,0);assert.equal(result.products[1].metricSummaries[0].values[0],'0.333');
  assert.equal('mean' in result,false);assert.equal('pooledScore' in result,false);assert.equal('rank' in result,false);
});
test('Two source sessions with the same subject produce separate scoped records',async()=>{
  const row=clean(tmRows[0]);row.turns=row.turns.slice(0,2);const run=await transform(dialogueInput(row));
  const second=clean(row);second.transcript_id='test-second-session';const both=await transform({...dialogueInput(row),text:JSON.stringify([row,second])});assert.equal(both.records.length,2);assert.equal(both.records[0].header.subject,both.records[1].header.subject);assert.equal(both.records[0].header.subject_scope,'dataset + tenant + key');assert.equal(both.records[1].header.subject_scope,'dataset + tenant + key');assert.equal(both.records[0].header.record_scope,'transcript_session');assert.equal(both.records[1].header.record_scope,'transcript_session');assert.notEqual(both.records[0].header.record_id,both.records[1].header.record_id);assert.equal(run.records.length,1);
});
test('Reimport has fresh record IDs and salts, without silently merging records',async()=>{
  const run=await transform(options('oatutor'));assert.notEqual(run.records[0].header.record_id,oat.records[0].header.record_id);assert.notEqual(run.records[0].entries[0].event.salt,oat.records[0].entries[0].event.salt);assert.equal(aggregate([oat,run]).recordCount,24);
});
test('HMAC matches independent Node cryptography and scopes source plus tenant',async()=>{
  const message='["test","example-source","42"]',expected='qlm:'+createHmac('sha256',KEY).update(message).digest('hex');
  assert.equal(await subjectId('example-source','test',42,KEY),expected);assert.equal(await subjectId('example-source','test','42',KEY),expected);
  assert.notEqual(await subjectId('a','test','42',KEY),await subjectId('b','test','42',KEY));assert.notEqual(await subjectId('a','one','42',KEY),await subjectId('a','two','42',KEY));
});
const digestVectors=[
 [{a:2,z:1},'c2985c5ba6f7d2a55e768f92490ca09388e95bc4cccb9fdf11b15f4d42f93e73'],
 [{"😀":1,"�":2,"\r":3,a:4},'e929103c1a5e72f96da2576ca59efe4ba8a8a739adb7e8d7930f8703c40dfc78'],
 [{numbers:[0,-0,1e-7,1e-6,1e20,1e21,333333333.3333333]},'608114ba586653bf1fb46990ac8c1db97a9562735aca817e65f5f7bc079373ad']
];
for(const [i,[value,expected]]of digestVectors.entries())test('RFC 8785 precomputed digest vector '+(i+1),async()=>assert.equal(await digest(value),expected));
test('Canonicalization rejects unsupported JSON and unpaired Unicode',()=>{assert.throws(()=>canonicalize({x:NaN}));assert.throws(()=>canonicalize({x:'\ud800'}));assert.throws(()=>canonicalize({x:undefined}));});
test('Edited dialogue event text fails chain verification',async()=>{const d=clean(tm.document);d.records[0].entries[0].event.data.dialogue.text='edited';await assert.rejects(verify(d),/hash mismatch/);});
test('Edited header fails chain verification',async()=>{const d=clean(oat.document);d.records[0].header.source_platform='other';await assert.rejects(verify(d));});
test('Tail deletion is detected against the independently stored checkpoint',async()=>{const d=clean(tm.document);d.records[0].entries.pop();await verify(d);await assert.rejects(verify(d,tm.checkpoint),/checkpoint mismatch/);});
test('Duplicate record IDs and unsupported truncation are rejected',async()=>{const d=clean(oat.document);d.records[1].header.record_id=d.records[0].header.record_id;await assert.rejects(verify(d),/Duplicate/);const t=clean(oat.document);t.records[0].truncated=true;await assert.rejects(verify(t),/truncated/);});
test('CSV quoted commas and embedded newlines preserve original strings',()=>assert.deepEqual(clean(parseCSV('id,lesson,score\r\n"one","Fractions, ratios","80"\r\n"two","Line\nbreak","70"\r\n')),[{id:'one',lesson:'Fractions, ratios',score:'80'},{id:'two',lesson:'Line\nbreak',score:'70'}]));
const badJSON=['{"a":1,"a":2}','{"n":NaN}','{"n":Infinity}','{"n":1e400}','{"n":9007199254740993}','{"s":"\\ud800"}','[1,]'];
for(const [i,text]of badJSON.entries())test('Reject malformed or lossy JSON '+(i+1),()=>assert.throws(()=>parseStrictJSON(text)));
test('Reject duplicate CSV headers',()=>assert.throws(()=>parseCSV('id,id\n1,2\n'),/unique/));
test('Reject malformed quoted CSV',()=>assert.throws(()=>parseCSV('id,lesson\n"1"oops,test\n')));
for(const id of ['true','false','null','1.0','1e2','{}','[]','""'])test('Reject invalid learner identifier '+id,async()=>assert.rejects(transform({...options('oatutor'),sourceName:'test.json',text:`[{"anonUserID":${id},"lesson":"test"}]`})));
test('Reject missing mapped activity',async()=>assert.rejects(transform(summaryInput([{anonUserID:'test'}])),/activity/));
test('Reject unknown source adapter',async()=>assert.rejects(transform({...options('oatutor'),profileId:'unknown'})));
test('Reject too-short pseudonym key',async()=>assert.rejects(transform({...options('oatutor'),secret:'short'}),/32 UTF-8 bytes/));
test('Reject invalid import calendar date',async()=>assert.rejects(transform({...options('oatutor'),importedAt:'2026-02-30T18:30:00Z'}),/calendar/));
test('Reject empty input',async()=>assert.rejects(transform({...options('oatutor'),sourceName:'empty.json',text:'[]'}),/1–5,000/));
test('Bound nested dialogue expansion before hashing events',async()=>{const row=clean(tmRows[0]);row.turns=Array.from({length:5001},(_,i)=>({...row.turns[0],turn_number:i+1}));await assert.rejects(transform(dialogueInput(row)),/5,000 dialogue turns/);});
test('Reject unsupported roles and impossible source offsets',async()=>{for(const update of [{role:'AI'},{start_seconds:-1},{end_seconds:0},{turn_number:1.5},{turn_number:0}]){const row=clean(tmRows[0]);row.turns=[{...row.turns[0],...update}];await assert.rejects(transform(dialogueInput(row)));}});

test('Reject duplicate source turn numbers instead of creating ambiguous locators',async()=>{const row=clean(tmRows[0]);row.turns=[row.turns[0],row.turns[0]];await assert.rejects(transform(dialogueInput(row)),/duplicate source turn_number/);});
test('Reject absent or undocumented participant assignment rather than imply observed help',async()=>{for(const condition of [undefined,'','LLM help',null,true])await assert.rejects(transform(summaryInput([{anonUserID:'test',lesson:'test',condition}])),/assigned condition/);});

test('Additional uploaded identity columns are not copied into participant event data',async()=>{const row={...oatRows[0],email:'TEST-PRIVATE@example.invalid',student_id:'TEST-ADDITIONAL-ID'};const run=await transform(summaryInput([row]));const output=JSON.stringify(run.document);assert.equal(output.includes('TEST-PRIVATE@example.invalid'),false);assert.equal(output.includes('TEST-ADDITIONAL-ID'),false);assert.deepEqual(clean(run.records[0].entries[0].event.data.raw_source_fields),clean(oat.records[0].entries[0].event.data.raw_source_fields));});

test('Source activity fields require text, matching both published schemas',async()=>{const summary={...oatRows[0],lesson:42};await assert.rejects(transform(summaryInput([summary])),/text activity/);const dialogue=clean(tmRows[0]);dialogue.transcript_id=42;dialogue.turns=dialogue.turns.slice(0,1);await assert.rejects(transform(dialogueInput(dialogue)),/text activity/);});

test('Unverified transcript role strings do not establish human actor identity',async()=>{const run=await transform({...options('tutormoments'),text:getSample('tutormoments')+'\n'});assert.equal(run.sourceVerified,false);assert.equal(run.records[0].header.assistance_coverage,'actual_help_use_not_established_by_this_adapter');for(const record of run.records)for(const entry of record.entries){assert.deepEqual(entry.event.actor,{role:'system',kind:'software',id:'QLM-transformer'});assert.equal(entry.event.data.provenance.source_kind,'unverified_user_input');}assert.equal(tm.records[0].entries[0].event.actor.kind,'software');assert.equal(tm.records[0].entries[0].event.data.provenance.source_kind,'verified_public_sample');});
test('Unverified participant input reports adapter limits rather than absence of help in that file',async()=>{const row={...oatRows[0],hintDelivered:'yes'};const run=await transform(summaryInput([row]));const entry=run.records[0].entries[0];assert.equal(entry.event.data.help_evidence.actual_help_use,'not_established_by_this_adapter');assert.equal(entry.event.data.provenance.source_kind,'unverified_user_input');assert.equal(run.records[0].header.assistance_coverage,'actual_help_use_not_established_by_this_adapter');assert.equal(oat.records[0].entries[0].event.data.help_evidence.actual_help_use,'not_reported_in_participant_table');});
