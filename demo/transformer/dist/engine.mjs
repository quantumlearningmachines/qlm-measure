// QLM research-data adapters. QLM-authored code: MIT.
// These adapters preserve documented observations, without inferring help delivery
// from an assigned condition or classifying dialogue without a validated annotation.
import {PROFILES, ALL_PROFILES, getProfile, getSample} from './profiles.mjs';
import {ASSISTANCE_CONTEXT_PROFILE,IMPORT_EVENT_SCHEMA,LIFECYCLE_EVENT_SCHEMA,normalizeContext,getSemanticContract,ASSISTANCE_EVENT_TYPES,assessPoolingCompatibility} from './research-semantics.mjs';
export {PROFILES, ALL_PROFILES, getSample, normalizeContext, getSemanticContract, assessPoolingCompatibility};
export const ENGINE_VERSION = '0.4.0-research-adapters';
export const IMPORT_SCHEMA = 'https://transformer.quantumlearningmachines.com/schemas/research-import-v2.json';
export const LIFECYCLE_SCHEMA = LIFECYCLE_EVENT_SCHEMA.$id;
export const DEMO_SECRET = 'QLM browser demonstration key 2026; use a deployment-specific secret for real exports';
export const SESSION_SECRET = crypto.randomUUID()+crypto.randomUUID();
const enc = new TextEncoder();
const numericKinds = new WeakMap();
const own = (o,k) => Object.prototype.hasOwnProperty.call(o,k);
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function unicode(text) {
  for (let i=0;i<text.length;i++) {
    const c=text.charCodeAt(i);
    if (c>=0xd800 && c<=0xdbff) {
      const n=text.charCodeAt(++i);
      if (!(n>=0xdc00 && n<=0xdfff)) throw new Error('Unpaired Unicode surrogate is not supported.');
    } else if (c>=0xdc00 && c<=0xdfff) throw new Error('Unpaired Unicode surrogate is not supported.');
  }
  return text;
}
// RFC 8785: ECMAScript number serialization, UTF-16 property ordering, no spaces.
export function canonicalize(value) {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(unicode(value));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Non-finite JSON numbers are not supported.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return '['+value.map(canonicalize).join(',')+']';
  if (plain(value)) return '{'+Object.keys(value).sort().map(k => JSON.stringify(unicode(k))+':'+canonicalize(value[k])).join(',')+'}';
  throw new Error('Only JSON values can be canonicalized.');
}
const hex = bytes => Array.from(new Uint8Array(bytes), b=>b.toString(16).padStart(2,'0')).join('');
export async function sha256(value) {
  const bytes = typeof value === 'string' ? enc.encode(value) : value;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}
export async function digest(value) { return sha256(canonicalize(value)); }
export async function subjectId(platform, tenant, value, secret=DEMO_SECRET) {
  const bytes = enc.encode(secret);
  if (bytes.length < 32) throw new Error('The pseudonym key must contain at least 32 UTF-8 bytes.');
  let identifier;
  if (typeof value === 'string' && value.trim()) identifier=unicode(value);
  else if (typeof value === 'number' && Number.isSafeInteger(value)) identifier=String(value);
  else throw new Error('Learner identifiers must be nonempty text or safe, non-boolean integers.');
  const key=await crypto.subtle.importKey('raw',bytes,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return 'qlm:'+hex(await crypto.subtle.sign('HMAC', key, enc.encode(canonicalize([tenant,platform,identifier]))));
}
// Small strict parser: duplicate members and unsafe literal integers are rejected
// before JSON.parse can silently discard keys or round identifiers.
export function parseStrictJSON(text) {
  let i=0;
  const fail = message => { throw new Error(message+' at character '+(i+1)+'.'); };
  const ws = () => { while (/\s/.test(text[i]||'') && i<text.length) { if (!' \t\n\r'.includes(text[i])) fail('Invalid JSON whitespace'); i++; } };
  function string() {
    const begin=i++;
    while (i<text.length) {
      if (text[i]==='"') { i++; try { return unicode(JSON.parse(text.slice(begin,i))); } catch { fail('Invalid JSON string'); } }
      if (text.charCodeAt(i)<32) fail('Unescaped control character');
      if (text[i]==='\\') i+=2; else i++;
    }
    fail('Unterminated JSON string');
  }
  function value(depth=0) {
    if (depth>50) fail('JSON nesting exceeds the demo limit');
    ws();
    if (text[i]==='"') return string();
    if (text[i]==='{') {
      i++; const obj=Object.create(null), keys=new Set(); ws();
      if (text[i]==='}') {i++;return obj;}
      while (i<text.length) {
        ws(); if(text[i]!== '"') fail('Expected an object member');
        const key=string(); if(keys.has(key)) fail('Duplicate JSON member'); keys.add(key);
        ws(); if(text[i++]!==':') fail('Expected a colon'); ws(); const start=i;obj[key]=value(depth+1);
        if(typeof obj[key]==='number'&&/[.eE]/.test(text.slice(start,i))){if(!numericKinds.has(obj))numericKinds.set(obj,new Map());numericKinds.get(obj).set(key,'float');}ws();
        const c=text[i++]; if(c==='}') return obj; if(c!==',') fail('Expected a comma or closing brace');
      }
      fail('Unterminated JSON object');
    }
    if(text[i]==='[') {
      i++; const arr=[]; ws(); if(text[i]===']'){i++;return arr;}
      while(i<text.length) { arr.push(value(depth+1));ws();const c=text[i++];if(c===']')return arr;if(c!==',')fail('Expected a comma or closing bracket'); }
      fail('Unterminated JSON array');
    }
    for(const [literal,result] of [['true',true],['false',false],['null',null]]) if(text.slice(i,i+literal.length)===literal){i+=literal.length;return result;}
    const match=text.slice(i).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if(match){i+=match[0].length;const n=Number(match[0]);if(!Number.isFinite(n))fail('Non-finite JSON number');if(!/[.eE]/.test(match[0])&&!Number.isSafeInteger(n))fail('Integer exceeds the exact JSON range; quote identifiers');return n;}
    fail('Expected a JSON value');
  }
  const result=value();ws();if(i!==text.length)fail('Unexpected trailing content');return result;
}
export function parseCSV(text) {
  const table=[];let row=[],cell='',quoted=false,afterQuote=false;
  for(let i=0;i<=text.length;i++) {
    const c=text[i];
    if(quoted) {if(c===undefined)throw new Error('CSV has an unterminated quoted field.');if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;afterQuote=true;}}else cell+=c;continue;}
    if(afterQuote && c!==',' && c!=='\n' && c!=='\r' && c!==undefined) throw new Error('Unexpected text after a quoted CSV field.');
    if(c==='"'){if(cell.length)throw new Error('CSV quote must start a field.');quoted=true;continue;}
    if(c===','||c==='\n'||c==='\r'||c===undefined){row.push(unicode(cell));cell='';afterQuote=false;if(c===',')continue;if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x!==''))table.push(row);row=[];}else cell+=c;
  }
  if(table.length<2)throw new Error('CSV needs a header and at least one data row.');
  const headers=table.shift();if(headers.some(h=>!h.trim())||new Set(headers).size!==headers.length)throw new Error('CSV headers must be nonempty and unique.');
  return table.map((cells,index)=>{if(cells.length!==headers.length)throw new Error('CSV row '+(index+2)+' has a different number of fields.');const o=Object.create(null);headers.forEach((h,j)=>o[h]=cells[j]);return o;});
}
export function parseInput(text, sourceName='input.json') {
  if(typeof text!=='string'||!text.trim())throw new Error('Add a sample or choose a file before transforming.');
  if(enc.encode(text).length>2_000_000)throw new Error('This browser demo accepts files up to 2 MB.');
  const clean=text.charCodeAt(0)===0xfeff?text.slice(1):text;
  let rows;
  if(/\.csv$/i.test(sourceName)||(!/^[\s]*[\[{]/.test(clean))) rows=parseCSV(clean);
  else if(clean.trimStart().startsWith('[')) rows=parseStrictJSON(clean);
  else rows=clean.split(/\r?\n/).filter(line=>line.trim()).map(parseStrictJSON);
  if(!Array.isArray(rows)||!rows.length||rows.length>5000||rows.some(r=>!plain(r)))throw new Error('Use 1–5,000 object rows in CSV, a JSON array or JSONL.');
  return rows;
}
function randomSalt() {const bytes=crypto.getRandomValues(new Uint8Array(16));return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function timestamp(text) {
  if(typeof text!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text)||!Number.isFinite(Date.parse(text)))throw new Error('Import time must be a valid UTC timestamp.');
  if(text.startsWith('0000')||new Date(text).toISOString().slice(0,19)!==text.slice(0,19))throw new Error('Import time is outside the supported calendar range.');
  return text;
}
function fieldAt(row,path) {
  let container=row;const parts=path.split('.');
  for(const key of parts.slice(0,-1)) {
    if(!plain(container)||!own(container,key))return {present:false};
    container=container[key];
  }
  const key=parts.at(-1);
  return {present:plain(container)&&own(container,key),value:plain(container)?container[key]:undefined,container,key};
}
function mappedField(row,path,index,label,{identifier=false}={}) {
  const field=fieldAt(row,path);
  if(!field.present||field.value===null||field.value==='')throw new Error('Row '+(index+1)+': the mapped '+label+' column is missing.');
  if(identifier&&numericKinds.get(field.container)?.get(field.key)==='float')throw new Error('Row '+(index+1)+': floating-point learner identifiers are not supported; use text or integers.');
  return field.value;
}
function sourceDetails(profile) {
  const result={};
  for(const key of ['kind','url','downloadUrl','revision','license','licenseUrl','citation','selectionNote','limitations','sampleSha256','sourceSha256','sourceRows','summary'])if(profile.source&&own(profile.source,key))result[key]=profile.source[key];
  return result;
}
function dialogueFields(row,turn) {
  const result={turn:Object.fromEntries(['turn_number','start_seconds','end_seconds','role','text'].map(key=>[key,turn[key]]))};
  for(const key of ['source','batch','has_video'])if(own(row,key))result[key]=row[key];
  const session={};
  for(const key of ['transcription_by','primary_language','prior_session_count'])if(own(row.session,key))session[key]=row.session[key];
  result.session=session;
  return result;
}
function validateTurns(row,index) {
  if(!Array.isArray(row.turns)||!row.turns.length)throw new Error('Row '+(index+1)+': a transcript requires a nonempty turns array.');
  const turnNumbers=new Set();
  for(let i=0;i<row.turns.length;i++) {
    const turn=row.turns[i];
    if(!plain(turn)||!['Student','Tutor'].includes(turn.role)||typeof turn.text!=='string'||!Number.isSafeInteger(turn.turn_number)||turn.turn_number<1)throw new Error('Row '+(index+1)+', turn '+(i+1)+': expected source role, text and positive integer turn_number.');
    if(turnNumbers.has(turn.turn_number))throw new Error('Row '+(index+1)+': duplicate source turn_number.');
    turnNumbers.add(turn.turn_number);
    for(const key of ['start_seconds','end_seconds'])if(typeof turn[key]!=='number'||!Number.isFinite(turn[key])||turn[key]<0)throw new Error('Row '+(index+1)+', turn '+(i+1)+': source offsets must be finite, nonnegative seconds.');
    if(turn.end_seconds<turn.start_seconds)throw new Error('Row '+(index+1)+', turn '+(i+1)+': source end offset precedes its start.');
    // No chronological sorting: source array order and raw offsets remain observable.
  }
}
function validateLifecycle(row,index) {
  const label='Row '+(index+1)+': ';
  for(const key of ['source_id','event_id','subject_id','activity_id'])if(typeof row[key]!=='string'||!row[key].trim()||Array.from(row[key]).length>512)throw new Error(label+key+' must be nonempty text of at most 512 characters.');
  if(!Number.isSafeInteger(row.source_revision)||row.source_revision<0)throw new Error(label+'source_revision must be a nonnegative integer.');
  if(!ASSISTANCE_EVENT_TYPES.includes(row.event_type))throw new Error(label+'unsupported explicit assistance event_type.');
  if(row.source_timestamp!==undefined&&row.source_timestamp!==null)timestamp(row.source_timestamp);
  for(const key of ['assistance_id','request_event_id'])if(row[key]!==undefined&&row[key]!==null&&(typeof row[key]!=='string'||!row[key].trim()||Array.from(row[key]).length>512))throw new Error(label+key+' must be nonempty bounded text or null.');
  if(row.request_origin!==undefined&&!['requested','unsolicited','unknown'].includes(row.request_origin))throw new Error(label+'invalid request_origin.');
  if(row.request_origin==='unsolicited'&&row.request_event_id)throw new Error(label+'unsolicited origin conflicts with a request link.');
  if(row.native_hint_depth!==undefined&&row.native_hint_depth!==null&&!(typeof row.native_hint_depth==='string'&&row.native_hint_depth.trim())&&!(Number.isSafeInteger(row.native_hint_depth)&&row.native_hint_depth>=0))throw new Error(label+'native_hint_depth must be a nonnegative integer, nonempty text or null.');
  if(row.delivery_order!==undefined&&row.delivery_order!==null&&!(Number.isSafeInteger(row.delivery_order)&&row.delivery_order>0))throw new Error(label+'delivery_order must be a positive integer or null.');
  if(row.content!==undefined&&typeof row.content!=='string')throw new Error(label+'content must be text.');
  normalizeContext(row.context===undefined?{}:row.context);
}
export async function transform({profileId,text,secret=SESSION_SECRET,tenant='demo',sourceName='input.json',sourceKind='unverified_user_input',importedAt=new Date().toISOString().replace('.000Z','Z')}) {
  const profile=getProfile(profileId),mapping=profile.mapping,rows=parseInput(text,sourceName);
  if(typeof tenant!=='string'||!tenant.trim())throw new Error('A tenant scope is required.');
  timestamp(importedAt);
  const sourceHash=await sha256(text),mappingHash=await digest(mapping),semanticContract=getSemanticContract(profileId);
  const eventSchema=profile.mode==='assistance_events'?LIFECYCLE_EVENT_SCHEMA:IMPORT_EVENT_SCHEMA;
  const semanticBinding={id:ASSISTANCE_CONTEXT_PROFILE.profile_id,version:ASSISTANCE_CONTEXT_PROFILE.version,sha256:await digest(ASSISTANCE_CONTEXT_PROFILE),hash_basis:'RFC8785'};
  const eventSchemaBinding={id:eventSchema.$id,sha256:await digest(eventSchema),hash_basis:'RFC8785'};
  const sourceVerified=!!profile.source?.sampleSha256&&sourceHash===profile.source.sampleSha256;
  // Caller descriptions cannot establish published provenance. Only exact public
  // sample bytes bind this import to the pinned, independently inspected source.
  const verifiedKind=sourceVerified?'verified_public_sample':profile.source?.fixtureSha256===sourceHash?'synthetic_fixture':'unverified_user_input';
  const publishedSource=sourceVerified?sourceDetails(profile):null;
  if(profile.mode==='dialogue') {
    for(const [index,row]of rows.entries())validateTurns(row,index);
    if(rows.reduce((n,row)=>n+row.turns.length,0)>5000)throw new Error('This browser demo accepts at most 5,000 dialogue turns.');
  }
  if(profile.mode==='assistance_events'){
    const identities=new Set();
    for(const [index,row]of rows.entries()){
      validateLifecycle(row,index);
      const identity=JSON.stringify([row.source_id,row.event_id,row.source_revision]);
      if(identities.has(identity))throw new Error('Repeated native event identity and revision in one input; use the cumulative ledger to reconcile batches.');
      identities.add(identity);
    }
    if(new Set(rows.map(row=>row.source_id)).size!==1)throw new Error('Use one source_id per input to preserve source-specific mapping review and strata.');
    for(const row of rows){if(row.request_event_id){const requests=rows.filter(candidate=>candidate.event_id===row.request_event_id&&candidate.source_id===row.source_id);if(requests.some(request=>request.event_type!=='help_requested'||request.activity_id!==row.activity_id||request.subject_id!==row.subject_id))throw new Error('Request link must identify a same-learner, same-activity explicit help request.');}}
  }
  const records=[];
  for(const [index,row]of rows.entries()) {
    const identifier=mappedField(row,mapping.fields.subject_id,index,'learner identifier',{identifier:true});
    const sourceNamespace=profile.mode==='assistance_events'?row.source_id:null;
    const subject=await subjectId(sourceNamespace?profileId+':'+sourceNamespace:profileId,tenant,identifier,secret);
    const activity=mappedField(row,mapping.fields.activity_id,index,'activity');
    if(typeof activity!=='string'||!activity)throw new Error('Row '+(index+1)+': this source adapter requires a nonempty text activity label.');
    const record={header:{record_id:crypto.randomUUID(),subject,hash_alg:'sha-256',created:importedAt,producer:{name:'QLM-transformer research adapters',version:ENGINE_VERSION},source_platform:profileId,source_sha256:sourceHash,mapping_sha256:mappingHash,import_mode:profile.mode,source_kind:verifiedKind,subject_scope:profile.subjectScope||'dataset + tenant + key',record_scope:profile.recordScope||(profile.mode==='dialogue'?'transcript_session':'participant_summary'),semantic_profile_binding:semanticBinding,event_schema_bindings:[eventSchemaBinding],semantic_mapping:semanticContract,assistance_coverage:!sourceVerified?'actual_help_use_not_established_by_this_adapter':profile.mode==='dialogue'?'source_dialogue_only_no_validated_help_classification':'actual_help_use_not_reported_in_participant_table',event_order_basis:profile.mode==='dialogue'?'source_turn_array_order':'input_row_order_not_independently_verified'},event_schemas:[eventSchema.$id],entries:[]};
    if(sourceNamespace)record.header.source_namespace=sourceNamespace;
    if(publishedSource)record.header.source_provenance=publishedSource;
    const recordHash=await digest(record.header),sourceRecordHash=await digest(row);
    const baseProvenance={platform:profileId,source_kind:verifiedKind,source_sha256:sourceHash,source_row:index+1,source_record_sha256:sourceRecordHash,imported_at:importedAt,mapping_sha256:mappingHash};
    if(publishedSource){baseProvenance.source_file_sha256=publishedSource.sourceSha256;if(publishedSource.sourceRows?.[index]!==undefined)baseProvenance.source_file_row=publishedSource.sourceRows[index];}
    const observations=profile.mode==='dialogue'?row.turns:[row];
    for(const [observationIndex,observation]of observations.entries()) {
      let event;
      if(profile.mode==='dialogue') {
        const dialogue={};
        for(const key of ['role','text','turn_number','start_seconds','end_seconds'])dialogue[key]=observation[key];
        event={name:'qlm_import:dialogue_turn_observed',salt:randomSalt(),data:{provenance:{...baseProvenance,source_field_path:'turns['+observationIndex+']'},time_basis:'import_time',source_time_basis:'relative_offsets_seconds',dialogue,raw_source_fields:dialogueFields(row,observation),reported_metrics:{},missing_metrics:[],assistance:observation.role==='Tutor'?'tutor_utterance_recorded':'student_utterance_recorded'},activity:{id:String(activity)}};
        // Actor describes the present importer; the historical speaker remains source data.
      } else if(profile.mode==='assistance_events') {
        const lifecycle=Object.fromEntries(['source_id','event_id','source_revision','event_type'].map(key=>[key,row[key]]));
        Object.assign(lifecycle,{source_timestamp:row.source_timestamp??null,assistance_id:row.assistance_id??null,request_event_id:row.request_event_id??null,request_origin:row.request_origin??'unknown',native_hint_depth:row.native_hint_depth??null,delivery_order:row.delivery_order??null});
        if(Object.hasOwn(row,'content'))lifecycle.content=row.content;
        const nativeIdentity=await digest([profileId,row.source_id,row.event_id]);
        event={name:'qlm_import:assistance_lifecycle_observed',salt:randomSalt(),data:{provenance:{...baseProvenance,native_identity_sha256:nativeIdentity,source_revision:row.source_revision},time_basis:'import_time',original_source_timestamp:row.source_timestamp??null,lifecycle,assistance_context:normalizeContext(row.context===undefined?{}:row.context),raw_source_fields:{...lifecycle,context:row.context===undefined?{}:row.context},reported_metrics:{},missing_metrics:[],assistance:row.event_type},activity:{id:String(activity)}};
      } else {
        if(typeof row.condition!=='string'||!['ChatGPT','Human tutor','No-hint control'].includes(row.condition))throw new Error('Row '+(index+1)+': the OATutor adapter requires a documented assigned condition (ChatGPT, Human tutor or No-hint control).');
        const reported_metrics=Object.create(null),missing_metrics=[];
        for(const [label,column]of Object.entries(mapping.metrics)){
          const field=fieldAt(row,column);
          if(field.present&&field.value!==''&&field.value!==null)reported_metrics[label]=field.value;else missing_metrics.push(label);
        }
        const raw_source_fields=Object.fromEntries(['lesson','condition','preTest','postTest','sessionTime','totalUniqueSteps','learningGain'].filter(key=>own(row,key)).map(key=>[key,row[key]]));
        const help_evidence={condition:row.condition,actual_help_use:sourceVerified?'not_reported_in_participant_table':'not_established_by_this_adapter'};
        event={name:'qlm_import:participant_summary_observed',salt:randomSalt(),data:{provenance:{...baseProvenance},time_basis:'import_time',reported_metrics,missing_metrics,raw_source_fields,help_evidence,assistance:'assigned_condition_only'},actor:{role:'system',kind:'software',id:'QLM-transformer'},activity:{id:String(activity)}};
      }
      event.actor={role:'system',kind:'software',id:'QLM-transformer'};
      if(profile.mode!=='assistance_events'){event.data.original_source_timestamp=null;event.data.assistance_context=normalizeContext();}
      const entry={seq:record.entries.length+1,time:importedAt,event_hash:await digest(event),prev_hash:record.entries.length?record.entries.at(-1).entry_hash:recordHash};
      entry.entry_hash=await digest({record_hash:recordHash,...entry});entry.event=event;record.entries.push(entry);
    }
    records.push(record);
  }
  const document={file_schema:'urn:ietf:params:learnlog:file:contained',serialization_format:'application/learnlog+json',records};
  const checkpoint=await verify(document),entries=records.flatMap(r=>r.entries),eventTypes={};
  for(const entry of entries)eventTypes[entry.event.name]=(eventTypes[entry.event.name]||0)+1;
  const summary={inputRowCount:rows.length,rowCount:entries.length,recordCount:records.length,eventCount:entries.length,unit:profile.mode==='dialogue'?'dialogue_turns':profile.mode==='assistance_events'?'assistance_lifecycle_events':'participant_summaries',eventTypes,missingMetricCount:entries.reduce((n,e)=>n+e.event.data.missing_metrics.length,0),assistanceUnknownCount:profile.mode==='summary'?entries.length:0};
  return {id:crypto.randomUUID(),profile,semanticContract,sourceNamespace:profile.mode==='assistance_events'?rows[0].source_id:profileId,rows,document,records,checkpoint,sourceName,sourceHash,mappingHash,sourceKind:verifiedKind,sourceVerified,requestedSourceKind:sourceKind,summary};
}
async function validateImportedEvent(event,header,entryTime) {
  if(!plain(event)||!plain(event.data)||!plain(event.activity)||typeof event.activity.id!=='string'||!event.activity.id.trim())throw new Error('Invalid imported event activity or payload.');
  if(canonicalize(event.actor)!==canonicalize({role:'system',kind:'software',id:'QLM-transformer'}))throw new Error('Imported event actor must describe the importer software.');
  const data=event.data,p=data.provenance;
  if(!plain(p)||p.source_kind!==header.source_kind||p.platform!==header.source_platform||p.mapping_sha256!==header.mapping_sha256||p.source_sha256!==header.source_sha256||!Number.isSafeInteger(p.source_row)||p.source_row<1||p.imported_at!==entryTime||!['verified_public_sample','unverified_user_input','synthetic_fixture'].includes(p.source_kind))throw new Error('Invalid import provenance.');
  for(const key of ['source_sha256','mapping_sha256','source_record_sha256'])if(typeof p[key]!=='string'||!/^[a-f0-9]{64}$/.test(p[key]))throw new Error('Invalid import provenance digest.');
  if(data.time_basis!=='import_time'||!plain(data.raw_source_fields)||!plain(data.reported_metrics)||!Array.isArray(data.missing_metrics)||data.missing_metrics.some(value=>typeof value!=='string')||new Set(data.missing_metrics).size!==data.missing_metrics.length)throw new Error('Invalid import data structure.');
  if(!plain(data.assistance_context)||canonicalize(data.assistance_context)!==canonicalize(normalizeContext(data.assistance_context)))throw new Error('Imported assistance context must include the complete normalized context.');
  if(header.import_mode==='dialogue'){
    if(event.name!=='qlm_import:dialogue_turn_observed'||!plain(data.dialogue)||Object.keys(data.dialogue).sort().join(',')!==['role','text','turn_number','start_seconds','end_seconds'].sort().join(','))throw new Error('Invalid imported dialogue shape.');
    validateTurns({turns:[data.dialogue]},0);
    if(data.original_source_timestamp!==null||data.source_time_basis!=='relative_offsets_seconds'||Object.keys(data.reported_metrics).length||data.missing_metrics.length||data.assistance!==(data.dialogue.role==='Tutor'?'tutor_utterance_recorded':'student_utterance_recorded'))throw new Error('Invalid imported dialogue semantics.');
  }else if(header.import_mode==='summary'){
    if(event.name!=='qlm_import:participant_summary_observed'||data.original_source_timestamp!==null||data.assistance!=='assigned_condition_only'||!plain(data.help_evidence)||!['ChatGPT','Human tutor','No-hint control'].includes(data.help_evidence.condition)||!['not_reported_in_participant_table','not_established_by_this_adapter'].includes(data.help_evidence.actual_help_use))throw new Error('Invalid imported participant summary semantics.');
  }else if(header.import_mode==='assistance_events'){
    const lifecycle=data.lifecycle;
    if(event.name!=='qlm_import:assistance_lifecycle_observed'||!plain(lifecycle)||!['source_id','event_id','source_revision','event_type','source_timestamp','assistance_id','request_event_id','request_origin','native_hint_depth','delivery_order'].every(key=>own(lifecycle,key))||Object.keys(lifecycle).some(key=>!['source_id','event_id','source_revision','event_type','source_timestamp','assistance_id','request_event_id','request_origin','native_hint_depth','delivery_order','content'].includes(key)))throw new Error('Invalid imported lifecycle shape.');
    validateLifecycle({...lifecycle,subject_id:header.subject,activity_id:event.activity.id,context:data.assistance_context},0);
    if(p.native_identity_sha256!==await digest([header.source_platform,lifecycle.source_id,lifecycle.event_id])||p.source_revision!==lifecycle.source_revision)throw new Error('Native event identity or revision contradicts import provenance.');
    if(data.assistance!==lifecycle.event_type||data.original_source_timestamp!==lifecycle.source_timestamp||lifecycle.source_id!==header.source_namespace||Object.keys(data.reported_metrics).length||data.missing_metrics.length)throw new Error('Invalid imported lifecycle semantics.');
  }else throw new Error('Unsupported import mode.');
}
export async function verify(document,expectedHeads) {
  if(!plain(document)||document.file_schema!=='urn:ietf:params:learnlog:file:contained'||document.serialization_format!=='application/learnlog+json'||!Array.isArray(document.records)||!document.records.length)throw new Error('Unsupported LearnLog document.');
  const heads=Object.create(null);
  for(const record of document.records){
    if(!plain(record.header)||typeof record.header.record_id!=='string'||!record.header.record_id.trim()||record.header.hash_alg!=='sha-256'||!Array.isArray(record.entries)||!record.entries.length)throw new Error('Invalid LearnLog record.');
    if('truncated' in record||'signed_heads' in record)throw new Error('This browser subset does not verify signatures or truncated records.');
    timestamp(record.header.created);
    if(own(heads,record.header.record_id))throw new Error('Duplicate record identifier.');
    const semantic=record.header.semantic_profile_binding;
    if(!plain(semantic)||semantic.id!==ASSISTANCE_CONTEXT_PROFILE.profile_id||semantic.version!==ASSISTANCE_CONTEXT_PROFILE.version||semantic.hash_basis!=='RFC8785'||semantic.sha256!==await digest(ASSISTANCE_CONTEXT_PROFILE))throw new Error('Unsupported or mismatched semantic profile binding.');
    const schema=record.header.import_mode==='assistance_events'?LIFECYCLE_EVENT_SCHEMA:IMPORT_EVENT_SCHEMA;
    const bindings=record.header.event_schema_bindings;
    if(!Array.isArray(bindings)||bindings.length!==1||bindings[0].id!==schema.$id||bindings[0].hash_basis!=='RFC8785'||bindings[0].sha256!==await digest(schema)||canonicalize(record.event_schemas)!==canonicalize([schema.$id]))throw new Error('Unsupported or mismatched event schema binding.');
    if(canonicalize(record.header.semantic_mapping)!==canonicalize(getSemanticContract(record.header.source_platform)))throw new Error('Semantic mapping does not match the versioned profile.');
    const recordHash=await digest(record.header);let prev=recordHash;
    for(let i=0;i<record.entries.length;i++){
      const entry=record.entries[i];
      if(entry.seq!==i+1||entry.prev_hash!==prev)throw new Error('Broken LearnLog sequence or previous hash.');
      timestamp(entry.time);
      if(!plain(entry.event)||typeof entry.event.name!=='string'||!entry.event.name.trim()||typeof entry.event.salt!=='string'||!entry.event.salt||!plain(entry.event.data)||'redacted' in entry)throw new Error('This browser subset requires complete, structured events.');
      if(entry.event.actor&&(!plain(entry.event.actor)||typeof entry.event.actor.role!=='string'||!entry.event.actor.role.trim()||!['human','software'].includes(entry.event.actor.kind)||('id' in entry.event.actor&&(typeof entry.event.actor.id!=='string'||!entry.event.actor.id.trim()))))throw new Error('Invalid event actor.');
      await validateImportedEvent(entry.event,record.header,entry.time);
      if(!entry.event||await digest(entry.event)!==entry.event_hash)throw new Error('LearnLog event hash mismatch.');
      const computed=await digest({record_hash:recordHash,seq:entry.seq,time:entry.time,event_hash:entry.event_hash,prev_hash:entry.prev_hash});
      if(computed!==entry.entry_hash)throw new Error('LearnLog entry hash mismatch.');prev=computed;
    }
    heads[record.header.record_id]={seq:record.entries.length,entry_hash:prev};
  }
  if(expectedHeads&&canonicalize(heads)!==canonicalize(expectedHeads))throw new Error('External checkpoint mismatch.');
  return heads;
}
export function aggregate(runs) {
  const products=new Map();
  for(const run of runs){
    const platform=run.profile.id,stratum=platform+'\u0000'+(run.sourceNamespace||platform);
    if(!products.has(stratum))products.set(stratum,{platform,sourceNamespace:run.sourceNamespace||platform,name:run.profile.name,mode:run.profile.mode,unit:run.summary.unit,inputRowCount:0,rowCount:0,recordCount:0,eventCount:0,missingMetricCount:0,assistanceUnknownCount:0,eventTypes:{},metricSummaries:[],activities:[]});
    const product=products.get(stratum);
    for(const key of ['inputRowCount','rowCount','recordCount','eventCount','missingMetricCount','assistanceUnknownCount'])product[key]+=run.summary[key];
    for(const [name,count]of Object.entries(run.summary.eventTypes))product.eventTypes[name]=(product.eventTypes[name]||0)+count;
    for(const [name]of Object.entries(run.profile.metrics)){
      let metric=product.metricSummaries.find(m=>m.name===name);if(!metric){metric={name,values:[],count:0,missing:0};product.metricSummaries.push(metric);}
      for(const record of run.records)for(const entry of record.entries){const d=entry.event.data;if(own(d.reported_metrics,name)){metric.values.push(d.reported_metrics[name]);metric.count++;}else metric.missing++;}
    }
    for(const record of run.records)for(const entry of record.entries){const id=entry.event.activity?.id||'Unspecified';let a=product.activities.find(a=>a.id===id);if(!a){a={id,count:0};product.activities.push(a);}a.count++;}
  }
  const list=[...products.values()],eventTypes={};
  for(const p of list)for(const [name,count]of Object.entries(p.eventTypes))eventTypes[name]=(eventTypes[name]||0)+count;
  return {inputRowCount:list.reduce((n,p)=>n+p.inputRowCount,0),rowCount:list.reduce((n,p)=>n+p.rowCount,0),recordCount:list.reduce((n,p)=>n+p.recordCount,0),eventCount:list.reduce((n,p)=>n+p.eventCount,0),productCount:list.length,products:list,eventTypes,assistanceUnknownCount:list.reduce((n,p)=>n+p.assistanceUnknownCount,0),missingMetricCount:list.reduce((n,p)=>n+p.missingMetricCount,0)};
}
