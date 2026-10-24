#!/usr/bin/env node
// Copies the code and data this package wraps from the qlm-measure repository into vendor/ and data/,
// byte for byte, and records where each file came from in vendor/PROVENANCE.json.
//
//   node scripts/vendor.mjs <repo root> <commit>     copy and write PROVENANCE.json
//   node scripts/vendor.mjs --check <repo root>      exit 1 when any vendored file differs from the repo
//
// Nothing is rewritten: the transformer, the qlm-measure verifier and the published aggregates are
// used exactly as they are in the repository at the recorded commit.
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(dirname(fileURLToPath(import.meta.url)));

/** [path in this package, path in the qlm-measure repository, license of the file]. */
export const FILES = [
  ["vendor/transformer/engine.mjs", "demo/transformer/dist/engine.mjs", "MIT"],
  ["vendor/transformer/profiles.mjs", "demo/transformer/dist/profiles.mjs", "MIT (code); embedded samples CC-BY-4.0"],
  ["vendor/transformer/research-semantics.mjs", "demo/transformer/dist/research-semantics.mjs", "MIT"],
  ["vendor/transformer/cross-source-analysis-data.mjs", "demo/transformer/dist/cross-source-analysis-data.mjs", "MIT (aggregate facts only)"],
  ["vendor/transformer/LICENSE.txt", "demo/transformer/dist/LICENSE.txt", "MIT"],
  ["vendor/qlm-measure/cli.js", "dist/cli.js", "Apache-2.0"],
  ["vendor/qlm-measure/cli.d.ts", "dist/cli.d.ts", "Apache-2.0"],
  ["vendor/qlm-measure/checks.js", "dist/checks.js", "Apache-2.0"],
  ["vendor/qlm-measure/checks.d.ts", "dist/checks.d.ts", "Apache-2.0"],
  ["vendor/qlm-measure/rules.js", "dist/rules.js", "Apache-2.0"],
  ["vendor/qlm-measure/rules.d.ts", "dist/rules.d.ts", "Apache-2.0"],
  ["vendor/qlm-measure/verifier-v03.js", "dist/verifier-v03.js", "Apache-2.0"],
  ["vendor/qlm-measure/verifier-v03.d.ts", "dist/verifier-v03.d.ts", "Apache-2.0"],
  ["vendor/qlm-measure/verifier/hash.js", "dist/verifier/hash.js", "Apache-2.0"],
  ["vendor/qlm-measure/verifier/hash.d.ts", "dist/verifier/hash.d.ts", "Apache-2.0"],
  ["vendor/qlm-measure/verifier/verify-record.js", "dist/verifier/verify-record.js", "Apache-2.0"],
  ["vendor/qlm-measure/verifier/verify-record.d.ts", "dist/verifier/verify-record.d.ts", "Apache-2.0"],
  ["vendor/qlm-measure/schemes/index.js", "dist/schemes/index.js", "Apache-2.0"],
  ["vendor/qlm-measure/schemes/index.d.ts", "dist/schemes/index.d.ts", "Apache-2.0"],
  ["vendor/qlm-measure/schemes/node.js", "dist/schemes/node.js", "Apache-2.0"],
  ["vendor/qlm-measure/schemes/node.d.ts", "dist/schemes/node.d.ts", "Apache-2.0"],
  ["vendor/qlm-measure/schemes/products.js", "dist/schemes/products.js", "Apache-2.0"],
  ["vendor/qlm-measure/schemes/products.d.ts", "dist/schemes/products.d.ts", "Apache-2.0"],
  ["data/samples/tutormoments-real-transcripts.jsonl", "demo/transformer/dist/samples/tutormoments-real-transcripts.jsonl", "CC-BY-4.0 (Ai2 TutorMoments-Preview)"],
  ["data/samples/oatutor-real-participants.csv", "demo/transformer/dist/samples/oatutor-real-participants.csv", "CC-BY-4.0 (Pardos and Bhandari, figshare)"],
  ["data/samples/explicit-assistance-SYNTHETIC.jsonl", "demo/transformer/dist/samples/explicit-assistance-SYNTHETIC.jsonl", "MIT (QLM-authored synthetic fixture)"],
  ["data/samples/sandpiper-SYNTHETIC.csv", "demo/transformer/dist/samples/sandpiper-SYNTHETIC.csv", "MIT (SYNTHETIC fixture of Sandpiper documentation examples, (c) 2025 National Tutoring Observatory)"],
  ["data/provenance/tutormoments.json", "demo/transformer/dist/provenance/tutormoments.json", "MIT"],
  ["data/provenance/oatutor.json", "demo/transformer/dist/provenance/oatutor.json", "MIT"],
  ["data/provenance/source-audit.json", "demo/transformer/dist/provenance/source-audit.json", "MIT"],
  ["data/THIRD_PARTY_DATA.md", "demo/transformer/THIRD_PARTY_DATA.md", "MIT"],
  ["data/SOURCE_CORRECTION.md", "demo/transformer/SOURCE_CORRECTION.md", "MIT"],
  ["data/examples/evidence-record-clean.json", "samples/clean.json", "Apache-2.0 (synthetic sample, no learner data)"],
  ["data/examples/evidence-record-tampered.json", "samples/tampered_value.json", "Apache-2.0 (synthetic sample, no learner data)"],
  ["data/examples/chain-tpc-clinical-v2.json", "schema/vectors/chains/tpc-clinical-v2.json", "Apache-2.0 (synthetic test vector)"],
  ["data/examples/chain-tpc-clinical-v2-tampered.json", "schema/vectors/chains/tpc-clinical-v2-tampered.json", "Apache-2.0 (synthetic test vector)"],
  ["parity/cross_source.py", "research/learnlog-episodes/cross_source.py", "Apache-2.0 (test-only; not published)"],
  ["parity/assistments_episodes.py", "research/learnlog-episodes/assistments_episodes.py", "Apache-2.0 (test-only; not published)"],
  ["parity/aggregate.py", "tools/qlm-transformer/qlm_transformer/capture/reference/analysis/aggregate.py", "MIT (test-only; not published)"],
  ["data/preprint/README.md", "research/learnlog-episodes/README.md", "Apache-2.0 (qlm-measure repository)"],
  ["data/preprint/cross_source_episodes.json", "research/learnlog-episodes/cross_source_episodes.json", "Apache-2.0 (aggregate counts only)"],
  ["data/preprint/assistments_episodes.json", "research/learnlog-episodes/assistments_episodes.json", "Apache-2.0 (aggregate counts only)"],
];

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function copyAll(root, commit) {
  const files = [];
  for (const [target, source, license] of FILES) {
    const from = join(root, source);
    if (!existsSync(from)) throw new Error(`missing in the repository: ${source}`);
    mkdirSync(dirname(join(here, target)), { recursive: true });
    copyFileSync(from, join(here, target));
    files.push({ path: target, source, sha256: sha256(readFileSync(from)), license });
  }
  const provenance = {
    repository: "https://github.com/quantumlearningmachines/qlm-measure",
    commit,
    note: "Byte-for-byte copies of files at this commit of qlm-measure. The transformer files are the built browser engine the transformer demo ships (demo/transformer/dist), whose Python/JavaScript serialization parity the repository checks with demo/transformer/scripts/verify_semantic_parity.py. The qlm-measure files are the committed 0.9.0 build of src/ (dist/).",
    files,
  };
  writeFileSync(join(here, "vendor/PROVENANCE.json"), JSON.stringify(provenance, null, 2) + "\n");
  return files.length;
}

function check(root) {
  const provenance = JSON.parse(readFileSync(join(here, "vendor/PROVENANCE.json"), "utf8"));
  let bad = 0;
  for (const f of provenance.files) {
    const mine = sha256(readFileSync(join(here, f.path)));
    const theirs = sha256(readFileSync(join(root, f.source)));
    if (mine !== f.sha256 || theirs !== f.sha256) { bad++; console.log(`DIFFERS ${f.path} (package ${mine}, repository ${theirs}, recorded ${f.sha256})`); }
  }
  console.log(`${provenance.files.length - bad} of ${provenance.files.length} vendored files match the repository`);
  return bad === 0;
}

if (process.argv[2] === "--check") process.exit(check(process.argv[3] ?? "..") ? 0 : 1);
else if (process.argv[2]) console.log(`copied ${copyAll(process.argv[2], process.argv[3] ?? "unknown")} files`);
else { console.log("usage: node scripts/vendor.mjs <repo root> <commit> | --check <repo root>"); process.exit(2); }
