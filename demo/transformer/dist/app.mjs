import {PROFILES as RESEARCH_PROFILES,ALL_PROFILES as PROFILES,getSample,transform,aggregate,verify,parseInput,assessPoolingCompatibility,getSemanticContract} from './engine.mjs';
import {escapeHTML as esc,displayValue,shortHash,highlightJSON,flattenRuns,createDataset,createCSV,evidenceCounts,observationUnit,sourceKind,dialogueView,sourceLocator,measurementPresentation} from './view-model.mjs';
import {measureScaffolding,createScaffoldingCSV} from './scaffolding-measurement.mjs';

const $=id=>document.getElementById(id);
const state={profileId:PROFILES[0].id,sourceName:'sample.json',originalText:null,sourceKind:'verified_public_sample',latest:null,runs:[],selected:new Set(),busy:false,analysis:'scaffolding',recordIndex:0,page:0,showAllTurns:false,measurement:null,measurementFilter:null,activeInterval:null};
const monograms={tutormoments:'TM',oatutor:'OA','explicit-assistance-events':'FX'};
const colorClasses={tutormoments:'source-transcript',oatutor:'source-participant','explicit-assistance-events':'source-participant'};
const fields={subject_id:'header.subject · scoped pseudonym',activity_id:'event.activity.id'};
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,reducedMotion?0:ms));
let toastTimer;

function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function download(name,content,type='application/json'){
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function profile(){return PROFILES.find(p=>p.id===state.profileId);}
function sourceText(){return state.originalText??$('source-input').value;}
function selectedRuns(){return state.runs.filter(run=>state.selected.has(run.profile.id));}
function error(target,message){$(target).textContent=message;$(target).hidden=!message;}
function formatCount(n){return Number(n).toLocaleString();}
function safeLink(url,label){try{const u=new URL(url,document.baseURI);if(!['https:','http:'].includes(u.protocol))return esc(label);return '<a href="'+esc(u.href)+'" target="_blank" rel="noopener noreferrer">'+esc(label)+' ↗</a>';}catch{return esc(label);}}
function asText(value){return typeof value==='string'?value:JSON.stringify(value??'Not supplied');}
function markStep(active){['read','map','seal'].forEach((name,i)=>{const li=$('step-'+name);li.classList.toggle('active',i===active);li.classList.toggle('done',i<active);});}
function setBusy(value){
  state.busy=value;
  for(const id of ['transform-btn','sample-btn','file-input','combine-all','hero-combine','clear-dataset','source-input'])$(id).disabled=value;
  document.querySelectorAll('.product-tab').forEach(el=>el.disabled=value);
  $('combine-all').textContent=value?'Preparing records…':'＋ Combine '+RESEARCH_PROFILES.length+' research excerpts';
  updateOutputButtons();if(!value)$('clear-dataset').disabled=!state.runs.length;
}
function updateOutputButtons(){
  const ready=!!state.latest&&!state.busy;
  for(const id of ['copy-output','download-output','add-dataset'])$(id).disabled=!ready;
  if(ready){const added=state.runs.some(r=>r.profile.id===state.latest.profile.id&&r.sourceHash===state.latest.sourceHash);$('add-dataset').disabled=added;$('add-dataset').textContent=added?'Added to dataset ✓':'Add to dataset ＋';}
}
function resetOutput(){
  state.latest=null;state.recordIndex=0;state.showAllTurns=false;$('output-code').hidden=true;$('record-guide').hidden=true;$('output-placeholder').hidden=false;$('record-select').hidden=true;$('evidence-panel').hidden=true;
  $('output-status').textContent='Awaiting input';$('output-status').className='status-pill';$('output-context').textContent='SOURCE → MAPPING → RECORD';$('output-preserved').hidden=false;
  $('transform-result').hidden=true;$('workbench').classList.remove('is-complete');error('transform-error','');markStep(-1);updateOutputButtons();
}
function renderProvenance(){
  const p=profile(),s=p.source||{},synthetic=state.sourceKind==='synthetic_fixture',verified=state.sourceKind==='verified_public_sample';
  if(synthetic){$('profile-caption').textContent=p.description;$('source-provenance').innerHTML='<div class="provenance-heading"><strong>SYNTHETIC contract fixture · not research data</strong></div><p>'+esc(s.summary)+'</p><p>'+esc(s.selectionNote)+'</p><p>'+safeLink(s.downloadUrl,'Download synthetic fixture')+' · '+safeLink(s.url,'Imported event schema')+'</p><ul>'+s.limitations.map(value=>'<li>'+esc(value)+'</li>').join('')+'</ul>';return;}
  $('profile-caption').textContent=verified?p.description:'Selected adapter: '+p.name+'. Uploaded or edited input origin is unverified.';
  const rows=[['Release',asText(s.revision)],['License',s.licenseUrl?safeLink(s.licenseUrl,asText(s.license)):esc(asText(s.license))],['Selection',esc(asText(s.selectionNote))],['Source rows',esc(asText(s.sourceRows))],['Excerpt SHA-256','<code>'+esc(asText(s.sampleSha256))+'</code>'],['Source SHA-256','<code>'+esc(asText(s.sourceSha256))+'</code>']];
  $('source-provenance').innerHTML='<div class="provenance-heading"><strong>'+(verified?'Published research excerpt':'User-supplied input · unverified provenance')+'</strong><span>'+safeLink(s.url,'Reference source')+' · '+safeLink(s.licenseUrl,asText(s.license))+'</span></div><p class="provenance-summary">'+esc((verified?'':'Reference excerpt: ')+asText(s.summary||s.citation))+'</p>'+(verified?'':'<p class="provenance-warning">This input was edited or uploaded. The reference release does not authenticate its origin or values.</p>')+'<details class="provenance-audit"><summary>Source selection, file hashes and full provenance</summary><p class="provenance-citation">'+esc(asText(s.citation))+'</p><p>'+safeLink(s.downloadUrl,'Original source file')+'</p><dl>'+rows.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+(label==='Release'?esc(value):value)+'</dd></div>').join('')+'</dl><ul>'+(Array.isArray(s.limitations)?s.limitations:[asText(s.limitations)]).map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul></details>';

}
function updateSourceMeta(){
  const text=sourceText(),lines=$('source-input').value.split('\n').length;
  $('source-lines').textContent=Array.from({length:Math.min(lines,2000)},(_,i)=>i+1).join('\n');
  let count='';try{count=formatCount(parseInput(text,state.sourceName).length)+' source rows · ';}catch{}
  $('input-count').textContent=count+(state.sourceKind==='verified_public_sample'?'Unchanged published excerpt':state.sourceKind==='synthetic_fixture'?'SYNTHETIC fixture · not observed data':'Unverified user input');$('source-name').textContent=state.sourceName;renderProvenance();
}
function setProfile(id){
  if(state.busy)return;state.profileId=id;
  document.querySelectorAll('.product-tab').forEach(el=>{const on=el.dataset.product===id;el.classList.toggle('active',on);el.setAttribute('aria-pressed',String(on));});
  const p=profile(),pairs=[...Object.entries(p.fields||{}).map(([key,column])=>[column,fields[key]||key]),...Object.entries(p.metrics||{}).map(([key,column])=>[column,'reported_metrics · source column '+column])];
  $('mapping-rows').innerHTML=pairs.map(([source,target])=>'<div class="mapping-row"><span class="source-field">'+esc(asText(source))+'</span><span class="mapping-arrow" aria-hidden="true">→</span><span class="target-field">'+esc(target)+'</span></div>').join('')+'<pre class="mapping-detail">'+esc(JSON.stringify({mapping:p.mapping,semantic_contract:getSemanticContract(p.id)},null,2))+'</pre>';
  loadSample();
}
function loadSample(){
  if(state.busy)return;
  const sample=getSample(state.profileId);state.originalText=sample;state.sourceName=profile().sampleName||state.profileId+'_sample.json';state.sourceKind=profile().source?.kind==='synthetic_contract_fixture'?'synthetic_fixture':'verified_public_sample';
  $('source-input').value=sample;$('file-input').value='';updateSourceMeta();resetOutput();
}
function sourceView(name){
  $('source-editor').hidden=name!=='data';$('mapping-view').hidden=name!=='mapping';
  for(const [id,on]of [['input-tab',name==='data'],['mapping-tab',name==='mapping']]){$(id).classList.toggle('active',on);$(id).setAttribute('aria-pressed',String(on));}
}
function outputView(name){
  const guide=name==='guide';$('json-tab').classList.toggle('active',!guide);$('guide-tab').classList.toggle('active',guide);$('json-tab').setAttribute('aria-pressed',String(!guide));$('guide-tab').setAttribute('aria-pressed',String(guide));
  if(state.latest){$('output-code').hidden=guide;$('record-guide').hidden=!guide;}
}
function evidenceLabel(kind){return ({tutor_utterance_recorded:'Tutor utterance recorded',student_utterance_recorded:'Student utterance recorded',assigned_condition_only:'Assigned condition only',help_requested:'Explicit request assertion',help_generated:'Generated · not necessarily transmitted',help_transmitted:'Transmitted · not necessarily displayed',help_displayed:'Displayed · reading and learning unestablished',learner_response_observed:'Learner response recorded · benefit unestablished',unknown:'Assistance unknown',not_established:'Not established'})[kind]||kind;}
function renderEvidence(run,record){
  const rows=flattenRuns([{...run,records:[record]}]),{turns,visibleTurns,window,published}=dialogueView(run,state.recordIndex,state.showAllTurns);
  $('evidence-panel').hidden=false;
  if(turns.length){
    $('evidence-title').textContent='Read the recorded tutoring dialogue';
    $('evidence-description').textContent=published?'Published transcript text, in its released turn order. Speaker labels and relative audio offsets come from the source. Publisher transcription was machine generated and may contain errors. A tutor turn is not automatically a hint or scaffolding.':'User-supplied dialogue; origin and transcription method are unverified. Speaker labels, text and relative seconds are provided by the input. A tutor turn is not automatically a hint or scaffolding.';
    $('evidence-content').innerHTML=(window?'<div class="dialogue-window"><p>'+(state.showAllTurns?'Showing all '+turns.length+' turns in this selected session.':'Inspection window: source turns '+window.startTurn+'–'+window.endTurn+' of '+turns.length+'. This selected window is not a frequency estimate.')+'</p><button class="text-button" data-dialogue-toggle>'+ (state.showAllTurns?'Return to inspection window':'Show all session turns')+'</button></div>':'')+'<ol class="dialogue-timeline">'+visibleTurns.map(row=>{const d=row.dialogue,role=d.role||'Unspecified speaker',start=d.start_seconds,end=d.end_seconds;return '<li class="dialogue-turn '+(String(role).toLowerCase().includes('tutor')?'tutor-turn':'student-turn')+'"><div class="dialogue-meta"><strong>'+esc(role)+'</strong><span>Turn '+esc(d.turn_number??row.sourceRow)+'</span>'+(start!==undefined&&start!==null?'<span>'+esc(start)+'–'+esc(end??'?')+' s · '+(published?'source audio offset':'provided relative seconds')+'</span>':'')+'</div><p>'+esc(d.text??'')+'</p><small>'+esc(sourceLocator(row.provenance,row.dialogue))+'</small></li>';}).join('')+'</ol>';
  }else if(run.profile.mode==='assistance_events'){
    $('evidence-title').textContent=sourceKind(run)==='synthetic_fixture'?'Inspect the SYNTHETIC lifecycle contract':'Inspect the explicit source lifecycle assertions';
    $('evidence-description').textContent='Each lifecycle state is a separate source assertion. Generated does not imply transmitted, transmitted does not imply displayed, and display does not establish reading or learning. Source provenance and mapping validity remain unverified.';
    $('evidence-content').innerHTML=rows.map(row=>'<div class="help-summary"><strong>'+esc(evidenceLabel(row.assistance))+'</strong><pre>'+esc(JSON.stringify({lifecycle:row.lifecycle,context:row.assistanceContext,original_source_timestamp:row.originalSourceTimestamp},null,2))+'</pre></div>').join('');
  }else{
    $('evidence-title').textContent='Inspect the reported help condition';
    $('evidence-description').textContent=(sourceKind(run)==='verified_public_sample'?'These are participant-level study fields. ':'User-supplied fields are interpreted with the participant-summary adapter. Study origin and condition assignment are unverified. ')+'Reported conditions and participant-level measures do not provide a timestamped sequence of individual help requests or delivered hints.';
    $('evidence-content').innerHTML=rows.map(row=>'<div class="help-summary"><strong>'+esc(evidenceLabel(row.assistance))+'</strong><pre>'+esc(JSON.stringify(row.helpEvidence||row.metrics,null,2))+'</pre><small>'+esc(sourceLocator(row.provenance,row.dialogue))+'</small></div>').join('');
  }
  $('evidence-content').innerHTML+='<details class="evidence-provenance"><summary>Full record and source provenance</summary><pre>'+esc(JSON.stringify({record_header:record.header,source_locators:rows.map(row=>row.provenance)},null,2))+'</pre></details>';
}
function renderRecord(){
  const run=state.latest;if(!run)return;
  const record=run.records[state.recordIndex],visible={...run.document,records:[record]};$('output-code').innerHTML=highlightJSON(visible);
  const observation=record.entries[0].event.data;
  const guide=[['Record type',run.profile.mode==='dialogue'?'Recorded transcript turns':run.profile.mode==='assistance_events'?'Explicit lifecycle import observation':'Reported participant summary'],['Dataset',run.profile.name],['Importer actor','QLM-transformer software; historical speaker is preserved in source payload'],['Original source timestamp',observation.original_source_timestamp??'Unknown; entry time records import'],['Assistance context',JSON.stringify(observation.assistance_context)],['Semantic profile',record.header.semantic_profile_binding?.id||'Unknown'],['Mapping review',record.header.semantic_mapping?.review?.status||'Unknown'],['Identifier scope',record.header.subject_scope||run.profile.subjectScope||'Dataset + tenant + key'],['Record scope',record.header.record_scope||run.profile.recordScope||'Source record'],['Person counts','Records are not distinct-person counts; no cross-source identity linkage'],['Input provenance',sourceKind(run)==='verified_public_sample'?'Unchanged published excerpt':sourceKind(run)==='synthetic_fixture'?'SYNTHETIC contract fixture':'User-supplied, unverified'],['Source file',run.sourceName],['Source SHA-256',run.sourceHash],['Mapping SHA-256',run.mappingHash],['Entries in this record',String(record.entries.length)],['Original reported fields',Object.keys(observation.reported_metrics||{}).join(', ')||'See source fields and transcript'],['Assistance evidence',evidenceLabel(observation.assistance||'not_established')],['Chain verification','Generated hashes match the contained record and checkpoint; this does not authenticate the publisher']];
  $('record-guide').innerHTML=guide.map(([label,value])=>'<div class="guide-item"><span class="guide-label">'+esc(label)+'</span><span class="guide-value">'+esc(value)+'</span></div>').join('');
  $('output-context').textContent='RECORD '+(state.recordIndex+1)+' OF '+run.records.length;$('output-preserved').hidden=true;renderEvidence(run,record);
}
function renderOutput(run){
  state.latest=run;state.recordIndex=0;$('output-placeholder').hidden=true;$('record-select').hidden=false;
  $('record-select').innerHTML=run.records.map((record,i)=>'<option value="'+i+'">Record '+(i+1)+' · '+record.entries.length+' entries</option>').join('');
  renderRecord();outputView($('guide-tab').getAttribute('aria-pressed')==='true'?'guide':'json');$('output-status').textContent='Chain checked';$('output-status').className='status-pill success';$('workbench').classList.add('is-complete');
  const count=run.records.reduce((n,r)=>n+r.entries.length,0);
  $('transform-result').innerHTML='<span class="result-check" aria-hidden="true">✓</span><span class="result-copy"><strong>'+formatCount(count)+' '+esc(observationUnit(run.profile))+' → '+formatCount(run.records.length)+' Learnlog records.</strong> Source-specific evidence and provenance retained.</span><span class="inline-hash mono" title="'+esc(run.sourceHash)+'">SHA-256 '+esc(shortHash(run.sourceHash))+'</span>';
  $('transform-result').hidden=false;updateOutputButtons();
}
async function transformCurrent(){
  if(state.busy)return;resetOutput();setBusy(true);$('workbench').classList.add('is-running');$('output-status').textContent='Transforming';$('output-status').className='status-pill working';
  try{
    markStep(0);await pause(260);markStep(1);
    const run=await transform({profileId:state.profileId,text:sourceText(),sourceName:state.sourceName,sourceKind:state.sourceKind});state.sourceKind=run.sourceKind;renderProvenance();await pause(440);
    markStep(2);await verify(run.document,run.checkpoint);await pause(340);markStep(3);renderOutput(run);
  }catch(e){$('output-status').textContent='Check your input';$('output-status').className='status-pill error';error('transform-error',e.message);markStep(-1);}
  finally{$('workbench').classList.remove('is-running');setBusy(false);}
}
async function loadFile(file){
  if(!file||state.busy)return;
  try{
    if(!/\.(csv|json|jsonl|ndjson)$/i.test(file.name))throw new Error('Choose a CSV, JSON or JSONL file matching the selected source format.');
    if(file.size>2_000_000)throw new Error('This demo accepts files up to 2 MB.');
    const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
    state.originalText=text;state.sourceName=file.name;state.sourceKind='unverified_user_input';$('source-input').value=text;
    resetOutput();sourceView('data');updateSourceMeta();toast('File loaded as unverified input. Review the source-specific mapping.');
  }catch(e){error('transform-error',e instanceof TypeError?'Use a UTF-8 encoded text file.':e.message);}
  finally{$('file-input').value='';}
}
function addRun(run){const exists=state.runs.find(r=>r.profile.id===run.profile.id&&r.sourceHash===run.sourceHash);if(!exists)state.runs.push(run);state.selected.add(run.profile.id);state.page=0;return !exists;}
function addCurrent(){if(!state.latest||state.busy)return;const added=addRun(state.latest);renderDataset();updateOutputButtons();toast(added?'Added '+state.latest.profile.name+' to the dataset.':'This exact source is already in the dataset.');}
async function combineAll(){
  if(state.busy)return;setBusy(true);error('dataset-error','');$('dataset-announcement').textContent='Transforming '+RESEARCH_PROFILES.length+' published research excerpts.';
  try{
    const additions=[];
    for(const p of RESEARCH_PROFILES){const run=await transform({profileId:p.id,text:getSample(p.id),sourceName:p.sampleName||p.id+'_sample.json',sourceKind:'verified_public_sample'});additions.push(run);await pause(100);}
    for(const run of additions)addRun(run);setAnalysis('scaffolding');renderDataset();$('dataset-announcement').textContent='Research excerpts combined with source-specific observation units and help evidence.';
    $('aggregate').scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'});toast('Research excerpts combined. Keep their different units and measures separate.');
  }catch(e){error('dataset-error',e.message);}finally{setBusy(false);}
}
function renderFilters(){
  if(!state.runs.length){$('product-filters').innerHTML='<span>Add a transformation or combine the published excerpts.</span>';return;}
  $('product-filters').innerHTML=PROFILES.filter(p=>state.runs.some(r=>r.profile.id===p.id)).map(p=>'<button class="filter-chip '+colorClasses[p.id]+(state.selected.has(p.id)?' active':'')+'" data-filter="'+p.id+'" aria-pressed="'+state.selected.has(p.id)+'"><span class="filter-dot"></span>'+esc(p.name)+'<span aria-hidden="true">'+(state.selected.has(p.id)?'✓':'＋')+'</span></button>').join('');
}
function renderCoverage(result,runs){
  // Different source units are displayed separately, without a comparative bar scale.
  $('coverage-bars').innerHTML=PROFILES.filter(p=>runs.some(r=>r.profile.id===p.id)).map(p=>{const rows=flattenRuns(runs.filter(r=>r.profile.id===p.id));return '<div class="source-coverage-row"><div><strong>'+esc(p.name)+'</strong><small>'+esc(observationUnit(p))+' · selected excerpt only</small></div><span>'+formatCount(rows.length)+'</span></div>';}).join('')||'<p class="empty-state">Combine the excerpts to inspect source coverage.</p>';
  const verified=runs.every(r=>sourceKind(r)==='verified_public_sample'),synthetic=runs.some(r=>sourceKind(r)==='synthetic_fixture');
  $('coverage-denominator').textContent=runs.length?'Counts describe selected excerpts: transcript turns and participant summaries are incompatible observation units. '+(verified?'Published excerpt provenance retained.':synthetic?'Includes a SYNTHETIC contract test; fixture assertions are not empirical observations.':'Includes unverified user input.'):'No source excerpts selected.';
  const counts=evidenceCounts(runs);
  $('help-evidence-list').innerHTML=counts.length?counts.map(c=>'<div><strong>'+formatCount(c.count)+'</strong><span>'+esc(evidenceLabel(c.kind))+'<small>'+esc(c.datasetName)+' · '+esc(c.unit)+'</small></span></div>').join(''):'<p>Add a source to see what its assistance data establishes.</p>';
}
function renderRecords(runs){
  const rows=flattenRuns(runs),size=8,pages=Math.ceil(rows.length/size);state.page=Math.max(0,Math.min(state.page,pages-1));
  const visible=rows.slice(state.page*size,(state.page+1)*size);
  $('records-tbody').innerHTML=visible.length?visible.map(row=>'<tr><td><span class="record-product '+colorClasses[row.product]+'">'+esc(row.productName)+'</span><small>'+(row.sourceKind==='verified_public_sample'?'Published excerpt':row.sourceKind==='synthetic_fixture'?'SYNTHETIC fixture':'Unverified user input')+'</small></td><td><span class="record-id mono" title="'+esc(row.subject)+'">'+esc(shortHash(row.subject))+'</span><small>'+esc(row.subjectScope)+' scope</small></td><td class="metric-cell">'+(row.dialogue?'<span><strong>'+esc(row.dialogue.role)+'</strong> '+esc(row.dialogue.text)+'</span>':row.lifecycle?'<span>'+esc(row.lifecycle.event_type)+' · '+esc(row.lifecycle.event_id)+'</span>':Object.entries(row.metrics).map(([k,v])=>'<span><strong>'+esc(k)+'</strong> '+esc(displayValue(v))+'</span>').join(''))+(row.missing.length?'<small>Missing: '+esc(row.missing.join(', '))+'</small>':'')+'</td><td>Input row '+esc(row.sourceRow)+(row.provenance.source_file_row!==undefined?'<small>Original file row '+esc(row.provenance.source_file_row)+(row.provenance.source_field_path?' · '+esc(row.provenance.source_field_path):'')+'</small>':'')+'<small title="'+esc(row.sourceHash)+'">'+esc(row.sourceName)+'</small></td><td><span class="unknown-pill">'+esc(evidenceLabel(row.assistance))+'</span></td></tr>').join(''):'<tr><td colspan="5" class="empty-state">Select a dataset to inspect its recorded source observations.</td></tr>';
  $('records-page-label').textContent=rows.length?'Entries '+(state.page*size+1)+'–'+Math.min((state.page+1)*size,rows.length)+' of '+formatCount(rows.length):'No entries selected.';
  $('records-prev').disabled=state.page===0;$('records-next').disabled=state.page>=pages-1;
}
function renderMetrics(result){
  $('metric-groups').innerHTML=result.products.length?result.products.map(p=>'<section class="metric-group"><h4>'+esc(p.name)+'</h4>'+p.metricSummaries.map(m=>'<div class="metric-summary"><div><strong>'+esc(m.name)+'</strong><small>'+m.count+' reported · '+m.missing+' missing</small></div><div class="metric-values">'+m.values.slice(0,24).map(v=>'<span class="metric-value">'+esc(displayValue(v))+'</span>').join('')+(m.values.length>24?'<small>+'+(m.values.length-24)+' more in export</small>':'')+'</div></div>').join('')+(!p.metricSummaries.length?'<p>Text observations are available in Records and the dialogue view.</p>':'')+'</section>').join(''):'<p class="empty-state">Combine excerpts to inspect their original reported fields.</p>';
}
function labelText(value){return ({scaffolding:'Scaffolding',rigor:'Rigor',both:'Both',neither:'Neither',mixed:'Mixed',unknown:'Unknown',unclear:'Unclear'})[value]||String(value);}
function sessionNumber(recordId){return (state.measurement?.sessions||[]).findIndex(session=>session.record_id===recordId)+1;}
function renderMeasurement(runs){
  const measurement=measureScaffolding(runs);state.measurement=measurement;
  const view=measurementPresentation(measurement),t=measurement.totals;
  $('measurement-status').textContent=view.available?'Published source coding · linked to recorded turns':runs.length?'Not measurable from the selected inputs':'Combine the examples to calculate';
  $('measurement-status').classList.toggle('available',view.available);$('measurement-ratio').textContent=view.ratio;
  for(const [id,key]of [['stat-intervals','intervals'],['stat-sessions','sessions'],['stat-providers','providers'],['stat-annotations','annotations']])$(id).textContent=typeof view.counters[key]==='number'?formatCount(view.counters[key]):view.counters[key];
  $('measurement-dedup-note').textContent=view.available?formatCount(t.annotation_rows)+' source annotation rows collapse to '+formatCount(t.intervals)+' distinct exact-span intervals. Some intervals overlap; they are not independent events.':'No compatible published coding is available for these selected inputs. Missing coding is unmeasured, not zero scaffolding.';
  $('measurement-origin').textContent='Published LLM-assisted labels over human situation / action / result notes. QLM joins existing coding to source turns; it does not run a new classifier.';
  if(view.available){
    const order=['scaffolding','rigor','both','mixed','neither','unclear','unknown'],sort=(a,b)=>(order.indexOf(a)<0?99:order.indexOf(a))-(order.indexOf(b)<0?99:order.indexOf(b));
    const needs=[...new Set(measurement.matrix.map(cell=>cell.need))].sort(sort),actions=[...new Set(measurement.matrix.map(cell=>cell.action))].sort(sort);
    $('measurement-matrix').innerHTML='<div class="matrix-scroll"><table class="coding-matrix"><caption>Counts of distinct source-coded intervals by published need and action label</caption><thead><tr><th scope="col">Need ↓ / Action →</th>'+actions.map(action=>'<th scope="col">'+esc(labelText(action))+'</th>').join('')+'</tr></thead><tbody>'+needs.map(need=>'<tr><th scope="row">'+esc(labelText(need))+'</th>'+actions.map(action=>{const count=measurement.matrix.find(cell=>cell.need===need&&cell.action===action)?.count||0;return '<td>'+(count?'<button data-measure-need="'+esc(need)+'" data-measure-action="'+esc(action)+'" aria-label="Inspect '+count+' intervals: need '+esc(need)+', action '+esc(action)+'">'+count+'</button>':'<span class="zero-count">0</span>')+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div>';
    $('measurement-sessions').innerHTML=measurement.sessions.map((session,i)=>'<div class="measured-session"><div><strong>Session '+(i+1)+'</strong><small>'+formatCount(session.intervals)+' coded intervals · '+formatCount(session.annotation_rows)+' annotation rows</small></div><span><strong>'+session.action_includes_scaffolding.numerator+'/'+session.action_includes_scaffolding.denominator+'</strong><small>action includes scaffolding</small></span></div>').join('');
  }else{
    state.measurementFilter=null;$('measurement-matrix').innerHTML='<p class="empty-state">A need × action measure requires compatible coded intervals. The selected data does not supply them.</p>';$('measurement-sessions').innerHTML='<p class="empty-state">No session denominator is established.</p>';
  }
  $('measurement-exclusions').innerHTML=measurement.exclusions.length?measurement.exclusions.map(item=>{const name=PROFILES.find(p=>p.id===item.dataset)?.name||item.dataset;return '<div class="measurement-exclusion"><span class="gap-mark" aria-hidden="true">—</span><div><strong>'+esc(name)+' · not measurable</strong><p>'+esc(item.reason)+'</p><small>'+formatCount(item.records)+' source records excluded from the scaffolding denominator.</small></div></div>';}).join(''):'<p>'+(runs.length?'All selected inputs with compatible published coding are represented. Uncoded turns remain outside the interval denominator.':'Select the research excerpts to inspect their measurement coverage.')+'</p>';
  $('measurement-method-content').innerHTML='<p><strong>Denominator:</strong> Distinct source conversation, scaffolding annotation type and exact turn-start / turn-end keys. Multiple annotator rows count once per interval. Overlapping and nested intervals remain separate audit units.</p><p><strong>Numerator:</strong> Intervals whose published action-direction label is scaffolding or both. This is a projection of source coding, not a measure of learner benefit.</p><p><strong>Scope:</strong> Two purposively selected sessions from one anonymized provider. The included participant table does not measure interval-level scaffolding.</p><ul>'+measurement.limitations.map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul><div class="measurement-source-links">'+Object.entries(measurement.provenance?.sources||{}).map(([name,item])=>safeLink(item.sample_url,'Download '+name+' excerpt')).join('')+'</div><pre>'+esc(JSON.stringify({measurement_profile:measurement.measurement_profile,provenance:measurement.provenance||null},null,2))+'</pre>';
  $('export-measurement-json').disabled=!runs.length;$('export-measurement-csv').disabled=!view.available;renderMeasurementIntervals();
}
function renderMeasurementIntervals(){
  const measurement=state.measurement;if(!measurement)return;
  const filter=state.measurementFilter,intervals=measurement.intervals.filter(item=>!filter||item.need===filter.need&&item.action===filter.action);
  $('clear-measurement-filter').hidden=!filter;
  $('measurement-filter-note').textContent=filter?'Showing '+intervals.length+' intervals: need '+labelText(filter.need)+' · action '+labelText(filter.action)+'.':'Open an interval to read the source judgments beside its recorded dialogue.';
  $('measurement-intervals').innerHTML=intervals.length?intervals.map(item=>'<tr><td><strong>Session '+sessionNumber(item.record_id)+'</strong><small>Source turns '+item.turn_start+'–'+item.turn_end+'</small></td><td><span class="coding-label">'+esc(labelText(item.need))+'</span></td><td><span class="coding-label action-label">'+esc(labelText(item.action))+'</span></td><td>'+formatCount(item.annotation_rows)+'</td><td><button class="text-button" data-measure-interval="'+esc(item.id)+'">Read the evidence ↗</button></td></tr>').join(''):'<tr><td colspan="5" class="empty-state">No compatible coded intervals selected. This is missing measurement evidence, not a count of zero scaffolding.</td></tr>';
}
function openInterval(id){
  const interval=state.measurement?.intervals.find(item=>item.id===id);if(!interval)return;state.activeInterval=id;
  const provenance=interval.provenance||{};
  $('measure-dialog-title').textContent='Session '+sessionNumber(interval.record_id)+' · source turns '+interval.turn_start+'–'+interval.turn_end;
  $('measure-dialog-content').innerHTML='<div class="interval-labels"><span>Source need: <strong>'+esc(labelText(interval.need))+'</strong></span><span>Source action: <strong>'+esc(labelText(interval.action))+'</strong></span><span>'+formatCount(interval.annotation_rows)+' annotation rows → 1 interval</span></div><p class="interval-locator">Transcript file row '+esc(provenance.source_transcript_line_1_based??'not supplied')+' · published coding file row '+esc(provenance.ground_truth_source_line_1_based??'not supplied')+'</p><p class="interval-origin">The labels are the publisher’s LLM-assisted roll-up of human judgments. The human notes below may disagree or include repeated annotators and interface passes. They remain judgments about a selected span, not evidence of a causal learning effect.</p><div class="interval-evidence-grid"><section><h3>Recorded Learnlog turns</h3><p class="evidence-column-note">Exact released transcript text and relative offsets. Machine transcription may contain errors.</p><ol class="dialogue-timeline interval-turns">'+interval.turns.map(turn=>'<li class="dialogue-turn '+(turn.role==='Tutor'?'tutor-turn':'student-turn')+'"><div class="dialogue-meta"><strong>'+esc(turn.role)+'</strong><span>Turn '+turn.turn_number+'</span><span>'+esc(turn.start_seconds)+'–'+esc(turn.end_seconds)+' s</span></div><p>'+esc(turn.text)+'</p></li>').join('')+'</ol></section><section><h3>Source human judgments</h3><p class="evidence-column-note">Situation / action / result text matched to the publisher’s original annotation file.</p><div class="source-judgments">'+interval.annotations.map((annotation,i)=>'<details class="source-judgment"'+(i===0?' open':'')+'><summary>Annotation row '+(i+1)+'</summary><dl>'+['situation','action','result'].map(key=>'<div><dt>'+esc(labelText(key))+'</dt><dd>'+esc(annotation[key]||'')+'</dd></div>').join('')+'</dl><small>'+esc((annotation.human_annotation_matches||[]).map(match=>'Annotation file row '+match.source_line_1_based+' · item '+match.turn_annotation_index_0_based).join('; '))+'</small></details>').join('')+'</div></section></div><details class="interval-audit"><summary>Source anchors, hashes and full coding provenance</summary><p>Published coding file row '+esc(provenance.ground_truth_source_line_1_based??'not supplied')+' · transcript turns '+interval.turn_start+'–'+interval.turn_end+'</p><p>'+safeLink(provenance.dataset_url,'Dataset release')+' · '+safeLink(provenance.ground_truth_url,'Published coding file')+' · '+safeLink(provenance.human_annotation_url,'Human annotation file')+'</p><pre>'+esc(JSON.stringify({interval_id:interval.id,record_id:interval.record_id,provenance},null,2))+'</pre></details>';
  $('measure-dialog').showModal();
}
function inspectIntervalRecord(){
  const interval=state.measurement?.intervals.find(item=>item.id===state.activeInterval);if(!interval)return;
  const run=state.runs.find(item=>item.records.some(record=>record.header.record_id===interval.record_id));if(!run)return;
  $('measure-dialog').close();setProfile(run.profile.id);renderOutput(run);state.recordIndex=run.records.findIndex(record=>record.header.record_id===interval.record_id);$('record-select').value=String(state.recordIndex);renderRecord();outputView('guide');$('transformer').scrollIntoView({behavior:reducedMotion?'auto':'smooth',block:'start'});
}
function renderPooling(runs){
  const report=assessPoolingCompatibility(runs);
  $('pooling-status').textContent=report.eligible?'Declared conditions compatible for descriptive pooling':'Cross-source pooling is not established';
  $('pooling-reasons').innerHTML=report.reasons.length?'<ul>'+report.reasons.map(reason=>'<li><strong>'+esc(reason.source_id||'Selection')+'</strong>: '+esc(reason.detail)+'</li>').join('')+'</ul>':'<p>Declared definitions pass this compatibility screen. Independent observations, equivalent constructs and causal effects still require research justification.</p>';
  $('pooling-report').textContent=JSON.stringify(report,null,2);$('export-pooling').disabled=!runs.length;
}
function renderDataset(){
  const runs=selectedRuns(),result=aggregate(runs),metricTypes=result.products.reduce((n,p)=>n+p.metricSummaries.length,0),rows=flattenRuns(runs);
  $('stat-products').textContent=formatCount(new Set(runs.filter(r=>sourceKind(r)==='verified_public_sample').map(r=>r.profile.id)).size);$('stat-rows').textContent=formatCount(rows.length);$('stat-records').textContent=formatCount(runs.reduce((n,r)=>n+r.records.length,0));$('stat-metrics').textContent=formatCount(metricTypes);
  $('record-count-badge').textContent=formatCount(rows.length);renderFilters();renderMeasurement(runs);renderCoverage(result,runs);renderRecords(runs);renderMetrics(result);renderPooling(runs);
  $('clear-dataset').disabled=!state.runs.length||state.busy;$('export-dataset').disabled=!runs.length;$('export-csv').disabled=!runs.length;
}
function setAnalysis(view){state.analysis=view;document.querySelectorAll('[data-analysis]').forEach(el=>{const active=el.dataset.analysis===view;el.classList.toggle('active',active);el.setAttribute('aria-pressed',String(active));});for(const key of ['scaffolding','coverage','records','metrics'])$('analysis-'+key).hidden=key!==view;}
function bind(){
  $('product-picker').innerHTML=PROFILES.map(p=>'<button class="product-tab '+colorClasses[p.id]+'" data-product="'+p.id+'" aria-pressed="false"><span class="product-monogram">'+esc(monograms[p.id]||p.id.slice(0,2))+'</span><span class="product-info"><span class="product-name">'+esc(p.name)+'</span><span class="product-caption">'+esc(p.mode==='dialogue'?'Recorded tutoring transcript':p.mode==='assistance_events'?'SYNTHETIC contract test':'Participant-level help condition')+'</span></span></button>').join('');
  $('product-picker').addEventListener('click',e=>{const b=e.target.closest('[data-product]');if(b)setProfile(b.dataset.product);});
  $('source-input').addEventListener('input',()=>{state.originalText=null;state.sourceKind='unverified_user_input';resetOutput();updateSourceMeta();});
  $('source-input').addEventListener('scroll',()=>{$('source-lines').scrollTop=$('source-input').scrollTop;});
  $('evidence-content').addEventListener('click',e=>{if(e.target.closest('[data-dialogue-toggle]')){state.showAllTurns=!state.showAllTurns;renderRecord();}});
  $('measurement-matrix').addEventListener('click',e=>{const button=e.target.closest('[data-measure-need]');if(button){state.measurementFilter={need:button.dataset.measureNeed,action:button.dataset.measureAction};renderMeasurementIntervals();}});
  $('measurement-intervals').addEventListener('click',e=>{const button=e.target.closest('[data-measure-interval]');if(button)openInterval(button.dataset.measureInterval);});
  $('clear-measurement-filter').addEventListener('click',()=>{state.measurementFilter=null;renderMeasurementIntervals();});
  $('export-measurement-json').addEventListener('click',()=>download('qlm_scaffolding_measurement.json',JSON.stringify(state.measurement,null,2)));
  $('export-measurement-csv').addEventListener('click',()=>download('qlm_scaffolding_intervals.csv',createScaffoldingCSV(state.measurement),'text/csv;charset=utf-8'));
  for(const id of ['close-measure-dialog','measure-dialog-done'])$(id).addEventListener('click',()=>$('measure-dialog').close());
  $('measure-dialog-record').addEventListener('click',inspectIntervalRecord);
  $('sample-btn').addEventListener('click',loadSample);$('transform-btn').addEventListener('click',transformCurrent);
  $('input-tab').addEventListener('click',()=>sourceView('data'));$('mapping-tab').addEventListener('click',()=>sourceView('mapping'));$('json-tab').addEventListener('click',()=>outputView('json'));$('guide-tab').addEventListener('click',()=>outputView('guide'));
  $('record-select').addEventListener('change',e=>{state.recordIndex=Number(e.target.value);state.showAllTurns=false;renderRecord();});$('file-input').addEventListener('change',e=>loadFile(e.target.files?.[0]));
  $('dropzone').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&!state.busy){e.preventDefault();$('file-input').click();}});$('dropzone').addEventListener('dragover',e=>{e.preventDefault();if(!state.busy)$('dropzone').classList.add('drag-active');});$('dropzone').addEventListener('dragleave',()=>$('dropzone').classList.remove('drag-active'));
  $('dropzone').addEventListener('drop',e=>{e.preventDefault();$('dropzone').classList.remove('drag-active');if(e.dataTransfer.files.length>1){error('transform-error','Choose one source file at a time.');return;}loadFile(e.dataTransfer.files[0]);});
  $('download-sample').addEventListener('click',()=>download(profile().sampleName||state.profileId+'_sample.json',getSample(state.profileId),/\.csv$/i.test(profile().sampleName||'')?'text/csv;charset=utf-8':/\.(jsonl|ndjson)$/i.test(profile().sampleName||'')?'application/x-ndjson':'application/json'));
  $('mapping-download').addEventListener('click',()=>download(state.profileId+'_mapping.json',JSON.stringify({mapping:profile().mapping,semantic_contract:getSemanticContract(state.profileId)},null,2)));
  $('download-output').addEventListener('click',()=>{if(state.latest)download(state.latest.profile.id+'_learnlog.json',JSON.stringify(state.latest.document,null,2),'application/learnlog+json');});
  $('copy-output').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(JSON.stringify(state.latest.document,null,2));toast('Full Learnlog document copied.');}catch{toast('Clipboard access unavailable. Use Download Learnlog instead.');}});
  $('add-dataset').addEventListener('click',addCurrent);for(const id of ['combine-all','hero-combine'])$(id).addEventListener('click',combineAll);
  $('clear-dataset').addEventListener('click',()=>{state.runs=[];state.selected.clear();state.page=0;state.measurementFilter=null;renderDataset();updateOutputButtons();toast('Dataset cleared from this tab.');});
  $('product-filters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;const id=b.dataset.filter;state.selected.has(id)?state.selected.delete(id):state.selected.add(id);state.page=0;renderDataset();});
  document.querySelectorAll('[data-analysis]').forEach(el=>el.addEventListener('click',()=>setAnalysis(el.dataset.analysis)));$('records-prev').addEventListener('click',()=>{state.page--;renderRecords(selectedRuns());});$('records-next').addEventListener('click',()=>{state.page++;renderRecords(selectedRuns());});
  $('export-dataset').addEventListener('click',()=>download('qlm_research_excerpts.json',JSON.stringify(createDataset(selectedRuns(),undefined,state.measurement),null,2)));$('export-pooling').addEventListener('click',()=>download('qlm_pooling_compatibility.json',JSON.stringify(assessPoolingCompatibility(selectedRuns()),null,2)));
  $('export-csv').addEventListener('click',()=>download('qlm_source_observations.csv',createCSV(selectedRuns()),'text/csv;charset=utf-8'));
  for(const id of ['about-btn','footer-notes','research-notes-btn'])$(id).addEventListener('click',()=>$('notes-dialog').showModal());for(const id of ['close-notes','notes-done'])$(id).addEventListener('click',()=>$('notes-dialog').close());
  $('notes-dialog').addEventListener('click',e=>{if(e.target===$('notes-dialog')){const r=$('notes-dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$('notes-dialog').close();}});
  setProfile(PROFILES[0].id);renderDataset();setBusy(false);
}
try{bind();}catch(e){error('transform-error','The demo could not initialize: '+e.message);}
