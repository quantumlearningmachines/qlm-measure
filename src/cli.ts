#!/usr/bin/env node
/**
 * qlm-measure CLI — verify evidence records from the command line.
 * verify makes no network calls. Records never leave your machine.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { verifyRecord } from "./verifier/verify-record.js";
import type { VerificationResult, Violation } from "./verifier/verify-record.js";
import { verifyRecordV03 } from "./verifier-v03.js";
import { CATALOG, SHIPPED_CHECKS, SHIPPED_CHECKS_V03, PLANNED_CHECKS, CATALOG_BY_ID, CATEGORIES, CATEGORIES_V03 } from "./checks.js";

const VERSION = "0.2.7";

// ── Loader ──────────────────────────────────────────────────

interface EvidenceRecord {
  studentScopeId?: string;
  schemaVersion?: string;
  entries?: unknown[];
  compactedBefore?: { version: number; summaryHash: string };
  [key: string]: unknown;
}

function loadRecords(path: string): EvidenceRecord[] {
  let raw: string;
  if (path === "-") {
    const chunks: Buffer[] = [];
    const fd = 0; // stdin
    const buf = Buffer.alloc(65536);
    let n: number;
    try {
      while ((n = require("fs").readSync(fd, buf)) > 0) chunks.push(buf.subarray(0, n));
    } catch { /* EOF */ }
    raw = Buffer.concat(chunks).toString("utf-8");
  } else {
    if (!existsSync(path)) throw new Error(`File not found: ${path}`);
    raw = readFileSync(path, "utf-8");
  }

  // Strip BOM
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  raw = raw.trim();
  if (!raw) throw new Error(`${path}: empty input`);

  if (raw[0] === "[") {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) throw new Error(`${path}: expected array`);
    for (const item of arr) {
      if (!item.entries && !item.evidence) throw new Error(`${path}: element missing entries`);
    }
    return arr;
  }
  if (raw[0] === "{") {
    // Try as single JSON object first
    try {
      const obj = JSON.parse(raw);
      if (obj.entries || obj.evidence) return [obj];
    } catch { /* not a single object, try JSONL */ }
    // JSONL: multiple JSON objects, one per line
    const lines = raw.split("\n").filter(l => l.trim());
    if (lines.length > 1 && lines.every(l => l.trim().startsWith("{"))) {
      return lines.map((line, i) => {
        const obj = JSON.parse(line);
        if (!obj.entries && !obj.evidence) throw new Error(`${path}: line ${i + 1} missing entries`);
        return obj;
      });
    }
    throw new Error(`${path}: could not parse as JSON or JSONL`);
  }
  throw new Error(`${path}: unrecognized format`);
}

// ── Report ──────────────────────────────────────────────────

function inferCheckId(category: string): string {
  const map: Record<string, string> = {
    schema: "SCHEMA.REQUIRED", version: "VERSION.MONOTONIC",
    timestamp: "TIMESTAMP.MONOTONIC", enum: "ENUM.VALID",
    hash: "HASH.ENTRY_RECOMPUTE", posterior: "POSTERIOR.CHAIN",
    compaction: "COMPACTION.BOUNDARY",
  };
  return map[category] || `UNKNOWN.${category.toUpperCase()}`;
}

function buildReport(path: string, records: EvidenceRecord[], results: VerificationResult[]) {
  const sha = path !== "-" && existsSync(path)
    ? createHash("sha256").update(readFileSync(path)).digest("hex") : "";

  const recordReports = records.map((rec, i) => {
    const result = results[i];
    const isV03 = (rec as any).schemaVersion === "0.3" || !!(rec as any).evidence;
    const checksList = isV03 ? SHIPPED_CHECKS_V03 : SHIPPED_CHECKS;
    const entries03 = isV03 ? ((rec as any).evidence?.entries || []) : ((rec as any).entries || []);
    const hasCompaction = !!(rec as any).compactedBefore || !!((rec as any).evidence?.compactedBefore);
    const hasPosteriors = entries03.some((e: any) => typeof e.updatedPosterior === "number");
    const violsByCheck: Record<string, Violation[]> = {};
    for (const v of result.violations) {
      const cid = v.checkId || inferCheckId(v.category);
      (violsByCheck[cid] ??= []).push(v);
    }

    const checks = checksList.map(def => {
      const vlist = violsByCheck[def.id] || [];
      let status: string;
      if (def.id === "COMPACTION.BOUNDARY" && !hasCompaction) status = "not_applicable";
      else if (def.id === "POSTERIOR.CHAIN" && !hasPosteriors) status = "not_applicable";
      else if (vlist.length > 0) status = "fail";
      else status = "pass";
      const entry: any = { id: def.id, status, failures: vlist.length };
      if (vlist.length > 0) entry.first_failure = { version: vlist[0].version, message: vlist[0].message };
      return entry;
    });

    return {
      studentScopeId: (rec as any).studentScopeId || "",
      schemaVersion: (rec as any).schemaVersion || "0.2",
      entries_checked: result.entriesChecked,
      valid: result.valid,
      checks,
      violations: result.violations.map(v => ({
        version: v.version, check_id: v.checkId || inferCheckId(v.category),
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
    input: { path: path.split("/").pop() || path, sha256: sha, records: records.length },
    generated_at: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    records: recordReports,
    summary,
  };
}

function formatText(path: string, records: EvidenceRecord[], results: VerificationResult[]): string {
  const lines: string[] = [];
  const filename = path.split("/").pop() || path;
  lines.push(`qlm-measure verify ${filename}`);
  lines.push(`records: ${records.length}`);

  let totalValid = 0, totalInvalid = 0;

  for (let i = 0; i < records.length; i++) {
    const rec = records[i] as any;
    const result = results[i];
    const isV03_t = rec.schemaVersion === "0.3" || !!rec.evidence;
    const checksList_t = isV03_t ? SHIPPED_CHECKS_V03 : SHIPPED_CHECKS;
    const categories_t = isV03_t ? CATEGORIES_V03 : CATEGORIES;
    const entries_t = isV03_t ? (rec.evidence?.entries || []) : (rec.entries || []);
    const hasCompaction = !!rec.compactedBefore || !!(rec.evidence?.compactedBefore);
    const hasPosteriors_t = entries_t.some((e: any) => typeof e.updatedPosterior === "number");
    const violsByCheck: Record<string, Violation[]> = {};
    for (const v of result.violations) {
      const cid = v.checkId || inferCheckId(v.category);
      (violsByCheck[cid] ??= []).push(v);
    }

    lines.push("");
    lines.push(`record ${rec.studentScopeId || "?"}  (schema ${rec.schemaVersion || "0.2"}, ${(rec.entries || rec.evidence?.entries || []).length} entries)`);

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
    if (result.valid) { lines.push("  VERDICT: CLEAN \u2014 record is verifiable"); totalValid++; }
    else { lines.push(`  VERDICT: NOT CLEAN \u2014 ${nv} violation(s); see report`); totalInvalid++; }
  }

  const report = buildReport(path, records, results);
  const s = report.summary;
  lines.push("");
  lines.push(`summary: ${s.records} record(s), ${s.valid} valid, ${s.invalid} invalid; checks run ${s.checks_run}, passed ${s.checks_passed}, failed ${s.checks_failed}, not applicable ${s.checks_not_applicable}`);
  return lines.join("\n") + "\n";
}

// ── Commands ────────────────────────────────────────────────

function cmdVerify(args: string[]): number {
  let format = "text";
  let reportFile: string | null = null;
  let quiet = false;
  const paths: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--format" && args[i + 1]) { format = args[++i]; }
    else if (args[i] === "--report" && args[i + 1]) { reportFile = args[++i]; }
    else if (args[i] === "--quiet") { quiet = true; }
    else if (args[i] === "--tolerance-ms") { i++; /* skip value, use default for now */ }
    else if (args[i] === "--redact") { /* TODO */ }
    else { paths.push(args[i]); }
  }

  if (paths.length === 0) { console.error("error: no files specified"); return 2; }

  let allRecords: EvidenceRecord[] = [];
  let allResults: VerificationResult[] = [];

  for (const p of paths) {
    try {
      const records = loadRecords(p);
      for (const r of records) {
        allRecords.push(r);
        // Dispatch by schema version
        const sv = (r as any).schemaVersion || "0.2";
        if (sv === "0.3" || (r as any).evidence) {
          const r03 = verifyRecordV03(r as any);
          allResults.push({ valid: r03.valid, violations: r03.violations.map(v => ({
            version: v.version, category: v.category as any, message: v.message, checkId: v.checkId,
          })), entriesChecked: r03.entriesChecked });
        } else {
          allResults.push(verifyRecord(r as any));
        }
      }
    } catch (e: any) {
      console.error(`error: ${e.message}`);
      return 2;
    }
  }

  const label = paths.length === 1 ? paths[0] : `${paths.length} files`;

  if (format === "json" || reportFile) {
    const report = buildReport(label, allRecords, allResults);
    const json = JSON.stringify(report, null, 2);
    if (reportFile) writeFileSync(reportFile, json + "\n");
    if (format === "json") console.log(json);
    else if (!quiet) process.stdout.write(formatText(label, allRecords, allResults));
  } else if (!quiet) {
    process.stdout.write(formatText(label, allRecords, allResults));
  }

  return allResults.some(r => !r.valid) ? 1 : 0;
}

function cmdExplain(args: string[]): number {
  const checkId = args[0];
  if (checkId) {
    const def = CATALOG_BY_ID[checkId];
    if (!def) {
      console.error(`error: unknown check ID: ${checkId}`);
      console.error(`Available: ${CATALOG.map(c => c.id).join(", ")}`);
      return 2;
    }
    console.log(`${def.id} — ${def.label}`);
    console.log(`  Status:    ${def.status}`);
    console.log(`  Category:  ${def.category}`);
    console.log(`  Scope:     ${def.scope}`);
    console.log(`  Since:     ${def.introducedIn}`);
    console.log();
    console.log(`  ${def.description}`);
    console.log();
    console.log(`  How to pass: ${def.howToPass}`);
  } else {
    console.log("qlm-measure check catalog (v1)");
    console.log();
    console.log("Shipped checks (run by verify):");
    for (const c of SHIPPED_CHECKS) console.log(`  ${c.id.padEnd(28)} ${c.label}`);
    console.log();
    console.log("Planned checks (listed, not run):");
    for (const c of PLANNED_CHECKS) console.log(`  ${c.id.padEnd(28)} ${c.label}`);
    console.log();
    console.log("Use 'qlm-measure explain CHECK_ID' for details.");
  }
  return 0;
}

function cmdVersion(): number {
  console.log(`qlm-measure ${VERSION}`);
  console.log("schema version: 0.2");
  console.log("catalog version: 1");
  return 0;
}

// ── Main ────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cmd = args[0];

let exitCode: number;
switch (cmd) {
  case "verify": exitCode = cmdVerify(args.slice(1)); break;
  case "explain": exitCode = cmdExplain(args.slice(1)); break;
  case "version": exitCode = cmdVersion(); break;
  default:
    console.log("Usage: qlm-measure <verify|explain|version> [options]");
    console.log("  verify PATH [--format text|json] [--report FILE] [--quiet]");
    console.log("  explain [CHECK_ID]");
    console.log("  version");
    exitCode = cmd ? 2 : 2;
}
process.exit(exitCode);
