import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeCrossSource} from '../dist/cross-source-analysis.mjs';
import PACKAGED from '../dist/cross-source-analysis-data.mjs';

test('Selected descriptive counts reproduce the pipeline-generated aggregate facts', () => {
  const result = summarizeCrossSource(PACKAGED);
  assert.equal(result.assistance_request_observations, PACKAGED.aggregate.assistance_request_observations);
  assert.equal(result.source_count, PACKAGED.aggregate.source_count);
  assert.equal(result.cumulative.at(-1).cumulative_count, result.assistance_request_observations);
  for (const source of PACKAGED.sources) {
    const single = summarizeCrossSource(PACKAGED, [source.source_id]);
    assert.equal(single.source_count, 1);
    assert.equal(single.assistance_request_observations, source.assistance_request_observations);
  }
});

test('Remove, re-add, reorder and repeated selections do not double count a source', () => {
  const ids = PACKAGED.sources.map(source => source.source_id);
  const original = summarizeCrossSource(PACKAGED);
  assert.equal(summarizeCrossSource(PACKAGED, [...ids, ...ids]).assistance_request_observations, original.assistance_request_observations);
  assert.deepEqual(summarizeCrossSource(PACKAGED, ids.toReversed ? ids.toReversed() : [...ids].reverse()).cumulative, original.cumulative);
  assert.equal(summarizeCrossSource(PACKAGED, ids.slice(1)).assistance_request_observations + PACKAGED.sources[0].assistance_request_observations, original.assistance_request_observations);
  assert.deepEqual(summarizeCrossSource(PACKAGED, ids), original);
});

test('No source selection is zero selected records, not evidence of zero actual assistance', () => {
  const empty = summarizeCrossSource(PACKAGED, []);
  assert.equal(empty.source_count, 0);
  assert.equal(empty.assistance_request_observations, 0);
  for (const key of ['actual_request_total','request_rate','request_to_display_rate','learning_effect','unique_cross_source_learners']) {
    assert.equal(empty[key], null);
    assert.equal(summarizeCrossSource(PACKAGED)[key], null);
  }
});

test('Selection cannot invent a source, accept duplicates in the source definition or sum invalid counts', () => {
  assert.throws(() => summarizeCrossSource(PACKAGED, ['unverified-vendor']), TypeError);
  assert.throws(() => summarizeCrossSource(PACKAGED, {}), TypeError);
  const copy = () => structuredClone(PACKAGED);
  for (const count of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1']) {
    const data = copy(); data.sources[0].assistance_request_observations = count;
    assert.throws(() => summarizeCrossSource(data), TypeError);
  }
  const duplicate = copy(); duplicate.sources.push(duplicate.sources[0]);
  assert.throws(() => summarizeCrossSource(duplicate), TypeError);
  const synthetic = copy(); synthetic.sources[0].synthetic = true;
  assert.throws(() => summarizeCrossSource(synthetic), TypeError);
  const overflow = copy();
  overflow.sources = [{...overflow.sources[0],assistance_request_observations:Number.MAX_SAFE_INTEGER},{...overflow.sources[0],source_id:'overflow-test-only',assistance_request_observations:1}];
  assert.throws(() => summarizeCrossSource(overflow), RangeError);
});

test('Browser data equals the generated summary and the new panel stays separate from earlier aggregates', () => {
  const json = JSON.parse(readFileSync(new URL('../dist/examples/cross-source-analysis.json', import.meta.url), 'utf8'));
  assert.deepEqual(PACKAGED, json);
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('id="aggregate"') < html.indexOf('id="cross-source-analysis"'));
  assert.ok(html.indexOf('id="cross-source-analysis"') < html.indexOf('id="airflow"'));
  assert.match(html, /does not pool tutor turns, participant summaries or learning effects/);
  assert.match(html, /browser filters the resulting source strata/);
  assert.match(html, /downloads\/learnlog-cross-source-analysis\.zip/);
  const module = readFileSync(new URL('../dist/cross-source-analysis.mjs', import.meta.url), 'utf8');
  assert.equal(/from ['"]\.\/(?:engine|scaffolding-measurement|scaffolding-evidence)\.mjs/.test(module), false);
  assert.equal(/fetch\s*\(|localStorage|sessionStorage/.test(module), false);
});
