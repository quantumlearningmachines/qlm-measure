import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');

test('landing page offers exactly five calls to action', () => {
  const ctas = html.match(/class="cta( primary)?"/g) || [];
  assert.equal(ctas.length, 5);
});

test('landing page links resolve to the full demo, the draft, the code and contact', () => {
  for (const href of ['./demo.html#transformer', './demo.html#cross-source-analysis',
    'https://datatracker.ietf.org/doc/draft-srivastava-learnlog/03/',
    'https://github.com/quantumlearningmachines/qlm-measure', 'mailto:kumar@quantumlearningmachines.com']) {
    assert.ok(html.includes(`href="${href}`), href);
  }
  const demo = readFileSync(new URL('../dist/demo.html', import.meta.url), 'utf8');
  assert.ok(demo.includes('id="transformer"') && demo.includes('id="cross-source-analysis"'));
  assert.ok(existsSync(new URL('../dist/landing.css', import.meta.url)));
});

test('landing page keeps the strict content security policy and no inline script', () => {
  assert.ok(html.includes("script-src 'self'"));
  assert.ok(!/<script(?![^>]*src=)/.test(html));
});
