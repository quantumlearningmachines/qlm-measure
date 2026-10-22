#!/usr/bin/env node
/**
 * qlm-measure CLI — verify evidence records from the command line.
 * verify makes no network calls. Records never leave your machine.
 */

import { readFileSync, writeFileSync, existsSync, realpathSync } from "fs";
import { createHash } from "crypto";
import { fileURLToPath } from "url";
import { verifyRecord } from "./verifier/verify-record.js";
import type { VerificationResult, Violation } from "./verifier/verify-record.js";
import { verifyRecordV03 } from "./verifier-v03.js";
import { verifyChain, listSchemes } from "./schemes/node.js";
import { CATALOG, SHIPPED_CHECKS, SHIPPED_CHECKS_V03, PLANNED_CHECKS, CATALOG_BY_ID, CATEGORIES, CATEGORIES_V03 } from "./checks.js";

const VERSION = "0.9.0";

/** Where the CLI writes and reads. Tests pass their own; the binary uses processIO. */
export interface CliIO {
  out(text: string): void;
  err(text: string): void;
  readStdin(): string;
}

export const processIO: CliIO = {
  out: (text) => { process.stdout.write(text); },
  err: (text) => { process.stderr.write(text); },
  readStdin: () => readFileSync(0, "utf-8"),
};

/** The value when it is an array, else an empty list, so a malformed record is reported rather than crashing the report. */
function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

// ── Loader ──────────────────────────────────────────────────

/** A record as read from disk, before verification: any field may be missing or malformed. */
interface EvidenceRecord {
  studentScopeId?: string;
  schemaVersion?: string;
  entries?: unknown;
  compactedBefore?: unknown;
  evidence?: { entries?: unknown; compactedBefore?: unknown };
  [key: string]: unknown;
}

/** True for a record the 0.3 verifier handles: schemaVersion "0.3", or an evidence block. */
function isV03Record(rec: EvidenceRecord): boolean {
  return rec.schemaVersion === "0.3" || !!rec.evidence;
}

function hasPosteriorEntries(entries: unknown[]): boolean {
  return entries.some((e) => typeof (e as { updatedPosterior?: unknown } | null)?.updatedPosterior === "number");
}

function hasRecordBody(item: unknown): boolean {
  const o = item as { entries?: unknown; evidence?: unknown } | null;
  return typeof o === "object" && o !== null && (!!o.entries || !!o.evidence);
}

function loadRecords(path: string, io: CliIO): EvidenceRecord[] {
  let raw: string;
  if (path === "-") {
    raw = io.readStdin();
  } else {
    if (!existsSync(path)) throw new Error(`File not found: ${path}`);
    raw = readFileSync(path, "utf-8");
  }

  // Strip BOM
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  raw = raw.trim();
  if (!raw) throw new Error(`${path}: empty input`);

  if (raw[0] === "[") {
    const arr: unknown[] = JSON.parse(raw);
    for (const item of arr) {
      if (!hasRecordBody(item)) throw new Error(`${path}: element missing entries`);
    }
    return arr as EvidenceRecord[];
  }
  if (raw[0] === "{") {
    // Try as single JSON object first
    try {
      const obj = JSON.parse(raw);
      if (hasRecordBody(obj)) return [obj];
    } catch { /* not a single object, try JSONL */ }
    // JSONL: multiple JSON objects, one per line
    const lines = raw.split("\n").filter(l => l.trim());
    if (lines.length > 1 && lines.every(l => l.trim().startsWith("{"))) {
      return lines.map((line, i) => {
        const obj = JSON.parse(line);
        if (!hasRecordBody(obj)) throw new Error(`${path}: line ${i + 1} missing entries`);
        return obj;
      });
    }
    throw new Error(`${path}: could not parse as JSON or JSONL`);
  }
  throw new Error(`${path}: unrecognized format`);
}

// ── Report ──────────────────────────────────────────────────

function buildReport(path: string, records: EvidenceRecord[], results: VerificationResult[]) {
  const sha = path !== "-" && existsSync(path)
    ? createHash("sha256").update(readFileSync(path)).digest("hex") : "";

  const recordReports = records.map((rec, i) => {
    const result = results[i];
    const isV03 = isV03Record(rec);
    const checksList = isV03 ? SHIPPED_CHECKS_V03 : SHIPPED_CHECKS;
    const entries03 = isV03 ? listOf(rec.evidence?.entries) : listOf(rec.entries);
    const hasCompaction = !!rec.compactedBefore || !!rec.evidence?.compactedBefore;
    const hasPosteriors = hasPosteriorEntries(entries03);
    const violsByCheck: Record<string, Violation[]> = {};
    for (const v of result.violations) {
      const cid = v.checkId;
      (violsByCheck[cid] ??= []).push(v);
    }

    const checks = checksList.map(def => {
      const vlist = violsByCheck[def.id] || [];
      let status: string;
      if (def.id === "COMPACTION.BOUNDARY" && !hasCompaction) status = "not_applicable";
      else if (def.id === "POSTERIOR.CHAIN" && !hasPosteriors) status = "not_applicable";
      else if (vlist.length > 0) status = "fail";
      else status = "pass";
      const entry: { id: string; status: string; failures: number; first_failure?: { version: number; message: string } } = { id: def.id, status, failures: vlist.length };
      if (vlist.length > 0) entry.first_failure = { version: vlist[0].version, message: vlist[0].message };
      return entry;
    });

    return {
      studentScopeId: rec.studentScopeId || "",
      schemaVersion: rec.schemaVersion || "0.2",
      entries_checked: result.entriesChecked,
      valid: result.valid,
      checks,
      violations: result.violations.map(v => ({
        version: v.version, check_id: v.checkId,
        category: v.category, message: v.message,
      })),
    };
  });

  const summary = {
    records: records.length,
    valid: results.filter(r => r.valid).length,
    invalid: results.filter(r => !r.valid).length,
    checks_run: 0, checks_passed: 0, checks_failed: 0, checks_not_applicable: 0,
  };
  for (const rr of recordReports) {
    for (const c of rr.checks) {
      if (c.status === "not_applicable") summary.checks_not_applicable++;
      else { summary.checks_run++; if (c.status === "pass") summary.checks_passed++; else summary.checks_failed++; }
    }
  }

  return {
    tool: { name: "qlm-measure", version: VERSION, language: "javascript", catalog_version: "1" },
    input: { path: baseName(path), sha256: sha, records: records.length },
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    records: recordReports,
    summary,
  };
}

function formatText(path: string, records: EvidenceRecord[], results: VerificationResult[]): string {
  const lines: string[] = [];
  const filename = baseName(path);
  lines.push(`qlm-measure verify ${filename}`);
  lines.push(`records: ${records.length}`);

  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    const result = results[i];
    const isV03_t = isV03Record(rec);
    const checksList_t = isV03_t ? SHIPPED_CHECKS_V03 : SHIPPED_CHECKS;
    const categories_t = isV03_t ? CATEGORIES_V03 : CATEGORIES;
    const entries_t = isV03_t ? listOf(rec.evidence?.entries) : listOf(rec.entries);
    const hasCompaction = !!rec.compactedBefore || !!rec.evidence?.compactedBefore;
    const hasPosteriors_t = hasPosteriorEntries(entries_t);
    const violsByCheck: Record<string, Violation[]> = {};
    for (const v of result.violations) {
      const cid = v.checkId;
      (violsByCheck[cid] ??= []).push(v);
    }

    lines.push("");
    lines.push(`record ${rec.studentScopeId || "?"}  (schema ${rec.schemaVersion || "0.2"}, ${listOf(rec.entries || rec.evidence?.entries).length} entries)`);

    for (const cat of categories_t) {
      lines.push(`  ${cat}`);
      for (const def of checksList_t.filter(c => c.category === cat)) {
        const vlist = violsByCheck[def.id] || [];
        if (def.id === "COMPACTION.BOUNDARY" && !hasCompaction) {
          lines.push(`    \u2013 ${def.label}  (not applicable)`);
        } else if (def.id === "POSTERIOR.CHAIN" && !hasPosteriors_t) {
          lines.push(`    \u2013 ${def.label}  (not applicable)`);
        } else if (vlist.length > 0) {
          const first = vlist[0];
          const detail = `${vlist.length} failure${vlist.length > 1 ? "s" : ""}; first at v${first.version}: ${first.message}`;
          lines.push(`    \u2717 ${def.label}  (${detail})`);
        } else {
          lines.push(`    \u2713 ${def.label}`);
        }
      }
    }

    const nv = result.violations.length;
    lines.push(`  violations: ${nv}`);
    if (result.valid) lines.push("  VERDICT: CLEAN \u2014 record is verifiable");
    else lines.push(`  VERDICT: NOT CLEAN \u2014 ${nv} violation(s); see report`);
  }

  const report = buildReport(path, records, results);
  const s = report.summary;
  lines.push("");
  lines.push(`summary: ${s.records} record(s), ${s.valid} valid, ${s.invalid} invalid; checks run ${s.checks_run}, passed ${s.checks_passed}, failed ${s.checks_failed}, not applicable ${s.checks_not_applicable}`);
  return lines.join("\n") + "\n";
}

// ── Commands ────────────────────────────────────────────────

/**
 * Options the Python CLI has and this CLI does not implement. They stop with an
 * error rather than being accepted and silently ignored.
 */
const UNSUPPORTED_VERIFY_OPTIONS = new Set(["--redact", "--tolerance-ms"]);

class UsageError extends Error {}

function cmdVerify(args: string[], io: CliIO): number {
  let format = "text";
  let reportFile: string | null = null;
  let quiet = false;
  const paths: string[] = [];

  try {
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === "--format") {
        format = args[++i];
        if (format !== "text" && format !== "json") throw new UsageError("--format must be text or json");
      } else if (a === "--report") {
        const next = args[++i];
        if (next === undefined) throw new UsageError("--report needs a file name");
        reportFile = next;
      } else if (a === "--quiet") {
        quiet = true;
      } else if (UNSUPPORTED_VERIFY_OPTIONS.has(a)) {
        throw new UsageError(`${a} is not supported by the JavaScript CLI; the Python CLI (python/qlm_measure) supports it`);
      } else if (a.startsWith("--")) {
        throw new UsageError(`unknown option: ${a}`);
      } else {
        paths.push(a);
      }
    }
  } catch (e) {
    io.err(`error: ${(e as Error).message}\n`);
    return 2;
  }

  if (paths.length === 0) { io.err("error: no files specified\n"); return 2; }

  const allRecords: EvidenceRecord[] = [];
  const allResults: VerificationResult[] = [];

  for (const p of paths) {
    try {
      const records = loadRecords(p, io);
      for (const r of records) {
        allRecords.push(r);
        // Dispatch by schema version
        if (isV03Record(r)) {
          const r03 = verifyRecordV03(r);
          allResults.push({ valid: r03.valid, violations: r03.violations.map(v => ({
            version: v.version, category: v.category as Violation["category"], message: v.message, checkId: v.checkId,
          })), entriesChecked: r03.entriesChecked });
        } else {
          allResults.push(verifyRecord(r as unknown as Parameters<typeof verifyRecord>[0]));
        }
      }
    } catch (e) {
      io.err(`error: ${(e as Error).message}\n`);
      return 2;
    }
  }

  if (allRecords.length === 0) { io.err("error: no records loaded\n"); return 2; }

  const label = paths.length === 1 ? paths[0] : `${paths.length} files`;

  if (format === "json" || reportFile) {
    const report = buildReport(label, allRecords, allResults);
    const json = JSON.stringify(report, null, 2);
    if (reportFile) writeFileSync(reportFile, json + "\n");
    if (format === "json") io.out(json + "\n");
    else if (!quiet) io.out(formatText(label, allRecords, allResults));
  } else if (!quiet) {
    io.out(formatText(label, allRecords, allResults));
  }

  return allResults.some(r => !r.valid) ? 1 : 0;
}

function cmdExplain(args: string[], io: CliIO): number {
  const say = (line = "") => io.out(line + "\n");
  const checkId = args[0];
  if (checkId) {
    const def = CATALOG_BY_ID[checkId];
    if (!def) {
      io.err(`error: unknown check ID: ${checkId}\n`);
      io.err(`Available: ${CATALOG.map(c => c.id).join(", ")}\n`);
      return 2;
    }
    say(`${def.id} — ${def.label}`);
    say(`  Status:    ${def.status}`);
    say(`  Category:  ${def.category}`);
    say(`  Scope:     ${def.scope}`);
    say(`  Since:     ${def.introducedIn}`);
    say();
    say(`  ${def.description}`);
    say();
    say(`  How to pass: ${def.howToPass}`);
  } else {
    say("qlm-measure check catalog (v1)");
    say();
    say("Shipped checks (run by verify):");
    for (const c of SHIPPED_CHECKS) say(`  ${c.id.padEnd(28)} ${c.label}`);
    say();
    say("Planned checks (listed, not run):");
    for (const c of PLANNED_CHECKS) say(`  ${c.id.padEnd(28)} ${c.label}`);
    say();
    say("Use 'qlm-measure explain CHECK_ID' for details.");
  }
  return 0;
}

function cmdVersion(io: CliIO): number {
  io.out(`qlm-measure ${VERSION}\n`);
  io.out("schema version: 0.2\n");
  io.out("catalog version: 1\n");
  return 0;
}

// ── verify-chain: per-event hash chains sealed by QLM products ─────────────
function cmdVerifyChain(argv: string[], io: CliIO): number {
  const say = (line: string) => io.out(line + "\n");
  const fail = (line: string) => { io.err(line + "\n"); return 2; };
  const opts: { family?: string; scheme?: string; format: string; allowMixed: boolean; list: boolean } = { format: "text", allowMixed: false, list: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--family" || a === "--scheme") {
      const v = argv[++i];
      if (v === undefined) return fail(`ERROR: ${a} needs a value`);
      opts[a === "--family" ? "family" : "scheme"] = v;
    } else if (a === "--format") {
      opts.format = argv[++i];
      if (opts.format !== "text" && opts.format !== "json") return fail("ERROR: --format must be text or json");
    } else if (a === "--allow-mixed") { opts.allowMixed = true; }
    else if (a === "--list") { opts.list = true; }
    else if (a.startsWith("--")) { return fail(`ERROR: unknown option: ${a}`); }
    else positional.push(a);
  }
  if (opts.list) {
    for (const s of listSchemes()) say(`${s.id}\t${s.family}\tsince ${s.since}\t${s.hashField}/${s.prevField}`);
    return 0;
  }
  const file = positional[0];
  if (!file) return fail("Usage: qlm-measure verify-chain <events.json> (--family F | --scheme S) [--allow-mixed] [--format text|json] | --list");
  if (!opts.family && !opts.scheme) return fail("ERROR: pass --family (e.g. tpc/clinical) or --scheme (e.g. tpc/clinical-v2)");
  if (!existsSync(file)) return fail(`ERROR: ${file} not found`);
  let events: unknown;
  try { events = JSON.parse(readFileSync(file, "utf-8")); } catch (e) { return fail(`ERROR: parse failed: ${e}`); }
  if (!Array.isArray(events) && events && typeof events === "object" && Array.isArray((events as { events?: unknown }).events)) {
    events = (events as { events: unknown[] }).events; // { events: [...] } wrapper (vectors, exports with metadata)
  }
  if (!Array.isArray(events)) return fail("ERROR: not an array of events (or an object with an events array)");
  let r;
  try { r = verifyChain(events, { family: opts.family, scheme: opts.scheme, rejectMixed: !opts.allowMixed }); }
  catch (e) { return fail(`ERROR: ${(e as Error).message}`); }
  if (opts.format === "json") { say(JSON.stringify({ verifier: `qlm-measure ${VERSION}`, file, ...r }, null, 2)); return r.clean ? 0 : 1; }
  say(`qlm-measure verify-chain ${VERSION}`);
  say(`file: ${file}`);
  say(`timestamp: ${new Date().toISOString()}`);
  say(`result: ${r.clean ? "CLEAN" : "FAIL"}`);
  say(`events: ${r.stats.total}`);
  say(`gaps: ${r.stats.gaps}`);
  say(`duplicates: ${r.stats.duplicates}`);
  say(`tampered: ${r.stats.tampered}`);
  say(`schema_errors: ${r.stats.schema_errors}`);
  say(`hash_scheme: ${r.stats.hash_scheme}`);
  say(`schemes: ${JSON.stringify(r.stats.schemes)}`);
  if (!r.clean) { say("\nerrors:"); r.errors.forEach((e) => say(`  ${e}`)); }
  return r.clean ? 0 : 1;
}

// ── Main ────────────────────────────────────────────────────

const USAGE = [
  "Usage: qlm-measure <verify|verify-chain|explain|version> [options]",
  "  verify PATH... [--format text|json] [--report FILE] [--quiet]",
  "  verify-chain EVENTS_JSON (--family F | --scheme S) [--allow-mixed] [--format text|json]",
  "  verify-chain --list",
  "  explain [CHECK_ID]",
  "  version",
  "",
].join("\n");

/** Runs one CLI invocation and returns its exit code: 0 clean, 1 not clean, 2 usage or input error. */
export function main(argv: string[], io: CliIO = processIO): number {
  const [cmd, ...rest] = argv;
  switch (cmd) {
    case "verify": return cmdVerify(rest, io);
    case "verify-chain": return cmdVerifyChain(rest, io);
    case "explain": return cmdExplain(rest, io);
    case "version": return cmdVersion(io);
    default:
      io.out(USAGE);
      return 2;
  }
}

/** True when this module is the script node was started with, including through npm's bin symlink. */
export function isDirectRun(scriptPath: string | undefined, moduleUrl: string): boolean {
  if (!scriptPath) return false;
  try {
    return realpathSync(scriptPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

if (isDirectRun(process.argv[1], import.meta.url)) process.exit(main(process.argv.slice(2)));
