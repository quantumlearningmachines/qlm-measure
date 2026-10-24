import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../src/package.js";
import { noStdin, verifyEvidence } from "../src/tools/verify-evidence.js";
import { workdir, writeFixture } from "./helpers/python.js";

type Obj = Record<string, any>;
const ex = (f: string) => join(ROOT, "data/examples", f);

describe("verify_evidence: qlm-measure's own verifier, replaying the chain", () => {
  it("passes a clean evidence record", () => {
    const r = verifyEvidence({ path: ex("evidence-record-clean.json") }) as Obj;
    expect(r.verdict).toBe("pass");
    expect(r.records_checked).toBe(1);
    expect(r.failed_checks).toEqual([]);
    expect(r.verifier).toBe("qlm-measure 0.9.0 (vendored from qlm-measure@68404b5)");
    expect(r.report.summary).toEqual(expect.objectContaining({ records: 1, valid: 1, invalid: 0 }));
    expect(r.does_not_show.length).toBeGreaterThan(0);
  });
  it("fails a tampered record and names the checks that failed, with where and why", () => {
    const r = verifyEvidence({ path: ex("evidence-record-tampered.json"), kind: "record" }) as Obj;
    expect(r.verdict).toBe("fail");
    expect(r.failed_checks).toEqual([
      expect.objectContaining({ record: 1, check: "HASH.ENTRY_RECOMPUTE", failures: 1, first_failure: { version: 3, message: "entryHash mismatch" }, what_it_checks: expect.any(String), how_to_pass: expect.any(String) }),
      expect.objectContaining({ record: 1, check: "POSTERIOR.CHAIN", first_failure: expect.objectContaining({ version: 4 }) }),
    ]);
  });
  it("replays a product hash chain by family or by scheme", () => {
    const clean = verifyEvidence({ path: ex("chain-tpc-clinical-v2.json"), kind: "chain", family: "tpc/clinical" }) as Obj;
    expect(clean.verdict).toBe("pass");
    expect(clean.report.stats).toEqual(expect.objectContaining({ total: 6, tampered: 0, hash_scheme: "tpc/clinical-v2" }));
    const bad = verifyEvidence({ path: ex("chain-tpc-clinical-v2-tampered.json"), kind: "chain", scheme: "tpc/clinical-v2", allow_mixed: true }) as Obj;
    expect(bad.verdict).toBe("fail");
    expect(bad.failed_checks).toEqual(["[2] hash mismatch (tampered)"]);
  });
  it("lists the chain schemes it knows", () => {
    const r = verifyEvidence({ kind: "list_schemes" }) as Obj;
    expect(r.schemes).toEqual(expect.arrayContaining([{ id: "tpc/clinical-v2", family: "tpc/clinical", since: "2026-09-10", fields: "hash/prev_hash" }]));
    expect(r.schemes.length).toBeGreaterThan(20);
  });
  it("refuses unclear requests, and passes on the verifier's own reasons", () => {
    expect(() => verifyEvidence({})).toThrow(/path needs a file path/);
    expect(() => verifyEvidence({ path: ex("chain-tpc-clinical-v2.json"), kind: "chain" })).toThrow(/Name the chain's family/);
    expect(() => verifyEvidence({ path: ex("chain-tpc-clinical-v2.json"), kind: "chain", family: "nope/x" })).toThrow(/The verifier stopped: ERROR: unknown chain family: nope\/x/);
    const dir = workdir();
    const bad = writeFixture(dir, "bad.json", "{x");
    expect(() => verifyEvidence({ path: bad })).toThrow(/could not parse as JSON or JSONL/);
    expect(() => verifyEvidence({ path: bad, kind: "chain", family: "tpc/clinical" })).toThrow(/parse failed/);
  });
  it("checks a 0.3 record's own catalog", () => {
    const dir = workdir();
    const v03 = writeFixture(dir, "v03.json", JSON.stringify({ schemaVersion: "0.3", evidence: { entries: [{ nope: 1 }] } }));
    const r = verifyEvidence({ path: v03 }) as Obj;
    expect(r.verdict).toBe("fail");
    expect(r.failed_checks.length).toBeGreaterThan(0);
    for (const c of r.failed_checks) expect(c.what_it_checks).toEqual(expect.any(String));
  });
});

describe("standard input", () => {
  it("is never read", () => {
    expect(() => noStdin()).toThrow(/reads files, not standard input/);
  });
});
