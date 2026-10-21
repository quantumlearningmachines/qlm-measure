import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ASSISTANCE_EXAMPLES,assessAssistanceMetric,selectBindingExample} from '../dist/assistance-gap.mjs';
import PACKAGED_BINDINGS from '../dist/assistance-profile-examples.mjs';

const html=readFileSync(new URL('../dist/demo.html',import.meta.url),'utf8');
const module=readFileSync(new URL('../dist/assistance-gap.mjs',import.meta.url),'utf8');

test('Each metric counts only the observed lifecycle and keeps other observations unknown',()=>{
  for(const metric of ['requested','generated','displayed']){
    const result=assessAssistanceMetric(metric);
    assert.equal(result.observedCount,1);assert.equal(result.unknownRecordCount,2);
    assert.equal(result.totalOccurrenceCount,null);
    for(const row of result.observations){
      assert.equal(row.value,row.state==='observed'?1:null);
      assert.notEqual(row.value,0);
    }
  }
});

test('A display record does not imply a request or generation observation',()=>{
  const display=ASSISTANCE_EXAMPLES.find(row=>row.lifecycle==='displayed');
  assert.equal(assessAssistanceMetric('requested',[display]).observedCount,0);
  assert.equal(assessAssistanceMetric('generated',[display]).observations[0].value,null);
  assert.equal(assessAssistanceMetric('displayed',[display]).observations[0].value,1);
});

test('Synthetic illustrations are isolated from empirical engine and aggregate',()=>{
  for(const record of ASSISTANCE_EXAMPLES){assert.equal(record.synthetic,true);assert.equal(record.empiricalAggregateEligible,false);}
  assert.equal(assessAssistanceMetric('displayed').empiricalAggregateEligible,false);
  const imports = [...module.matchAll(/^import .+ from ['"](.+)['"]/gm)].map(row=>row[1]);
  assert.deepEqual(imports,['./assistance-profile-examples.mjs']);
  assert.equal(/dispatchEvent|localStorage|sessionStorage|fetch\s*\(/.test(module),false);
  assert.match(html,/invented teaching examples, not vendor records/);
  assert.match(html,/never enter the research dataset or its aggregate measures/);
});

test('Malformed and nonillustrative inputs cannot silently become observations',()=>{
  assert.throws(()=>assessAssistanceMetric('received'),TypeError);
  assert.throws(()=>assessAssistanceMetric('displayed',{}),TypeError);
  assert.throws(()=>assessAssistanceMetric('displayed',[{...ASSISTANCE_EXAMPLES[0],synthetic:false}]),TypeError);
  assert.throws(()=>assessAssistanceMetric('displayed',[ASSISTANCE_EXAMPLES[0],ASSISTANCE_EXAMPLES[0]]),TypeError);
  assert.throws(()=>assessAssistanceMetric('displayed',[{...ASSISTANCE_EXAMPLES[0],capture:{capabilities:[]}}]),TypeError);
  // Capability is not achieved coverage: this single-hook illustration must not
  // mislabel a multihook instrument's unobserved event as "not collected".
  assert.throws(()=>assessAssistanceMetric('displayed',[{...ASSISTANCE_EXAMPLES[1],capture:{capabilities:['generated','displayed']}}]),TypeError);
});

test('The page introduces capture rules before the transformer and retains real source controls',()=>{
  assert.ok(html.indexOf('id="assistance-gap"')<html.indexOf('id="transformer"'));
  for(const id of ['hero-combine','product-picker','transform-btn','aggregate','download-airflow'])assert.ok(html.includes(`id="${id}"`));
  assert.match(html,/name="gap-metric" value="displayed" checked/);
  assert.match(html,/aria-live="polite" aria-atomic="true"/);
  assert.match(html,/assistance-gap\.mjs/);
});

test('Standards positioning acknowledges existing mechanisms and the limits of the proposal',()=>{
  assert.match(html,/xAPI Profiles/);assert.match(html,/Caliper/);
  assert.match(html,/Related AI and intelligent-tutoring work already exists/);
  assert.match(html,/not a claim that existing standards lack the expressive power/);
  assert.match(html,/draft AI-Mediated Learning Interactions Profile/);
  assert.match(html,/capture boundaries, achieved coverage, typed unknowns and evidence provenance/);
  assert.match(html,/downloads\/learnlog-assistance-profile-draft\.zip/);
  assert.match(html,/cannot reconstruct events nobody logged/);
  assert.match(html,/effect on research errors or effort still needs independent evaluation/);
  assert.match(html,/Proposed rules, not an approved standard/);
});

test('Packaged full binding examples equal the generated Python JSON without browser conversion',()=>{
  const json = JSON.parse(readFileSync(new URL('../dist/examples/assistance-profile-bindings.json',import.meta.url),'utf8'));
  assert.deepEqual(PACKAGED_BINDINGS,json);
  assert.deepEqual(Object.keys(json.examples).sort(),['displayed','generated','requested']);
  assert.ok(json.provenance);
  for(const lifecycle of ['requested','generated','displayed']){
    for(const carrier of ['contract','xapi_statement','caliper_event','caliper_envelope']){
      const field=carrier==='contract'?'assistance_capture':carrier;
      assert.strictEqual(selectBindingExample(lifecycle,carrier),PACKAGED_BINDINGS.examples[lifecycle][field]);
      assert.deepEqual(selectBindingExample(lifecycle,carrier),json.examples[lifecycle][field]);
    }
  }
});

test('Full xAPI and Caliper examples preserve the same capture payload and actual source lifecycle',()=>{
  let unavailableSourceTimes=0;
  for(const lifecycle of ['requested','generated','displayed']){
    const capture=selectBindingExample(lifecycle,'contract');
    const xapi=selectBindingExample(lifecycle,'xapi_statement');
    const event=selectBindingExample(lifecycle,'caliper_event');
    const envelope=selectBindingExample(lifecycle,'caliper_envelope');
    assert.equal(capture.assistance.lifecycle.value,lifecycle);
    assert.deepEqual(Object.values(xapi.context.extensions).find(value=>value?.record_kind===capture.record_kind),capture);
    assert.deepEqual(Object.values(event.extensions).find(value=>value?.record_kind===capture.record_kind),capture);
    assert.equal(xapi.actor.objectType,'Agent');
    assert.ok(xapi.actor.account,'Importer has an explicit account rather than an invented learner');
    assert.equal(event.actor.type,'SoftwareApplication');
    assert.equal(event.action,'Created');
    assert.equal(event.object.type,'DigitalResource');
    assert.ok(xapi.timestamp);assert.equal(xapi.timestamp,event.eventTime);
    assert.ok(envelope.data.some(row=>row.id===event.id));
    assert.deepEqual(envelope.data.find(row=>row.id===event.id),event);
    const sourceTime=capture.assistance.event_time.utc;
    if(sourceTime.state!=='observed'){
      unavailableSourceTimes++;
      assert.equal(Object.hasOwn(sourceTime,'value'),false);
    }
    else assert.notEqual(xapi.timestamp,sourceTime.value,'Import observation does not reuse native event time');
  }
  assert.ok(unavailableSourceTimes>=1,'The demonstration must include unavailable native time rather than only complete source clocks');
});

test('Binding selector rejects missing carrier fixtures and page distinguishes optional legacy carrier',()=>{
  assert.throws(()=>selectBindingExample('received','contract'),TypeError);
  assert.throws(()=>selectBindingExample('displayed','native_event'),TypeError);
  assert.throws(()=>selectBindingExample('displayed','xapi_statement',{examples:{displayed:{}}}),TypeError);
  for(const id of ['profile-bindings','binding-record','binding-carrier','binding-source-time','binding-host-time','binding-code'])assert.ok(html.includes(`id="${id}"`));
  assert.match(html,/outer event records a software importer observing source evidence/);
  assert.match(html,/does not assert that a learner requested, read or used help at the import time/);
  assert.match(html,/Local checks do not establish live interoperability or certification/);
  assert.match(html,/research transformer below retains the existing Learnlog record container/);
  assert.match(html,/do not add missing assistance evidence to these datasets/);
  assert.match(html,/External vendors do not need to implement a new Learnlog format/);
  assert.match(html,/transformer is the adoption path: keep the native export/);
  assert.match(html,/interactive transformer below uses two public research excerpts/);
  assert.match(html,/cross-source analysis applies candidate mappings from two other published releases/);
  assert.match(html,/research demonstrations, not general vendor compatibility/);
});
