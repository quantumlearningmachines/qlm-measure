import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {transform,getSample,parseCSV} from '../dist/engine.mjs';
import {SCAFFOLDING_EVIDENCE as evidence} from '../dist/scaffolding-evidence.mjs';
import {measureScaffolding,createScaffoldingCSV} from '../dist/scaffolding-measurement.mjs';
const copy=value=>JSON.parse(JSON.stringify(value));
const options=id=>({profileId:id,text:getSample(id),secret:'k'.repeat(32),tenant:'demo',sourceName:id==='tutormoments'?'tutormoments-real-transcripts.jsonl':'oatutor-real-participants.csv',importedAt:'2026-10-17T00:00:00Z'});
const transcript=await transform(options('tutormoments')),summary=await transform(options('oatutor'));
const measurement=measureScaffolding([transcript,summary]);
const baseTotals={intervals:10,annotation_rows:60,sessions:2,providers:1,action_includes_scaffolding:{numerator:9,denominator:10}};

test('Published companion aggregates10 exact source spans, not60 repeated annotation rows or322 observations',()=>{
  assert.equal(measurement.status,'available');assert.deepEqual(measurement.totals,baseTotals);
  assert.deepEqual(measurement.matrix,[{need:'mixed',action:'scaffolding',count:1},{need:'neither',action:'rigor',count:1},{need:'rigor',action:'both',count:3},{need:'scaffolding',action:'both',count:2},{need:'scaffolding',action:'scaffolding',count:3}]);
  assert.deepEqual(measurement.sessions.map(s=>[s.turns,s.intervals,s.annotation_rows]),[[149,4,31],[161,6,29]]);
  assert.match(measurement.provenance.label_origin,/LLM-assisted/);assert.match(measurement.provenance.label_origin,/no new classifier/);
});
test('Interval evidence comes from the actual transformed Learnlog records, with source humanSAR and field anchors',()=>{
  for(const interval of measurement.intervals){
    const record=transcript.records.find(r=>r.header.record_id===interval.record_id);assert.ok(record);
    assert.equal(interval.subject,record.header.subject);
    assert.deepEqual(interval.turns,record.entries.map(e=>e.event.data.dialogue).filter(t=>t.turn_number>=interval.turn_start&&t.turn_number<=interval.turn_end));
    assert.equal(interval.annotations.length,interval.annotation_rows);
    for(const annotation of interval.annotations){assert.ok(annotation.human_annotation_matches.length);assert.equal(typeof annotation.action,'string');assert.ok(interval.provenance.ground_truth_field_paths.includes('key_moments['+annotation.ground_truth_key_moment_index_0_based+']'));}
    assert.equal(interval.provenance.source_transcript_sample_sha256,transcript.sourceHash);
    assert.deepEqual(interval.provenance.source_label_fields,{need:'situation_label_agg',action:'action_direction_agg'});
  }
});
test('Summary-only and empty datasets are explicitly unmeasured; assigned help conditions do not create scaffold events',()=>{
  assert.deepEqual(measurement.exclusions,[{dataset:'oatutor',records:12,reason:'Assigned conditions and participant summaries do not report observed scaffolding dialogue or compatible coded intervals.'}]);
  for(const runs of [[],[summary]]){const m=measureScaffolding(runs);assert.equal(m.status,'unmeasured');assert.equal(m.totals.intervals,0);assert.deepEqual(m.totals.action_includes_scaffolding,{numerator:0,denominator:0});assert.equal(m.intervals.length,0);}
});
test('Duplicated runs and repeated source sessions do not inflate interval, annotation, session or provider totals',()=>{
  const m=measureScaffolding([transcript,copy(transcript),summary]);assert.deepEqual(m.totals,baseTotals);assert.equal(m.exclusions.filter(e=>e.reason.startsWith('Repeated')).length,2);
  assert.equal(new Set(m.intervals.map(i=>i.id)).size,10);
});
test('Companion measurement leaves the original322 observed Learnlog entries unchanged',()=>{
  const before=JSON.stringify([transcript.document,summary.document]);const m=measureScaffolding([transcript,summary]);m.intervals[0].turns[0].text='Changed detached export';m.intervals[0].annotations[0].action='Changed detached annotation';
  assert.equal(JSON.stringify([transcript.document,summary.document]),before);assert.equal(transcript.records.reduce((n,r)=>n+r.entries.length,0)+summary.records.reduce((n,r)=>n+r.entries.length,0),322);
  assert.notEqual(measureScaffolding([transcript]).intervals[0].annotations[0].action,'Changed detached annotation');
});
test('Edited raw inputs, caller verification flags and wrong sourceSHA cannot inherit source annotations',async()=>{
  const edited=await transform({...options('tutormoments'),text:getSample('tutormoments').replace('I need help on nine.','I need changed help.'),sourceKind:'verified_public_sample'});
  assert.equal(measureScaffolding([edited]).status,'unmeasured');
  for(const patch of [{sourceKind:'unverified_user_input'},{sourceVerified:false},{sourceHash:'0'.repeat(64)}])assert.equal(measureScaffolding([{...transcript,...patch}]).status,'unmeasured');
});
test('All transformed turns bind labels, including uncoded dialogue outside highlighted intervals',()=>{
  for(const field of ['role','text','turn_number','start_seconds','end_seconds']){
    const changed=copy(transcript),turn=changed.records[0].entries[0].event.data.dialogue;
    turn[field]=typeof turn[field]==='number'?turn[field]+1:'Changed';
    const m=measureScaffolding([changed]);assert.equal(m.totals.intervals,6,field);assert.equal(m.totals.annotation_rows,29);assert.equal(m.exclusions.length,1);
  }
});
test('Changed rawsourcefields or per-entry provenance cannot masquerade as unchanged pinned dialogue',()=>{
  const attacks=[r=>{r.records[0].entries[0].event.data.raw_source_fields.turn.text='Changed';},r=>{r.records[0].entries[0].event.data.provenance.source_record_sha256='0'.repeat(64);},r=>{r.records[0].entries[0].event.data.provenance.source_file_row=435;},r=>{r.records[0].entries[0].event.activity.id='unrelated';},r=>{r.records[0].header.source_sha256='0'.repeat(64);}];
  for(const attack of attacks){const r=copy(transcript);attack(r);assert.equal(measureScaffolding([r]).totals.intervals,6);}
});
test('CSV contains exactly10 intervalrows with denominator and complete source binding, preserving all original evidence text',()=>{
  const rows=parseCSV(createScaffoldingCSV(measurement));assert.equal(rows.length,10);
  rows.forEach((row,index)=>{const interval=measurement.intervals[index];assert.equal(row.interval_id,interval.id);assert.equal(row.included_interval_denominator,'10');assert.deepEqual(JSON.parse(row.source_evidence_turns_json),interval.turns);assert.deepEqual(JSON.parse(row.human_annotation_evidence_json),interval.annotations);assert.deepEqual(JSON.parse(row.interval_provenance_json),interval.provenance);});
  assert.equal(createScaffoldingCSV(measureScaffolding([])).split('\r\n').length,2);
});
test('CSV formula guard protects mutable export identity fields without altering JSON evidence',()=>{
  const m=copy(measurement);m.intervals[0].subject='=HYPERLINK("https://example.test")';assert.ok(parseCSV(createScaffoldingCSV(m))[0].scoped_subject.startsWith("'="));assert.equal(m.intervals[0].subject,'=HYPERLINK("https://example.test")');
});
test('Generated JSON andJS evidence agree, raw excerpt hashes and60humanSAR anchors verify',()=>{
  assert.deepEqual(evidence,JSON.parse(readFileSync(new URL('../dist/provenance/scaffolding-evidence.json',import.meta.url),'utf8')));
  const sourceRows={};
  for(const [file,spec]of Object.entries(evidence.sources)){
    const name=new URL(spec.sample_url).pathname.split('/').at(-1);const bytes=readFileSync(new URL('../dist/samples/'+name,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sample_sha256);
    sourceRows[file]=bytes.toString('utf8').trimEnd().split('\n').map(JSON.parse);
  }
  let matched=0;
  for(const window of evidence.windows)for(const annotation of window.annotations){
    const ground=sourceRows['ground_truth.jsonl'][evidence.sources['ground_truth.jsonl'].source_lines_1_based.indexOf(window.ground_truth_source_line_1_based)].key_moments[annotation.ground_truth_key_moment_index_0_based];
    for(const key of ['situation','action','result'])assert.equal(annotation[key],ground[key]);
    assert.equal(window.need,ground.situation_label_agg);assert.equal(window.action,ground.action_direction_agg);
    for(const anchor of annotation.human_annotation_matches){const human=sourceRows['annotations.jsonl'][evidence.sources['annotations.jsonl'].source_lines_1_based.indexOf(anchor.source_line_1_based)].turn_annotations[anchor.turn_annotation_index_0_based];for(const key of ['situation','action','result'])assert.equal(annotation[key],human[key]);}
    matched++;
  }
  assert.equal(matched,60);
});
test('Typed turn binding rejects booleans posing as numeric turn numbers',()=>{
  const changed=copy(transcript);changed.records[0].entries[0].event.data.dialogue.turn_number=true;changed.records[0].entries[0].event.data.raw_source_fields.turn.turn_number=true;
  const actual=measureScaffolding([changed]);assert.equal(actual.totals.intervals,6);assert.equal(actual.totals.annotation_rows,29);assert.equal(actual.exclusions.length,1);
});
