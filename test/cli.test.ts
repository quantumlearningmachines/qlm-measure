import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, symlinkSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { main, isDirectRun, processIO, type CliIO } from "../src/cli.js";
import { sealEvent } from "../src/schemes/node.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = join(ROOT, "samples");
const EXPECTED = join(SAMPLES, "expected");
const CHAINS = join(ROOT, "schema", "vectors", "chains");
const CLI_SRC = join(ROOT, "src", "cli.ts");
const CLI_DIST = join(ROOT, "dist", "cli.js");

interface Captured extends CliIO { stdout: string; stderr: string; }
function io(stdin = ""): Captured {
  const c: Captured = {
    stdout: "", stderr: "",
    out(s: string) { c.stdout += s; },
    err(s: string) { c.stderr += s; },
    readStdin: () => stdin,
  };
  return c;
}
function tmp(): string { return mkdtempSync(join(tmpdir(), "qlm-cli-")); }
function file(name: string, body: string): string { const p = join(tmp(), name); writeFileSync(p, body); return p; }
const sample = (n: string) => join(SAMPLES, n);

// The samples' expected files were written by the Python CLI; the JS CLI must print the same verdicts.
const CASES: [string, string, number][] = [
  ["clean.json", "clean", 0],
  ["compacted_clean.json", "compacted_clean", 0],
  ["dropped_entry.json", "dropped_entry", 1],
  ["engine_synthetic.json", "engine_synthetic", 0],
  ["level1_only.json", "level1_only", 1],
  ["reordered.json", "reordered", 1],
  ["tampered_value.json", "tampered_value", 1],
  ["clean.jsonl", "clean_jsonl", 0],
];

afterEach(() => { vi.restoreAllMocks(); });

describe("verify: output matches the Python CLI's expected files", () => {
  for (const [input, stem, code] of CASES) {
    it(`${input}: text output and exit code ${code}`, () => {
      const c = io();
      expect(main(["verify", sample(input)], c)).toBe(code);
      expect(c.stdout).toBe(readFileSync(join(EXPECTED, `${stem}.txt`), "utf-8"));
      expect(c.stderr).toBe("");
    });
    it(`${input}: JSON report matches records, summary and input`, () => {
      const c = io();
      expect(main(["verify", sample(input), "--format", "json"], c)).toBe(code);
      const got = JSON.parse(c.stdout);
      const want = JSON.parse(readFileSync(join(EXPECTED, `${stem}.report.json`), "utf-8"));
      expect(got.records).toEqual(want.records);
      expect(got.summary).toEqual(want.summary);
      expect(got.input).toEqual(want.input);
      expect(got.tool).toEqual({ name: "qlm-measure", version: "0.9.0", language: "javascript", catalog_version: "1" });
      expect(got.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    });
  }
});

describe("verify: options that are not supported stop with an error", () => {
  for (const argv of [
    ["verify", "--redact", sample("clean.json")],
    ["verify", sample("clean.json"), "--redact"],
  ]) {
    it(`rejects --redact (${argv.join(" ")})`, () => {
      const c = io();
      expect(main(argv, c)).toBe(2);
      expect(c.stderr).toBe("error: --redact is not supported by the JavaScript CLI; the Python CLI (python/qlm_measure) supports it\n");
      expect(c.stdout).toBe("");
    });
  }
  for (const argv of [
    ["verify", "--tolerance-ms", "5000", sample("clean.json")],
    ["verify", sample("clean.json"), "--tolerance-ms"],
  ]) {
    it(`rejects --tolerance-ms (${argv.join(" ")})`, () => {
      const c = io();
      expect(main(argv, c)).toBe(2);
      expect(c.stderr).toBe("error: --tolerance-ms is not supported by the JavaScript CLI; the Python CLI (python/qlm_measure) supports it\n");
      expect(c.stdout).toBe("");
    });
  }
  it("rejects an unknown option instead of treating it as a file", () => {
    const c = io();
    expect(main(["verify", "--strict", sample("clean.json")], c)).toBe(2);
    expect(c.stderr).toBe("error: unknown option: --strict\n");
  });
  it("rejects a --format value other than text or json", () => {
    const c = io();
    expect(main(["verify", sample("clean.json"), "--format", "xml"], c)).toBe(2);
    expect(c.stderr).toBe("error: --format must be text or json\n");
  });
  it("rejects --format with no value", () => {
    const c = io();
    expect(main(["verify", sample("clean.json"), "--format"], c)).toBe(2);
    expect(c.stderr).toBe("error: --format must be text or json\n");
  });
  it("rejects --report with no value", () => {
    const c = io();
    expect(main(["verify", sample("clean.json"), "--report"], c)).toBe(2);
    expect(c.stderr).toBe("error: --report needs a file name\n");
  });
  it("needs at least one file", () => {
    const c = io();
    expect(main(["verify"], c)).toBe(2);
    expect(c.stderr).toBe("error: no files specified\n");
  });
});

describe("verify: --report, --quiet and --format text", () => {
  it("--report writes the JSON report and still prints the text", () => {
    const out = join(tmp(), "r.json");
    const c = io();
    expect(main(["verify", sample("clean.json"), "--report", out], c)).toBe(0);
    expect(c.stdout).toBe(readFileSync(join(EXPECTED, "clean.txt"), "utf-8"));
    const rep = JSON.parse(readFileSync(out, "utf-8"));
    expect(rep.summary.valid).toBe(1);
    expect(readFileSync(out, "utf-8").endsWith("}\n")).toBe(true);
  });
  it("--report with --quiet writes the report and prints nothing", () => {
    const out = join(tmp(), "r.json");
    const c = io();
    expect(main(["verify", sample("tampered_value.json"), "--report", out, "--quiet"], c)).toBe(1);
    expect(c.stdout).toBe("");
    expect(JSON.parse(readFileSync(out, "utf-8")).summary.invalid).toBe(1);
  });
  it("--format json with --report prints the JSON and writes the same report", () => {
    const out = join(tmp(), "r.json");
    const c = io();
    expect(main(["verify", sample("clean.json"), "--format", "json", "--report", out], c)).toBe(0);
    expect(JSON.parse(c.stdout).summary).toEqual(JSON.parse(readFileSync(out, "utf-8")).summary);
  });
  it("--quiet alone prints nothing and keeps the exit code", () => {
    const c = io();
    expect(main(["verify", sample("reordered.json"), "--quiet"], c)).toBe(1);
    expect(c.stdout).toBe("");
  });
  it("--format text is the default", () => {
    const c = io();
    expect(main(["verify", sample("clean.json"), "--format", "text"], c)).toBe(0);
    expect(c.stdout).toBe(readFileSync(join(EXPECTED, "clean.txt"), "utf-8"));
  });
});

describe("verify: loading input", () => {
  const clean = () => readFileSync(sample("clean.json"), "utf-8");
  it("reports a missing file", () => {
    const c = io();
    expect(main(["verify", "/no/such/file.json"], c)).toBe(2);
    expect(c.stderr).toBe("error: File not found: /no/such/file.json\n");
  });
  it("reports empty input", () => {
    const c = io();
    const p = file("e.json", "  \n ");
    expect(main(["verify", p], c)).toBe(2);
    expect(c.stderr).toBe(`error: ${p}: empty input\n`);
  });
  it("strips a byte-order mark", () => {
    const c = io();
    expect(main(["verify", file("clean.json", "﻿" + clean())], c)).toBe(0);
    expect(c.stdout).toBe(readFileSync(join(EXPECTED, "clean.txt"), "utf-8"));
  });
  it("stops when an array holds no records (Python parity)", () => {
    const c = io();
    expect(main(["verify", file("a.json", "[]")], c)).toBe(2);
    expect(c.stderr).toBe("error: no records loaded\n");
  });
  it("rejects an array element with neither entries nor evidence", () => {
    for (const body of ["[{}]", "[null]", "[3]"]) {
      const c = io();
      const p = file("a.json", body);
      expect(main(["verify", p], c)).toBe(2);
      expect(c.stderr).toBe(`error: ${p}: element missing entries\n`);
    }
  });
  it("reports malformed JSON", () => {
    const c = io();
    expect(main(["verify", file("a.json", "[1,")], c)).toBe(2);
    expect(c.stderr).toMatch(/^error: .*JSON/);
  });
  it("reads an array of records", () => {
    const c = io();
    const rec = JSON.parse(clean());
    expect(main(["verify", file("a.json", JSON.stringify([rec, rec])), "--format", "json"], c)).toBe(0);
    expect(JSON.parse(c.stdout).summary.records).toBe(2);
  });
  it("rejects a JSONL line with neither entries nor evidence", () => {
    const c = io();
    const one = JSON.stringify(JSON.parse(clean()));
    const p = file("a.jsonl", `${one}\n{"x":1}\n`);
    expect(main(["verify", p], c)).toBe(2);
    expect(c.stderr).toBe(`error: ${p}: line 2 missing entries\n`);
  });
  it("rejects a single object with neither entries nor evidence", () => {
    const c = io();
    const p = file("a.json", `{"x":1}`);
    expect(main(["verify", p], c)).toBe(2);
    expect(c.stderr).toBe(`error: ${p}: could not parse as JSON or JSONL\n`);
  });
  it("rejects several lines that are not all objects", () => {
    const c = io();
    const p = file("a.jsonl", `{"entries":[]}\n[1]\n`);
    expect(main(["verify", p], c)).toBe(2);
    expect(c.stderr).toBe(`error: ${p}: could not parse as JSON or JSONL\n`);
  });
  it("rejects input that is neither an object nor an array", () => {
    const c = io();
    const p = file("a.txt", "hello");
    expect(main(["verify", p], c)).toBe(2);
    expect(c.stderr).toBe(`error: ${p}: unrecognized format\n`);
  });
  it("reads standard input for '-'", () => {
    const c = io(clean());
    expect(main(["verify", "-", "--format", "json"], c)).toBe(0);
    const rep = JSON.parse(c.stdout);
    expect(rep.input).toEqual({ path: "-", sha256: "", records: 1 });
  });
  it("labels several files and leaves the hash blank", () => {
    const c = io();
    expect(main(["verify", sample("clean.json"), sample("tampered_value.json"), "--format", "json"], c)).toBe(1);
    const rep = JSON.parse(c.stdout);
    expect(rep.input).toEqual({ path: "2 files", sha256: "", records: 2 });
    expect(rep.summary).toMatchObject({ records: 2, valid: 1, invalid: 1 });
    const t = io();
    main(["verify", sample("clean.json"), sample("tampered_value.json")], t);
    expect(t.stdout.startsWith("qlm-measure verify 2 files\nrecords: 2\n")).toBe(true);
  });
});

describe("verify: record shapes", () => {
  const engine = () => JSON.parse(readFileSync(sample("engine_synthetic.json"), "utf-8"));
  it("treats a record with schemaVersion 0.3 and top-level entries as 0.3", () => {
    const rec = { schemaVersion: "0.3", studentScopeId: "s-1", entries: [] };
    const c = io();
    main(["verify", file("a.json", JSON.stringify(rec))], c);
    expect(c.stdout).toContain("record s-1  (schema 0.3, 0 entries)");
    const j = io();
    main(["verify", file("a.json", JSON.stringify(rec)), "--format", "json"], j);
    const r = JSON.parse(j.stdout).records[0];
    expect(r.schemaVersion).toBe("0.3");
    expect(r.checks.find((x: { id: string }) => x.id === "POSTERIOR.CHAIN")?.status).toBe("not_applicable");
  });
  it("treats a record with evidence and no schemaVersion as 0.3, with no entries", () => {
    const rec = { evidence: {} };
    const c = io();
    expect(main(["verify", file("a.json", JSON.stringify(rec))], c)).toBe(1);
    expect(c.stdout).toContain("record ?  (schema 0.2, 0 entries)");
    const j = io();
    main(["verify", file("a.json", JSON.stringify(rec)), "--format", "json"], j);
    const r = JSON.parse(j.stdout).records[0];
    expect(r.studentScopeId).toBe("");
    expect(r.schemaVersion).toBe("0.2");
  });
  it("marks compaction as applicable for a 0.3 record compacted under evidence", () => {
    const rec = engine();
    rec.evidence.compactedBefore = { version: 1, summaryHash: "x" };
    const j = io();
    main(["verify", file("a.json", JSON.stringify(rec)), "--format", "json"], j);
    const r = JSON.parse(j.stdout).records[0];
    expect(r.checks.find((x: { id: string }) => x.id === "COMPACTION.BOUNDARY")?.status).not.toBe("not_applicable");
    const t = io();
    main(["verify", file("a.json", JSON.stringify(rec))], t);
    expect(t.stdout).toMatch(/ {2}Compaction\n {4}✓ /);
    const plain = io();
    main(["verify", sample("engine_synthetic.json")], plain);
    expect(plain.stdout).toMatch(/ {2}Compaction\n {4}– .*\(not applicable\)/);
  });
  it("reports a record whose entries are not a list instead of crashing", () => {
    for (const rec of [{ studentScopeId: "s", entries: 5 }]) {
      const c = io();
      expect(main(["verify", file("a.json", JSON.stringify(rec))], c)).toBe(1);
      expect(c.stdout).toContain(" 0 entries)");
      const j = io();
      expect(main(["verify", file("a.json", JSON.stringify(rec)), "--format", "json"], j)).toBe(1);
      expect(JSON.parse(j.stdout).records[0].valid).toBe(false);
    }
  });
  it("prints one failure, or a count of failures", () => {
    const c = io();
    main(["verify", sample("reordered.json")], c);
    expect(c.stdout).toMatch(/\(1 failure; first at v/);
    expect(c.stdout).toMatch(/\([2-9]\d* failures; first at v/);
  });
});

describe("explain and version", () => {
  it("lists the catalog", () => {
    const c = io();
    expect(main(["explain"], c)).toBe(0);
    expect(c.stdout).toContain("qlm-measure check catalog (v1)\n\nShipped checks (run by verify):\n  SCHEMA.REQUIRED");
    expect(c.stdout).toContain("Planned checks (listed, not run):");
    expect(c.stdout.endsWith("Use 'qlm-measure explain CHECK_ID' for details.\n")).toBe(true);
  });
  it("explains one check", () => {
    const c = io();
    expect(main(["explain", "HASH.ENTRY_RECOMPUTE"], c)).toBe(0);
    expect(c.stdout).toMatch(/^HASH\.ENTRY_RECOMPUTE — .+\n  Status: {4}/);
    expect(c.stdout).toContain("  How to pass: ");
  });
  it("rejects an unknown check", () => {
    const c = io();
    expect(main(["explain", "NOPE"], c)).toBe(2);
    expect(c.stderr).toMatch(/^error: unknown check ID: NOPE\nAvailable: SCHEMA\.REQUIRED, /);
  });
  it("prints the version", () => {
    const c = io();
    expect(main(["version"], c)).toBe(0);
    expect(c.stdout).toBe("qlm-measure 0.9.0\nschema version: 0.2\ncatalog version: 1\n");
  });
});

describe("usage", () => {
  const USAGE = [
    "Usage: qlm-measure <verify|verify-chain|explain|version> [options]",
    "  verify PATH... [--format text|json] [--report FILE] [--quiet]",
    "  verify-chain EVENTS_JSON (--family F | --scheme S) [--allow-mixed] [--format text|json]",
    "  verify-chain --list",
    "  explain [CHECK_ID]",
    "  version",
    "",
  ].join("\n");
  it("prints usage and exits 2 with no command", () => {
    const c = io();
    expect(main([], c)).toBe(2);
    expect(c.stdout).toBe(USAGE);
  });
  it("prints usage and exits 2 for an unknown command", () => {
    const c = io();
    expect(main(["frobnicate"], c)).toBe(2);
    expect(c.stdout).toBe(USAGE);
  });
});

describe("verify-chain", () => {
  const vec = (n: string) => join(CHAINS, n);
  it("lists schemes", () => {
    const c = io();
    expect(main(["verify-chain", "--list"], c)).toBe(0);
    expect(c.stdout.split("\n")[0]).toBe("tpc/clinical-v4\ttpc/clinical\tsince " + c.stdout.split("\n")[0].split("since ")[1]);
  });
  it("needs a file", () => {
    const c = io();
    expect(main(["verify-chain", "--family", "tpc/clinical"], c)).toBe(2);
    expect(c.stderr).toMatch(/^Usage: qlm-measure verify-chain/);
  });
  it("needs --family or --scheme", () => {
    const c = io();
    expect(main(["verify-chain", vec("tpc-clinical-v2.json")], c)).toBe(2);
    expect(c.stderr).toBe("ERROR: pass --family (e.g. tpc/clinical) or --scheme (e.g. tpc/clinical-v2)\n");
  });
  for (const flag of ["--family", "--scheme"]) {
    it(`rejects ${flag} with no value`, () => {
      const c = io();
      expect(main(["verify-chain", vec("tpc-clinical-v2.json"), flag], c)).toBe(2);
      expect(c.stderr).toBe(`ERROR: ${flag} needs a value\n`);
    });
  }
  it("rejects a --format value other than text or json", () => {
    const c = io();
    expect(main(["verify-chain", vec("tpc-clinical-v2.json"), "--family", "tpc/clinical", "--format", "csv"], c)).toBe(2);
    expect(c.stderr).toBe("ERROR: --format must be text or json\n");
  });
  it("rejects an unknown option", () => {
    const c = io();
    expect(main(["verify-chain", vec("tpc-clinical-v2.json"), "--family", "tpc/clinical", "--fast"], c)).toBe(2);
    expect(c.stderr).toBe("ERROR: unknown option: --fast\n");
  });
  it("reports a missing file", () => {
    const c = io();
    expect(main(["verify-chain", "/no/x.json", "--family", "tpc/clinical"], c)).toBe(2);
    expect(c.stderr).toBe("ERROR: /no/x.json not found\n");
  });
  it("reports a parse failure", () => {
    const c = io();
    expect(main(["verify-chain", file("x.json", "{"), "--family", "tpc/clinical"], c)).toBe(2);
    expect(c.stderr).toMatch(/^ERROR: parse failed: SyntaxError/);
  });
  it("rejects JSON that is not an event list", () => {
    for (const body of ["{\"events\": 3}", "3", "null"]) {
      const c = io();
      expect(main(["verify-chain", file("x.json", body), "--family", "tpc/clinical"], c)).toBe(2);
      expect(c.stderr).toBe("ERROR: not an array of events (or an object with an events array)\n");
    }
  });
  it("reports an unknown scheme", () => {
    const c = io();
    expect(main(["verify-chain", vec("tpc-clinical-v2.json"), "--scheme", "nope/1"], c)).toBe(2);
    expect(c.stderr).toMatch(/^ERROR: unknown chain scheme: nope\/1/);
  });
  it("verifies a clean chain (wrapped in an events object) as text", () => {
    const c = io();
    expect(main(["verify-chain", vec("tpc-clinical-v2.json"), "--family", "tpc/clinical"], c)).toBe(0);
    const lines = c.stdout.split("\n");
    expect(lines[0]).toBe("qlm-measure verify-chain 0.9.0");
    expect(lines[1]).toBe(`file: ${vec("tpc-clinical-v2.json")}`);
    expect(lines[2]).toMatch(/^timestamp: \d{4}-/);
    expect(lines.slice(3, 10)).toEqual(["result: CLEAN", expect.stringMatching(/^events: \d+$/), "gaps: 0", "duplicates: 0", "tampered: 0", "schema_errors: 0", "hash_scheme: tpc/clinical-v2"]);
    expect(c.stdout).not.toContain("errors:\n");
  });
  it("verifies a bare array of events", () => {
    const events = JSON.parse(readFileSync(vec("tpc-clinical-v2.json"), "utf-8")).events;
    const c = io();
    expect(main(["verify-chain", file("x.json", JSON.stringify(events)), "--scheme", "tpc/clinical-v2"], c)).toBe(0);
  });
  it("lists errors for a tampered chain", () => {
    const c = io();
    expect(main(["verify-chain", vec("tpc-clinical-v2-tampered.json"), "--family", "tpc/clinical"], c)).toBe(1);
    expect(c.stdout).toContain("result: FAIL");
    expect(c.stdout).toMatch(/\nerrors:\n {2}\[\d+\] hash mismatch/);
  });
  it("prints JSON for clean and tampered chains", () => {
    const ok = io();
    expect(main(["verify-chain", vec("tpc-clinical-v2.json"), "--family", "tpc/clinical", "--format", "json"], ok)).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ verifier: "qlm-measure 0.9.0", file: vec("tpc-clinical-v2.json"), clean: true });
    const bad = io();
    expect(main(["verify-chain", vec("tpc-clinical-v2-tampered.json"), "--family", "tpc/clinical", "--format", "json"], bad)).toBe(1);
    expect(JSON.parse(bad.stdout).clean).toBe(false);
  });
  it("--format text is accepted", () => {
    const c = io();
    expect(main(["verify-chain", vec("tpc-clinical-v2.json"), "--family", "tpc/clinical", "--format", "text"], c)).toBe(0);
  });
  it("--allow-mixed lets a chain mixing schemes pass; without it the chain fails", () => {
    const v1 = JSON.parse(readFileSync(vec("tpc-clinical-v1.json"), "utf-8")).events;
    const v2 = JSON.parse(readFileSync(vec("tpc-clinical-v2.json"), "utf-8")).events;
    const tail = sealEvent({ ...v2[0], prev_hash: v1[v1.length - 1].hash, turn: 6 }, "tpc/clinical-v2");
    const p = file("mixed.json", JSON.stringify([...v1, tail]));
    const strict = io();
    expect(main(["verify-chain", p, "--family", "tpc/clinical"], strict)).toBe(1);
    expect(strict.stdout).toContain("hash_scheme: mixed");
    expect(strict.stdout).toMatch(/\n {2}mixed hash schemes/);
    const loose = io();
    expect(main(["verify-chain", p, "--family", "tpc/clinical", "--allow-mixed"], loose)).toBe(0);
    expect(loose.stdout).toContain("result: CLEAN");
  });
});

describe("process wiring", () => {
  it("processIO writes to stdout and stderr", () => {
    const o = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const e = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    processIO.out("a");
    processIO.err("b");
    expect(o).toHaveBeenCalledWith("a");
    expect(e).toHaveBeenCalledWith("b");
  });
  it("main uses processIO by default", () => {
    const o = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    expect(main(["version"])).toBe(0);
    expect(o).toHaveBeenCalledWith("qlm-measure 0.9.0\n");
  });
  it("isDirectRun is true only for this module's own file", () => {
    const url = new URL("../src/cli.ts", import.meta.url).href;
    expect(isDirectRun(undefined, url)).toBe(false);
    expect(isDirectRun("/no/such/path", url)).toBe(false);
    expect(isDirectRun(join(ROOT, "package.json"), url)).toBe(false);
    expect(isDirectRun(CLI_SRC, url)).toBe(true);
    const link = join(tmp(), "qlm-measure");
    symlinkSync(CLI_SRC, link);
    expect(isDirectRun(link, url)).toBe(true);
  });
  it("runs main and exits with its code when started directly", async () => {
    const argv = process.argv;
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const o = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    process.argv = [argv[0], CLI_SRC, "version"];
    try {
      vi.resetModules();
      await import("../src/cli.js");
    } finally {
      process.argv = argv;
    }
    expect(exit).toHaveBeenCalledWith(0);
    expect(o).toHaveBeenCalledWith("qlm-measure 0.9.0\n");
  });
});

describe("the built dist/cli.js matches the source", () => {
  const run = (args: string[], input?: string) => spawnSync(process.execPath, [CLI_DIST, ...args], { input, encoding: "utf-8" });
  it("exists", () => { expect(existsSync(CLI_DIST)).toBe(true); });
  it("rejects --redact and --tolerance-ms", () => {
    const r = run(["verify", sample("clean.json"), "--redact"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("--redact is not supported");
    const t = run(["verify", sample("clean.json"), "--tolerance-ms", "10"]);
    expect(t.status).toBe(2);
    expect(t.stderr).toContain("--tolerance-ms is not supported");
  });
  it("verifies a file and reads standard input", () => {
    const r = run(["verify", sample("clean.json")]);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe(readFileSync(join(EXPECTED, "clean.txt"), "utf-8"));
    const s = run(["verify", "-", "--format", "json"], readFileSync(sample("clean.json"), "utf-8"));
    expect(s.status).toBe(0);
    expect(JSON.parse(s.stdout).summary.valid).toBe(1);
  });
  it("runs through a symlink, the way npm installs the bin", () => {
    const dir = tmp();
    const link = join(dir, "qlm-measure");
    symlinkSync(CLI_DIST, link);
    const r = spawnSync(process.execPath, [link, "version"], { encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("qlm-measure 0.9.0\nschema version: 0.2\ncatalog version: 1\n");
    rmSync(dir, { recursive: true });
  });
  it("exits 2 with usage when given no command", () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stdout.startsWith("Usage: qlm-measure")).toBe(true);
  });
});
