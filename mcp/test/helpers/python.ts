/**
 * Runs the preprint's original Python scripts (vendored, byte-identical, in parity/) on test fixtures,
 * so the TypeScript port can be compared with the code it ports. python3 must be installed: these
 * tests fail, rather than skip, without it.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PARITY = fileURLToPath(new URL("../../parity/", import.meta.url));

export function workdir(): string {
  return mkdtempSync(join(tmpdir(), "learnlog-mcp-"));
}

export function writeFixture(dir: string, name: string, data: string | Buffer): string {
  const p = join(dir, name);
  writeFileSync(p, data);
  return p;
}

/** Runs one of the episode scripts from a scratch copy (they write their output beside themselves). */
export function runScript(script: "cross_source.py" | "assistments_episodes.py", args: string[]): unknown {
  const dir = workdir();
  copyFileSync(join(PARITY, script), join(dir, script));
  const out = execFileSync("python3", ["-I", join(dir, script), ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  return JSON.parse(out);
}

/** Calls aggregate.py's two source adapters with the checksum pin lifted, so synthetic files can be read. */
export function runAggregateAdapters(zip: string | null, ide: string | null): { zenodo?: Record<string, unknown>; tutortrace?: Record<string, unknown> } {
  const code = `
import sys, json
from collections import Counter
sys.path.insert(0, ${JSON.stringify(PARITY)})
import aggregate
aggregate.check_pin = lambda path, expected: aggregate.sha_file(path)
out = {}
zip_path, ide_path = ${JSON.stringify(zip)}, ${JSON.stringify(ide)}
if zip_path:
    c, obs, info = aggregate.zenodo_requests(zip_path)
    counts = Counter(o["subtype"] for o in obs)
    out["zenodo"] = dict(info, input_sha256=c["input_sha256"], assistance_request_observations=len(obs), help_request_subtypes=[{"label": k, "count": v} for k, v in sorted(counts.items())])
if ide_path:
    c, obs, info = aggregate.tutortrace_requests(ide_path)
    info.pop("metadata_caveat")
    out["tutortrace"] = dict(info, input_sha256=c["input_sha256"], assistance_request_observations=len(obs))
print(json.dumps(out))
`;
  return JSON.parse(execFileSync("python3", ["-I", "-c", code], { encoding: "utf8", maxBuffer: 64 << 20 })) as { zenodo?: Record<string, unknown>; tutortrace?: Record<string, unknown> };
}

/** JSON round trip, so 71.0 from Python and 71 from JavaScript compare equal and key order is ignored. */
export const plain = (v: unknown): unknown => JSON.parse(JSON.stringify(v)) as unknown;
