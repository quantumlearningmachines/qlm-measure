import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';

const base=new URL('../dist/',import.meta.url);
const metadata=JSON.parse(readFileSync(new URL('downloads/qlm-transformer-airflow.json',base),'utf8'));
const archive=readFileSync(new URL('downloads/'+metadata.filename,base));

function readZipMember(zip,name){
  let end=zip.length-22;
  while(end>=0&&zip.readUInt32LE(end)!==0x06054b50)end--;
  assert.ok(end>=0,'ZIP end record must exist');
  const count=zip.readUInt16LE(end+10);let cursor=zip.readUInt32LE(end+16);
  for(let i=0;i<count;i++){
    assert.equal(zip.readUInt32LE(cursor),0x02014b50);
    const nameLength=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30),comment=zip.readUInt16LE(cursor+32);
    const filename=zip.subarray(cursor+46,cursor+46+nameLength).toString('utf8');
    if(filename===name){
      const compression=zip.readUInt16LE(cursor+10),length=zip.readUInt32LE(cursor+20),offset=zip.readUInt32LE(cursor+42);
      assert.equal(zip.readUInt32LE(offset),0x04034b50);
      const start=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);
      const compressed=zip.subarray(start,start+length);
      assert.ok(compression===0||compression===8,'Only stored/deflate download members are expected');
      return compression===8?inflateRawSync(compressed):compressed;
    }
    cursor+=46+nameLength+extra+comment;
  }
  assert.fail(`Download member is missing: ${name}`);
}

test('Airflow download matches its published byte count and SHA-256',()=>{
  assert.equal(archive.length,metadata.bytes);
  assert.equal(createHash('sha256').update(archive).digest('hex'),metadata.sha256);
  assert.equal(archive.readUInt32LE(0),0x04034b50);
});

test('Website CTA points to the actual downloadable package',()=>{
  const html=readFileSync(new URL('demo.html',base),'utf8');
  assert.match(html,/id="download-airflow"[^>]+href="\.\/downloads\/qlm-transformer-airflow\.zip"[^>]+download=/);
  assert.match(html,/href="#airflow"/);
  assert.equal(metadata.pipeline_version,'0.5.0rc1');
  assert.equal(metadata.source_adapter_version,'0.4.0-research-adapters');
  assert.equal(metadata.transformer_version,'0.3.0rc1');
});

test('Assistance-profile CTA has a separate packaged implementation download',()=>{
  const html=readFileSync(new URL('demo.html',base),'utf8');
  assert.match(html,/href="\.\/downloads\/learnlog-assistance-profile-draft\.zip" download="learnlog-assistance-profile-draft\.zip"/);
  const profile=readFileSync(new URL('downloads/learnlog-assistance-profile-draft.zip',base));
  assert.equal(profile.readUInt32LE(0),0x04034b50);
  assert.notEqual(createHash('sha256').update(profile).digest('hex'),metadata.sha256,'New profile download must not alias the unchanged Airflow archive');
  const prefix='learnlog-assistance-profile-draft/';
  for(const name of ['carrier_bindings.py','learnlog-xapi-profile.json','assistance-capture.schema.json','importer-observation.schema.json'])assert.ok(readZipMember(profile,prefix+name).length>0,name);
  assert.deepEqual(readZipMember(profile,prefix+'examples/carriers/demo-bindings.json'),readFileSync(new URL('examples/assistance-profile-bindings.json',base)),'The profile download and UI must use the exact same generated binding fixture bytes');
});

test('Airflow ZIP directory contains source and examples without runtime data or credentials',()=>{
  let end=archive.length-22;
  while(end>=0&&archive.readUInt32LE(end)!==0x06054b50)end--;
  assert.ok(end>=0,'ZIP end record must exist');
  const count=archive.readUInt16LE(end+10);let cursor=archive.readUInt32LE(end+16);const names=[];
  for(let i=0;i<count;i++){
    assert.equal(archive.readUInt32LE(cursor),0x02014b50);
    const nameLength=archive.readUInt16LE(cursor+28),extra=archive.readUInt16LE(cursor+30),comment=archive.readUInt16LE(cursor+32);
    names.push(archive.subarray(cursor+46,cursor+46+nameLength).toString('utf8'));cursor+=46+nameLength+extra+comment;
  }
  assert.equal(count,metadata.files);
  assert.equal(names.some(name=>/samples\/(?:khan_academy|mathia|ixl|dreambox|aleks)\.json$/.test(name)),false,'Unsupported branded examples must not remain in the download');
  for(const name of names){assert.ok(name.startsWith('qlm-transformer-airflow/'));assert.doesNotMatch(name,/(?:^|\/)(?:\.env(?:\.[^/]*)?|outputs|inputs|__pycache__|\.venv[^/]*|\.airflow|build)(?:\/|$)|\.pyc$|\.egg-info\//);assert.ok(!name.split('/').includes('..'));}
  for(const name of ['README.md','LICENSE','DOWNLOAD_MANIFEST.json','dags/qlm_transformer_pipeline.py','samples/tutormoments-real-transcripts.jsonl','samples/oatutor-real-participants.csv','provenance/tutormoments.json','provenance/oatutor.json','provenance/scaffolding-evidence.json','provenance/tutormoments-real-ground-truth.jsonl','provenance/tutormoments-real-human-annotations.jsonl','src/qlm_airflow/scaffolding.py','src/qlm_airflow/semantics.py','src/qlm_airflow/ledger.py','schemas/research-import-v2.json','schemas/assistance-context-v0.1.0.json','schemas/assistance-lifecycle-v1.json','config/synthetic-batch-1.json','config/synthetic-batch-2.json','config/synthetic-correction.json','schemas/research-import-v1.json','DATA_LICENSES.md'])assert.ok(names.includes('qlm-transformer-airflow/'+name),name);
});
