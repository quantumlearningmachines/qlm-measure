// Descriptive projection of published companion annotations, never inferred help events.
import {SCAFFOLDING_EVIDENCE as evidence} from './scaffolding-evidence.mjs';
const clone=value=>JSON.parse(JSON.stringify(value));
const turnFields=['turn_number','start_seconds','end_seconds','role','text'];
const projection=turn=>turnFields.map(key=>turn?.[key]);
const source=evidence.sources['transcripts.jsonl'];
const expectedHash=source.sample_sha256;
const countRecords=run=>(run.records||run.document?.records||[]).length;
const rawRecords=run=>run.records||run.document?.records||[];
const isPublished=run=>run.sourceKind==='verified_public_sample'&&run.sourceVerified===true&&run.sourceHash===expectedHash;
function matchingTranscript(record){
  const entries=record?.entries;
  if(!record?.header||!Array.isArray(entries)||!entries.length)return null;
  const header=record.header;
  if(header.source_platform!=='tutormoments'||header.source_kind!=='verified_public_sample'||header.source_sha256!==expectedHash||typeof header.record_id!=='string'||!header.record_id||typeof header.subject!=='string'||!header.subject)return null;
  const id=entries[0]?.event?.activity?.id;
  const transcript=evidence.transcripts.find(t=>t.id===id);
  if(!transcript||entries.length!==transcript.turns.length)return null;
  for(let i=0;i<entries.length;i++){
    const event=entries[i]?.event,data=event?.data,p=data?.provenance;
    if(event?.name!=='qlm_import:dialogue_turn_observed'||event?.activity?.id!==id||!data?.dialogue||Object.keys(data.dialogue).length!==turnFields.length||JSON.stringify(projection(data.dialogue))!==JSON.stringify(projection(transcript.turns[i])))return null;
    if(p?.source_kind!=='verified_public_sample'||p?.source_sha256!==expectedHash||p?.source_record_sha256!==transcript.source_record_sha256||p?.source_file_sha256!==source.sha256||p?.source_file_row!==transcript.source_file_line_1_based||p?.source_field_path!=='turns['+i+']')return null;
    if(JSON.stringify(projection(data.raw_source_fields?.turn))!==JSON.stringify(projection(transcript.turns[i]))||data.raw_source_fields?.source!==transcript.provider)return null;
  }
  return transcript;
}
/** Synchronous, no fetch/storage/classifier. Unknown/mismatched inputs stay unmeasured. */
export function measureScaffolding(runs){
  const intervals=[],sessions=[],exclusions=[],seen=new Set();
  for(const run of runs){
    const dataset=run.profile?.id||'unknown';
    if(dataset!=='tutormoments'){
      exclusions.push({dataset,records:countRecords(run),reason:dataset==='oatutor'?'Assigned conditions and participant summaries do not report observed scaffolding dialogue or compatible coded intervals.':'No compatible published companion annotations for this source.'});
      continue;
    }
    if(!isPublished(run)){
      exclusions.push({dataset,records:countRecords(run),reason:'Input is not the exact verified public transcript excerpt; published annotations cannot be inherited by edited or unverified data.'});
      continue;
    }
    for(const record of rawRecords(run)){
      const transcript=matchingTranscript(record);
      if(!transcript){exclusions.push({dataset,records:1,reason:'Transformed dialogue or source provenance does not match the pinned published transcript; annotation applicability is unmeasured.'});continue;}
      if(seen.has(transcript.id)){exclusions.push({dataset,records:1,reason:'Repeated published source session omitted from coded-interval counts to prevent duplicate aggregation.'});continue;}
      seen.add(transcript.id);
      const windows=evidence.windows.filter(w=>w.transcript_id===transcript.id);
      for(const window of windows){
        const indexes=window.annotations.map(a=>a.ground_truth_key_moment_index_0_based);
        intervals.push({id:window.id,record_id:record.header.record_id,subject:record.header.subject,transcript_id:transcript.id,dataset,provider:transcript.provider,turn_start:window.turn_start,turn_end:window.turn_end,need:window.need,action:window.action,annotation_rows:window.annotation_rows,annotations:clone(window.annotations),turns:record.entries.map(entry=>entry.event.data.dialogue).filter(turn=>turn.turn_number>=window.turn_start&&turn.turn_number<=window.turn_end).map(clone),provenance:{dataset_url:evidence.dataset_url,revision:evidence.revision,license:evidence.license,ground_truth_url:evidence.sources['ground_truth.jsonl'].url,ground_truth_sha256:evidence.sources['ground_truth.jsonl'].sha256,ground_truth_source_line_1_based:window.ground_truth_source_line_1_based,ground_truth_source_line_sha256:window.ground_truth_source_line_sha256,ground_truth_field_paths:indexes.map(i=>'key_moments['+i+']'),source_label_fields:{need:'situation_label_agg',action:'action_direction_agg'},human_annotation_url:evidence.sources['annotations.jsonl'].url,human_annotation_sha256:evidence.sources['annotations.jsonl'].sha256,source_transcript_url:source.url,source_transcript_sha256:source.sha256,source_transcript_sample_sha256:expectedHash,source_transcript_line_1_based:transcript.source_file_line_1_based,label_origin:evidence.label_origin}});
      }
      sessions.push({id:transcript.id,record_id:record.header.record_id,subject:record.header.subject,dataset,provider:transcript.provider,turns:record.entries.length,intervals:windows.length,annotation_rows:windows.reduce((n,w)=>n+w.annotation_rows,0),action_includes_scaffolding:{numerator:windows.filter(w=>['scaffolding','both'].includes(w.action)).length,denominator:windows.length}});
    }
  }
  intervals.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  sessions.sort((a,b)=>a.id.localeCompare(b.id,'en'));
  const cells=new Map();
  for(const interval of intervals){const key=interval.need+'\u0000'+interval.action;if(!cells.has(key))cells.set(key,{need:interval.need,action:interval.action,count:0});cells.get(key).count++;}
  const matrix=[...cells.values()].sort((a,b)=>a.need.localeCompare(b.need,'en')||a.action.localeCompare(b.action,'en'));
  return {measurement_profile:evidence.measurement_profile,status:intervals.length?'available':'unmeasured',totals:{intervals:intervals.length,annotation_rows:intervals.reduce((n,i)=>n+i.annotation_rows,0),sessions:sessions.length,providers:new Set(sessions.map(s=>s.provider)).size,action_includes_scaffolding:{numerator:intervals.filter(i=>['scaffolding','both'].includes(i.action)).length,denominator:intervals.length}},matrix,sessions,intervals,exclusions,limitations:[...evidence.limitations],provenance:{dataset_url:evidence.dataset_url,revision:evidence.revision,license:evidence.license,license_url:evidence.license_url,attribution:evidence.attribution,label_origin:evidence.label_origin,denominator:'Distinct (transcript_id, annotation_type=scaffolding, turn_start, turn_end) exact-span keys in the published annotation companion.',deduplication:'One interval count per exact published span; repeated annotation rows, interface passes and source sessions do not add interval counts.',human_text_verification:clone(evidence.human_text_verification),sources:clone(evidence.sources)}};
}
function csvCell(value){let text=String(value??'');if(/^[\s]*[=+@\t\r]/.test(text)||(/^[\s]*-/.test(text)&&!/^\s*-\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*$/.test(text)))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
export function createScaffoldingCSV(measurement){
  const header=['measurement_profile','source_dataset','provider','source_transcript_id','record_id','scoped_subject','interval_id','turn_start','turn_end','published_need_label','published_action_direction_label','source_annotation_rows','included_interval_denominator','label_origin','source_revision','ground_truth_url','ground_truth_source_line_1_based','ground_truth_field_paths_json','source_transcript_sample_sha256','source_evidence_turns_json','human_annotation_evidence_json','interval_provenance_json'];
  const rows=measurement.intervals.map(i=>[measurement.measurement_profile,i.dataset,i.provider,i.transcript_id,i.record_id,i.subject,i.id,i.turn_start,i.turn_end,i.need,i.action,i.annotation_rows,measurement.totals.intervals,i.provenance.label_origin,i.provenance.revision,i.provenance.ground_truth_url,i.provenance.ground_truth_source_line_1_based,JSON.stringify(i.provenance.ground_truth_field_paths),i.provenance.source_transcript_sample_sha256,JSON.stringify(i.turns),JSON.stringify(i.annotations),JSON.stringify(i.provenance)]);
  return [header,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
