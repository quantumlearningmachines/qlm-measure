#!/usr/bin/env node
// Runs the preprint's original Python scripts and this package's TypeScript port on the SAME real
// files, on the machine that holds them, and prints only whether the outputs are identical and how
// many numbers were compared. It prints no learner rows. Then it asks the MCP tool itself for the
// inventory and prints its comparison with the published preprint numbers. Run after `npm run build`.
//
//   node scripts/parity-real.mjs --zenodo <zip> --idetrace <json> --assistments <csv>
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeAssistments, analyzeIdetrace, analyzeZenodo, crossSourceEpisodes } from "../dist/episodes.js";
import { readFileSync } from "node:fs";
import { assistanceInventory } from "../dist/tools/inventory.js";

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const zip = arg("zenodo"), ide = arg("idetrace"), csv = arg("assistments");
const PARITY = fileURLToPath(new URL("../parity/", import.meta.url));
const plain = (v) => JSON.parse(JSON.stringify(v));
const leaves = (v) => (v !== null && typeof v === "object" ? Object.values(v).reduce((n, x) => n + leaves(x), 0) : 1);
function same(a, b) { return JSON.stringify(sortKeys(plain(a))) === JSON.stringify(sortKeys(plain(b))); }
function sortKeys(v) { return Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v; }
function py(script, args) {
  const dir = mkdtempSync(join(tmpdir(), "learnlog-parity-"));
  copyFileSync(join(PARITY, script), join(dir, script));
  return JSON.parse(execFileSync("python3", ["-I", join(dir, script), ...args], { encoding: "utf8", maxBuffer: 1 << 26 }));
}
const t = () => performance.now();
let ok = true;
const report = (name, a, b, ms) => { const s = same(a, b); ok &&= s; console.log(`${name}: ${s ? "IDENTICAL" : "DIFFERENT"} (${leaves(b)} values; ${Math.round(ms / 1000)} s)`); if (!s) { console.log(" python:", JSON.stringify(sortKeys(plain(a)))); console.log(" ts:    ", JSON.stringify(sortKeys(plain(b)))); } };

console.log("python:", execFileSync("python3", ["--version"], { encoding: "utf8" }).trim(), "| node:", process.version);
let t0 = t();
const pyCross = py("cross_source.py", [zip, ide]);
const pyCrossMs = t() - t0;
t0 = t();
const z = analyzeZenodo(readFileSync(zip));
const i = analyzeIdetrace(readFileSync(ide, "utf8"));
report("cross_source.py vs TypeScript", pyCross, crossSourceEpisodes(z, i), t() - t0 + pyCrossMs);

const code = `import sys, json\nfrom collections import Counter\nsys.path.insert(0, ${JSON.stringify(PARITY)})\nimport aggregate\nc, obs, info = aggregate.zenodo_requests(${JSON.stringify(zip)})\nn = Counter(o["subtype"] for o in obs)\nz = dict(info, input_sha256=c["input_sha256"], assistance_request_observations=len(obs), help_request_subtypes=[{"label": k, "count": v} for k, v in sorted(n.items())])\nc, obs, info = aggregate.tutortrace_requests(${JSON.stringify(ide)})\ninfo.pop("metadata_caveat")\ni = dict(info, input_sha256=c["input_sha256"], assistance_request_observations=len(obs))\nprint(json.dumps({"zenodo": z, "tutortrace": i}))`;
t0 = t();
const pyAgg = JSON.parse(execFileSync("python3", ["-I", "-c", code], { encoding: "utf8", maxBuffer: 1 << 26 }));
report("aggregate.py (Table 2) Zenodo vs TypeScript", pyAgg.zenodo, z.inventory, t() - t0);
report("aggregate.py (Table 2) IDETrace vs TypeScript", pyAgg.tutortrace, i.inventory, 0);

if (csv) {
  t0 = t();
  const pyA = py("assistments_episodes.py", [csv]);
  const pyMs = t() - t0;
  t0 = t();
  const a = await analyzeAssistments(csv);
  console.log(`  (python ${Math.round(pyMs / 1000)} s, TypeScript ${Math.round((t() - t0) / 1000)} s)`);
  report("assistments_episodes.py vs TypeScript", pyA, a, 0);
}

t0 = t();
const tool = await assistanceInventory({ zenodo_zip: zip, idetrace_json: ide, allow_idetrace_research: true, ...(csv ? { assistments_csv: csv } : {}) });
console.log(`assistance_inventory tool (${Math.round((t() - t0) / 1000)} s): inputs ${JSON.stringify(tool.inputs)}`);
for (const [k, c] of Object.entries(tool.comparison_with_preprint)) {
  console.log(`  compared with the published preprint numbers, ${k}: ${typeof c === "string" ? c : `${c.matches ? "MATCH" : "MISMATCH"}, ${c.numbers_compared} numbers, mismatches ${JSON.stringify(c.mismatches)}`}`);
  if (typeof c === "string" || !c.matches) ok = false;
}
console.log(`Table 2 total from the tool: ${tool.inventory_table_2.total_request_observations}`);
console.log(ok ? "PARITY: ALL IDENTICAL AND MATCHING" : "PARITY: FAILED");
process.exit(ok ? 0 : 1);
