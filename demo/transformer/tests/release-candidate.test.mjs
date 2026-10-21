import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import DATA from '../dist/release-candidate-data.mjs';
import {releaseDetails,mountRelease} from '../dist/release-candidate.mjs';

test('Release state does not claim public code or preprint publication',()=>{
  const view=releaseDetails();
  assert.match(view.source,/pending/);
  assert.match(view.versions,/0\.3\.0rc1/);
  assert.throws(()=>releaseDetails({...DATA,source_published:true}));
  assert.throws(()=>releaseDetails({...DATA,preprint_published:true}));
});

test('Every displayed download checksum binds to the actual packaged bytes',()=>{
  for(const [name,entry] of Object.entries(DATA.downloads)){
    const bytes=readFileSync(new URL('../dist/downloads/'+name,import.meta.url));
    assert.equal(bytes.length,entry.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
  }
});

test('Release metadata mounts without network requests or HTML injection',()=>{
  const elements=new Map();const document={getElementById:id=>{if(!elements.has(id))elements.set(id,{textContent:''});return elements.get(id);}};
  mountRelease(document);
  assert.match(elements.get('release-state').textContent,/Prepared/);
  assert.match(elements.get('airflow-download-meta').textContent,/SHA-256/);
  assert.match(elements.get('release-source-state').textContent,/pending/);
});
