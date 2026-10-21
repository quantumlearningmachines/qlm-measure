import {assessPoolingCompatibility} from './research-semantics.mjs';
// Pure display/export helpers. Values come from the source or explicit provenance.
export const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const displayValue = value => typeof value === 'string' ? value : JSON.stringify(value);
export const shortHash = value => value ? value.slice(0,10)+'…'+value.slice(-6) : '—';
export function highlightJSON(value) {
  const json=JSON.stringify(value,null,2), pattern=/"(?:\\.|[^"\\])*"\s*:|"(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let result='',end=0;
  for(const m of json.matchAll(pattern)){
    result+=escapeHTML(json.slice(end,m.index));const t=m[0];
    const kind=t.endsWith(':')?'key':t.startsWith('"')?'string':t==='null'?'null':t==='true'||t==='false'?'boolean':'number';
    result+='<span class="json-'+kind+'">'+escapeHTML(t)+'</span>';end=m.index+t.length;
  }
  return result+escapeHTML(json.slice(end));
}
export const sourceKind = run => run.sourceKind === 'verified_public_sample' && run.sourceVerified === true ? 'verified_public_sample' : run.sourceKind==='synthetic_fixture'&&run.sourceHash===run.profile.source?.fixtureSha256?'synthetic_fixture':'unverified_user_input';
export const observationUnit = profile => profile.mode === 'dialogue' ? 'transcript turns' : profile.mode==='assistance_events'?'explicit lifecycle assertions':'participant summaries';
export function flattenRuns(runs) {
  return runs.flatMap(run=>run.records.flatMap(record=>record.entries.map(entry=>{
    const data=entry.event.data,provenance=data.provenance||{};
    return {
      product:run.profile.id,productName:run.profile.name,recordId:record.header.record_id,
      subject:record.header.subject,subjectScope:record.header.subject_scope||run.profile.subjectScope||'source-specific',recordScope:record.header.record_scope||run.profile.recordScope||'source-record',
      sourceName:run.sourceName,sourceHash:run.sourceHash,mappingHash:run.mappingHash,
      sourceRow:provenance.source_row??provenance.import_row??entry.seq,provenance,
      activity:entry.event.activity?.id||'Unspecified',metrics:data.reported_metrics||{},missing:data.missing_metrics||[],
      assistance:data.assistance||'not_established',eventName:entry.event.name,entryTime:entry.time,
      rawSourceFields:data.raw_source_fields||{},dialogue:data.dialogue||null,helpEvidence:data.help_evidence||null,
      assistanceContext:data.assistance_context||null,lifecycle:data.lifecycle||null,originalSourceTimestamp:data.original_source_timestamp??null,importer:entry.event.actor||null,semanticProfile:record.header.semantic_profile_binding||null,
      entryHash:entry.entry_hash,sourceKind:sourceKind(run),unit:observationUnit(run.profile)
    };
  })));
}

export function dialogueView(run,recordIndex=0,showAll=false) {
  const record=run.records[recordIndex];
  const turns=record?flattenRuns([{...run,records:[record]}]).filter(row=>row.dialogue):[];
  const published=sourceKind(run)==='verified_public_sample';
  const window=published?(run.profile.source?.demonstrationWindows||[]).find(item=>item.recordIndex===recordIndex)||null:null;
  const visibleTurns=window&&!showAll?turns.filter(row=>row.dialogue.turn_number>=window.startTurn&&row.dialogue.turn_number<=window.endTurn):turns;
  return {turns,visibleTurns,window,published};
}

export function evidenceCounts(runs) {
  const counts=new Map();
  for(const row of flattenRuns(runs)){
    const key=row.product+'\u0000'+row.assistance;
    if(!counts.has(key))counts.set(key,{dataset:row.product,datasetName:row.productName,kind:row.assistance,count:0,unit:row.unit});
    counts.get(key).count++;
  }
  return [...counts.values()];
}
export function sourceLocator(provenance={},dialogue=null) {
  const parts=[];
  if(provenance.source_file_row!==undefined)parts.push('Original file row '+provenance.source_file_row);
  else if(provenance.source_row!==undefined)parts.push('Input row '+provenance.source_row);
  if(dialogue?.turn_number!==undefined)parts.push('Turn '+dialogue.turn_number);
  else if(provenance.source_field_path)parts.push(provenance.source_field_path);
  return parts.join(' · ')||'Source locator not supplied';
}
export function measurementPresentation(measurement) {
  const t=measurement?.totals||{},action=t.action_includes_scaffolding||{};
  const available=measurement?.status==='available'&&t.intervals>0&&action.denominator>0;
  return {available,ratio:available?action.numerator+'/'+action.denominator:'—',
    counters:{intervals:available?t.intervals:'—',sessions:available?t.sessions:'—',providers:available?t.providers:'—',annotations:available?t.annotation_rows:'—'}};
}
export function createDataset(runs,createdAt=new Date().toISOString(),measurement=null) {
  return {
    dataset_format:'qlm-transformer-research-excerpts:0.2',created_at:createdAt,
    description:'Source-specific research excerpts in Learnlog containers. Counts describe selected inputs only.',
    scaffolding_measurement:measurement,pooling_compatibility:assessPoolingCompatibility(runs),
    scope:{identity:'Pseudonyms are scoped to dataset, tenant and key. Records are not distinct-person counts; no cross-source identity linkage',observation_units:'Transcript turns and participant summaries are different units; no pooled performance estimate',assistance:'Recorded utterances and assigned help conditions have different meanings; absence of external help is not established'},
    inputs:runs.map(run=>({dataset:run.profile.id,source_name:run.sourceName,source_kind:sourceKind(run),
      reference_release:sourceKind(run)==='verified_public_sample'?(run.profile.source||null):null,provided_excerpt_unchanged:sourceKind(run)==='verified_public_sample',
      source_sha256:run.sourceHash,mapping_sha256:run.mappingHash,mapping_profile:run.profile.mapping,semantic_mapping:run.semanticContract||null,synthetic_fixture:sourceKind(run)==='synthetic_fixture',
      observation_unit:observationUnit(run.profile),subject_scope:run.profile.subjectScope||'source-specific',record_scope:run.profile.recordScope||'source-record',
      checkpoint:run.checkpoint,learnlog:run.document}))
  };
}
function csvCell(value) {
  let text=String(value??'');
  // Guard free text for spreadsheet consumers. The JSON export retains raw values.
  if(/^[\s]*[=+@\t\r]/.test(text)||(/^[\s]*-/.test(text)&&!/^\s*-\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*$/.test(text)))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export function createCSV(runs) {
  const header=['source_dataset','source_kind','observation_unit','record_id','record_scope','subject_scope','scoped_subject','source_file','source_row','source_provenance_json','activity','event_name','entry_time','assistance_evidence','dialogue_json','assistance_context_json','lifecycle_json','original_source_timestamp','semantic_profile_json','help_evidence_json','reported_metrics_json','missing_metrics_json','raw_source_fields_json','source_sha256','mapping_sha256','entry_hash'];
  const rows=flattenRuns(runs).map(r=>[r.product,r.sourceKind,r.unit,r.recordId,r.recordScope,r.subjectScope,r.subject,r.sourceName,r.sourceRow,JSON.stringify(r.provenance),r.activity,r.eventName,r.entryTime,r.assistance,JSON.stringify(r.dialogue),JSON.stringify(r.assistanceContext),JSON.stringify(r.lifecycle),r.originalSourceTimestamp,JSON.stringify(r.semanticProfile),JSON.stringify(r.helpEvidence),JSON.stringify(r.metrics),JSON.stringify(r.missing),JSON.stringify(r.rawSourceFields),r.sourceHash,r.mappingHash,r.entryHash]);
  return [header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
