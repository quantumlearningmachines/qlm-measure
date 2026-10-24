// Backward compatibility: documents written by this engine before the sandpiper source existed.
// tests/fixtures/pre-sandpiper holds real transform() outputs from the commit in its MANIFEST.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {transform,verify,getSample,ALL_PROFILES} from '../dist/engine.mjs';

const dir=new URL('./fixtures/pre-sandpiper/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('MANIFEST.json',dir),'utf8'));
const load=file=>JSON.parse(readFileSync(new URL(file,dir),'utf8'));
const withoutSalt=({salt,...rest})=>rest;
const withoutRecordId=({record_id,...rest})=>rest;
// The engine builds some objects with a null prototype; compare JSON values only.
const plain=value=>JSON.parse(JSON.stringify(value));

test('Pre-sandpiper fixtures are the six recorded real outputs for the three existing sources',()=>{
  assert.equal(manifest.documents.length,6);
  assert.match(manifest.generator_commit,/^[0-9a-f]{40}$/);
  assert.deepEqual([...new Set(manifest.documents.map(d=>d.platform))].sort(),['explicit-assistance-events','oatutor','tutormoments']);
  for(const item of manifest.documents)assert.equal(createHash('sha256').update(readFileSync(new URL(item.file,dir))).digest('hex'),item.sha256,item.file);
});

test('Every pre-sandpiper document still verifies with its recorded chain heads',async()=>{
  for(const item of manifest.documents){
    const document=load(item.file);
    assert.deepEqual(plain(await verify(document,item.heads)),item.heads,item.file);
    for(const record of document.records){
      assert.equal(record.header.semantic_profile_binding.id,'qlm:assistance-context:0.1.0');
      assert.equal(record.header.source_kind,item.source_kind);
    }
  }
});

test('Existing sources still produce the same documents as before sandpiper was added',async()=>{
  for(const item of manifest.documents){
    const profile=ALL_PROFILES.find(p=>p.id===item.platform);
    const before=load(item.file);
    const run=await transform({profileId:item.platform,text:getSample(item.platform)+(item.input_byte_changed?'\n':''),sourceName:profile.sampleName,tenant:manifest.tenant,secret:manifest.pseudonym_key_utf8,importedAt:manifest.imported_at});
    assert.equal(run.sourceKind,item.source_kind);
    assert.equal(run.records.length,before.records.length);
    run.records.forEach((record,index)=>{
      const old=before.records[index];
      assert.deepEqual(plain(withoutRecordId(record.header)),withoutRecordId(old.header),item.file);
      assert.deepEqual(record.event_schemas,old.event_schemas);
      assert.deepEqual(plain(record.entries.map(e=>withoutSalt(e.event))),old.entries.map(e=>withoutSalt(e.event)),item.file);
    });
  }
});

test('An old document re-bound to the new profile version is rejected',async()=>{
  const {SEMANTIC_PROFILES}=await import('../dist/research-semantics.mjs');
  const {digest}=await import('../dist/engine.mjs');
  const document=load('oatutor.learnlog.json');
  const record=document.records[0];
  const newer=SEMANTIC_PROFILES.find(p=>p.version==='0.2.0');
  record.header.semantic_profile_binding={id:newer.profile_id,version:newer.version,sha256:await digest(newer),hash_basis:'RFC8785'};
  await assert.rejects(()=>verify(document),/semantic profile/);
});
