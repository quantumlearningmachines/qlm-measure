import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {transform,getSample,PROFILES,parseCSV,parseInput,sha256} from '../dist/engine.mjs';
import {escapeHTML,highlightJSON,displayValue,flattenRuns,createDataset,createCSV,evidenceCounts,observationUnit,sourceKind,dialogueView,sourceLocator,measurementPresentation} from '../dist/view-model.mjs';
import {measureScaffolding,createScaffoldingCSV} from '../dist/scaffolding-measurement.mjs';
const key='k'.repeat(32),importedAt='2026-10-17T00:00:00Z';
const options=id=>({profileId:id,text:getSample(id),secret:key,tenant:'demo',importedAt,sourceName:PROFILES.find(p=>p.id===id).sampleName});
const runs=await Promise.all(PROFILES.map(p=>transform(options(p.id))));
const transcript=runs.find(r=>r.profile.id==='tutormoments'),participants=runs.find(r=>r.profile.id==='oatutor');
const html=readFileSync(new URL('../dist/demo.html',import.meta.url),'utf8');
const app=readFileSync(new URL('../dist/app.mjs',import.meta.url),'utf8');

test('Escaping prevents user transcript text from becoming HTML or attributes',()=>{
  const safe=escapeHTML('<img src=x onerror="alert(1)"> & \' </script>');
  for(const token of ['<','>','"',"'"])assert.equal(safe.includes(token),false);
  assert.ok(safe.includes('&lt;img'));assert.ok(safe.includes('&amp;'));
});
test('JSON highlighting adds only fixed spans around escaped source values',()=>{
  const rendered=highlightJSON({'</span><script>evil()</script>':'<img src=x onerror=evil()>',n:1,b:false});
  assert.equal(rendered.includes('<script'),false);assert.equal(rendered.includes('<img'),false);
  const tags=rendered.match(/<[^>]*>/g)||[];assert.ok(tags.every(t=>/^<span class="json-(?:key|string|number|boolean|null)">$/.test(t)||t==='</span>'));
});
test('Display preserves original string/number/boolean representations',()=>{
  assert.equal(displayValue('0.80'),'0.80');assert.equal(displayValue(0.8),'0.8');assert.equal(displayValue(false),'false');assert.equal(displayValue({a:1}),'{"a":1}');
});
test('Flattening retains every released transcript turn and source locator without invented help classification',()=>{
  const flat=flattenRuns([transcript]);assert.equal(flat.length,310);
  const sourceRows=parseInput(getSample('tutormoments'),transcript.sourceName);
  const expected=sourceRows.flatMap((row,i)=>row.turns.map(turn=>({turn,sourceRow:i+1,originalRow:transcript.profile.source.sourceRows[i]})));
  assert.equal(flat.length,expected.length);
  flat.forEach((row,i)=>{assert.deepEqual(row.dialogue,{...expected[i].turn});assert.equal(row.sourceRow,expected[i].sourceRow);assert.equal(row.provenance.source_file_row,expected[i].originalRow);assert.equal(row.provenance.source_field_path,'turns['+(row.dialogue.turn_number-1)+']');assert.equal(row.eventName,'qlm_import:dialogue_turn_observed');assert.equal(row.subjectScope,transcript.profile.subjectScope);assert.equal(row.recordScope,'transcript_session');assert.equal(row.entryTime,importedAt);});
  assert.ok(flat.every(r=>['tutor_utterance_recorded','student_utterance_recorded'].includes(r.assistance)));
  assert.equal(flat.find(r=>r.sourceRow===1&&r.dialogue.turn_number===27).dialogue.text,'I need help on nine.');
});
test('Participant fields retain original CSV header names, values and absent hint-use evidence',()=>{
  const original=parseCSV(getSample('oatutor')),flat=flattenRuns([participants]);assert.equal(flat.length,12);
  flat.forEach((row,i)=>{assert.deepEqual({...row.metrics},Object.fromEntries(['preTest','postTest','sessionTime','totalUniqueSteps','learningGain'].map(k=>[k,original[i][k]])));assert.equal(row.helpEvidence.condition,original[i].condition);assert.equal(row.helpEvidence.actual_help_use,'not_reported_in_participant_table');assert.equal(row.assistance,'assigned_condition_only');assert.equal(row.provenance.source_file_row,i+2);assert.equal(Object.hasOwn(row.rawSourceFields,'anonUserID'),false);});
  assert.equal(flat[0].metrics.preTest,'0.333');assert.equal(flat[1].metrics.learningGain,'-0.333');
});
test('Evidence coverage separates utterance roles from assigned help conditions and incompatible units',()=>{
  const counts=evidenceCounts(runs);assert.equal(counts.filter(c=>c.dataset==='tutormoments').reduce((n,c)=>n+c.count,0),310);
  assert.equal(counts.find(c=>c.dataset==='oatutor').count,12);assert.equal(counts.find(c=>c.dataset==='oatutor').kind,'assigned_condition_only');
  assert.equal(observationUnit(transcript.profile),'transcript turns');assert.equal(observationUnit(participants.profile),'participant summaries');
  assert.ok(counts.filter(c=>c.dataset==='tutormoments').every(c=>c.unit==='transcript turns'));
});
test('Dataset export retains contained files, checkpoints, mappings and verified source identity',()=>{
  const data=createDataset(runs,importedAt);assert.equal(data.inputs.length,2);assert.equal(data.created_at,importedAt);
  data.inputs.forEach((input,i)=>{assert.deepEqual(input.learnlog,runs[i].document);assert.deepEqual(input.checkpoint,runs[i].checkpoint);assert.deepEqual(input.mapping_profile,runs[i].profile.mapping);assert.equal(input.source_sha256,runs[i].sourceHash);assert.equal(input.source_kind,'verified_public_sample');assert.equal(input.reference_release.sampleSha256,runs[i].sourceHash);assert.equal(input.provided_excerpt_unchanged,true);});
  assert.match(data.scope.observation_units,/different units/);assert.match(data.scope.identity,/Records are not distinct-person counts; no cross-source identity linkage/);
});
test('Edited input cannot export an authenticated source attribution or remain a published excerpt',async()=>{
  const run=await transform({...options('oatutor'),text:getSample('oatutor').replace('1318','1319'),sourceKind:'verified_public_sample'});
  const input=createDataset([run]).inputs[0];assert.equal(sourceKind(run),'unverified_user_input');assert.equal(input.source_kind,'unverified_user_input');assert.equal(input.reference_release,null);assert.equal(input.provided_excerpt_unchanged,false);assert.equal(run.document.records[0].header.source_provenance,undefined);
});
test('Export helpers cannot turn a caller provenance label into verification',()=>{
  const run={...participants,sourceKind:'verified_public_sample',sourceVerified:false};assert.equal(sourceKind(run),'unverified_user_input');assert.equal(createDataset([run]).inputs[0].reference_release,null);
});
test('Observation CSV preserves source text, typed JSON fields, provenance and all310 transcript turns',()=>{
  const rows=parseCSV(createCSV([transcript])),flat=flattenRuns([transcript]);assert.equal(rows.length,310);
  rows.forEach((row,i)=>{assert.deepEqual(JSON.parse(row.dialogue_json),flat[i].dialogue);assert.deepEqual(JSON.parse(row.raw_source_fields_json),flat[i].rawSourceFields);assert.deepEqual(JSON.parse(row.source_provenance_json),flat[i].provenance);assert.equal(row.assistance_evidence,flat[i].assistance);assert.equal(row.source_kind,'verified_public_sample');});
});
test('CSV keeps original participant metric strings and explicit help-condition evidence',()=>{
  const rows=parseCSV(createCSV([participants]));assert.equal(rows.length,12);assert.equal(JSON.parse(rows[0].reported_metrics_json).preTest,'0.333');assert.equal(JSON.parse(rows[1].reported_metrics_json).learningGain,'-0.333');assert.equal(JSON.parse(rows[0].help_evidence_json).condition,'ChatGPT');assert.equal(rows[0].observation_unit,'participant summaries');assert.equal(rows[0].assistance_evidence,'assigned_condition_only');
});
for(const name of ['=HYPERLINK("https://example.test")','+cmd','@SUM(1,1)','-1+2','\t=1+1','\r=1+1',' \n=1+1'])test('CSV formula guard protects untrusted source filename '+JSON.stringify(name),()=>{
  const run={...participants,sourceName:name};const rows=parseCSV(createCSV([run]));assert.ok(rows[0].source_file.startsWith("'"));assert.equal(JSON.parse(rows[0].reported_metrics_json).preTest,'0.333');
});
test('Known raw excerpt hashes match preserved UTF-8 bytes including JSONL and CRLF',async()=>{
  for(const p of PROFILES){const text=getSample(p.id);assert.equal(await sha256(text),p.source.sampleSha256);assert.equal(createHash('sha256').update(new TextEncoder().encode(text)).digest('hex'),p.source.sampleSha256);}
  assert.ok(getSample('oatutor').includes('\r\n'));assert.notEqual(await sha256(getSample('oatutor').replace(/\r\n/g,'\n')),participants.sourceHash);
});
test('Upload decoding rejects lossy UTF-8 replacement and preserves BOM/CRLF bytes',()=>{
  assert.throws(()=>new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(new Uint8Array([0xc0,0xaf])));
  const bytes=new TextEncoder().encode('\ufeffheader\r\né𝄞\r\n');const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);assert.deepEqual(new TextEncoder().encode(text),bytes);
});
test('All statically referenced UI elements exist exactly once, including provenance and source dialogue',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  const refs=[...app.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);for(const id of new Set(refs))assert.ok(ids.includes(id),'Missing element #'+id);
  for(const id of ['source-provenance','evidence-panel','evidence-title','evidence-description','evidence-content','help-evidence-list','step-read','step-map','step-seal','analysis-coverage','analysis-records','analysis-metrics'])assert.ok(ids.includes(id),'Missing dynamic element #'+id);
});
test('Visible copy describes genuine research releases and does not claim fabricated vendor support',()=>{
  assert.deepEqual(PROFILES.map(p=>p.id),['tutormoments','oatutor']);
  assert.equal(/Khan Academy|MATHia|\bIXL\b|DreamBox|ALEKS|five samples|synthetic (?:product|sample)|unknown assistance in the summary templates/i.test(html+app),false);
  assert.match(html,/participant-level/);assert.match(html,/machine transcription|Machine transcription/i);assert.match(html,/different observation units/);assert.match(html,/does not anonymize free text/);assert.match(app,/show all session turns/i);assert.match(app,/unverified_user_input/);
});
test('Processing remains local without network calls, analytics or persistent storage',()=>{
  const code=['app.mjs','view-model.mjs','engine.mjs','profiles.mjs'].map(p=>readFileSync(new URL('../dist/'+p,import.meta.url),'utf8')).join('\n');
  assert.equal(/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|indexedDB)\s*(?:\(|\.|\[)/.test(code),false);assert.match(html,/connect-src 'none'/);assert.equal(/<script[^>]+src="https?:\/\//.test(html),false);
});

test('Curated dialogue windows apply only to the exact verified public sample',async()=>{
  const view=dialogueView(transcript,0);assert.equal(view.published,true);assert.equal(view.window.startTurn,27);assert.equal(view.visibleTurns.length,13);assert.equal(view.visibleTurns[0].dialogue.text,'I need help on nine.');assert.equal(dialogueView(transcript,0,true).visibleTurns.length,transcript.records[0].entries.length);
  const edited=await transform({...options('tutormoments'),text:getSample('tutormoments').replace('I need help on nine.','User-provided text.'),sourceKind:'verified_public_sample'});
  const unverified=dialogueView(edited,0);assert.equal(unverified.published,false);assert.equal(unverified.window,null);assert.equal(unverified.visibleTurns.length,edited.records[0].entries.length);assert.equal(unverified.visibleTurns.find(r=>r.dialogue.turn_number===27).dialogue.text,'User-provided text.');
});


test('Measurement presentation uses the coded-interval denominator, not heterogeneous source rows',()=>{
  const measurement=measureScaffolding(runs),view=measurementPresentation(measurement);
  assert.equal(view.available,true);assert.equal(view.ratio,'9/10');assert.deepEqual(view.counters,{intervals:10,sessions:2,providers:1,annotations:60});
  assert.equal(flattenRuns(runs).length,322);assert.notEqual(measurement.totals.action_includes_scaffolding.denominator,flattenRuns(runs).length);
});
test('Excluding the transcript source makes the measure unmeasured, never zero scaffolding',()=>{
  const measurement=measureScaffolding([participants]),view=measurementPresentation(measurement);
  assert.equal(view.available,false);assert.equal(view.ratio,'—');assert.deepEqual(view.counters,{intervals:'—',sessions:'—',providers:'—',annotations:'—'});
  assert.equal(measurement.status,'unmeasured');assert.equal(measurement.exclusions[0].dataset,'oatutor');assert.equal(measurement.exclusions[0].records,12);
});
test('Combined dataset and measurement CSV retain the same inspectable interval evidence',()=>{
  const measurement=measureScaffolding(runs),dataset=createDataset(runs,importedAt,measurement),csv=parseCSV(createScaffoldingCSV(measurement));
  assert.deepEqual(dataset.scaffolding_measurement,measurement);assert.equal(csv.length,10);
  for(const row of csv){const interval=measurement.intervals.find(i=>i.id===row.interval_id);assert.ok(interval);assert.equal(row.included_interval_denominator,'10');assert.equal(row.published_need_label,interval.need);assert.equal(row.published_action_direction_label,interval.action);assert.deepEqual(JSON.parse(row.source_evidence_turns_json),interval.turns);assert.deepEqual(JSON.parse(row.human_annotation_evidence_json),interval.annotations);}
});
test('Primary source locators remain concise while exports keep full provenance hashes',()=>{
  const row=flattenRuns([transcript]).find(r=>r.dialogue.turn_number===27&&r.sourceRow===1);
  assert.equal(sourceLocator(row.provenance,row.dialogue),'Original file row 366 · Turn 27');assert.equal(sourceLocator({source_row:3}),'Input row 3');assert.equal(sourceLocator({}),'Source locator not supplied');
  assert.ok(Object.values(row.provenance).some(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)));
});
test('Measurement UI defaults to source-coded evidence and exposes audit and export controls',()=>{
  assert.match(app,/analysis:'scaffolding'/);assert.match(html,/data-analysis="scaffolding" class="active" aria-pressed="true"/);
  assert.match(html,/Measure the real examples/);assert.match(html,/two sessions from one anonymized provider/i);assert.match(html,/need × action/i);
  for(const id of ['stat-intervals','stat-sessions','stat-providers','stat-annotations','measurement-matrix','measurement-sessions','measurement-exclusions','measurement-intervals','measure-dialog','measure-dialog-content','export-measurement-json','export-measurement-csv'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(app,/source annotation rows collapse to/);assert.match(app,/Missing coding is unmeasured, not zero scaffolding/);assert.match(app,/Human annotation file/);assert.match(app,/source_transcript_line_1_based/);assert.match(app,/createDataset\(selectedRuns\(\),undefined,state.measurement\)/);
});
