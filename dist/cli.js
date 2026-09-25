#!/usr/bin/env node
/**
 * qlm-measure CLI — verify evidence records from the command line.
 * verify makes no network calls. Records never leave your machine.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { createHash } from "crypto";
import { verifyRecord } from "./verifier/verify-record.js";
import { verifyRecordV03 } from "./verifier-v03.js";
import { verifyChain, listSchemes } from "./schemes/node.js";
import { CATALOG, SHIPPED_CHECKS, SHIPPED_CHECKS_V03, PLANNED_CHECKS, CATALOG_BY_ID, CATEGORIES, CATEGORIES_V03 } from "./checks.js";
const VERSION = "0.4.0";
function loadRecords(path) {
    let raw;
    if (path === "-") {
        const chunks = [];
        const fd = 0; // stdin
        const buf = Buffer.alloc(65536);
        let n;
        try {
            while ((n = require("fs").readSync(fd, buf)) > 0)
                chunks.push(buf.subarray(0, n));
        }
        catch { /* EOF */ }
        raw = Buffer.concat(chunks).toString("utf-8");
    }
    else {
        if (!existsSync(path))
            throw new Error(`File not found: ${path}`);
        raw = readFileSync(path, "utf-8");
    }
    // Strip BOM
    if (raw.charCodeAt(0) === 0xFEFF)
        raw = raw.slice(1);
    raw = raw.trim();
    if (!raw)
        throw new Error(`${path}: empty input`);
    if (raw[0] === "[") {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr))
            throw new Error(`${path}: expected array`);
        for (const item of arr) {
            if (!item.entries && !item.evidence)
                throw new Error(`${path}: element missing entries`);
        }
        return arr;
    }
    if (raw[0] === "{") {
        // Try as single JSON object first
        try {
            const obj = JSON.parse(raw);
            if (obj.entries || obj.evidence)
                return [obj];
        }
        catch { /* not a single object, try JSONL */ }
        // JSONL: multiple JSON objects, one per line
        const lines = raw.split("\n").filter(l => l.trim());
        if (lines.length > 1 && lines.every(l => l.trim().startsWith("{"))) {
            return lines.map((line, i) => {
                const obj = JSON.parse(line);
                if (!obj.entries && !obj.evidence)
                    throw new Error(`${path}: line ${i + 1} missing entries`);
                return obj;
            });
        }
        throw new Error(`${path}: could not parse as JSON or JSONL`);
    }
    throw new Error(`${path}: unrecognized format`);
}
// ── Report ──────────────────────────────────────────────────
function inferCheckId(category) {
    const map = {
        schema: "SCHEMA.REQUIRED", version: "VERSION.MONOTONIC",
        timestamp: "TIMESTAMP.MONOTONIC", enum: "ENUM.VALID",
        hash: "HASH.ENTRY_RECOMPUTE", posterior: "POSTERIOR.CHAIN",
        compaction: "COMPACTION.BOUNDARY",
    };
    return map[category] || `UNKNOWN.${category.toUpperCase()}`;
}
function buildReport(path, records, results) {
    const sha = path !== "-" && existsSync(path)
        ? createHash("sha256").update(readFileSync(path)).digest("hex") : "";
    const recordReports = records.map((rec, i) => {
        const result = results[i];
        const isV03 = rec.schemaVersion === "0.3" || !!rec.evidence;
        const checksList = isV03 ? SHIPPED_CHECKS_V03 : SHIPPED_CHECKS;
        const entries03 = isV03 ? (rec.evidence?.entries || []) : (rec.entries || []);
        const hasCompaction = !!rec.compactedBefore || !!(rec.evidence?.compactedBefore);
        const hasPosteriors = entries03.some((e) => typeof e.updatedPosterior === "number");
        const violsByCheck = {};
        for (const v of result.violations) {
            const cid = v.checkId || inferCheckId(v.category);
            (violsByCheck[cid] ??= []).push(v);
        }
        const checks = checksList.map(def => {
            const vlist = violsByCheck[def.id] || [];
            let status;
            if (def.id === "COMPACTION.BOUNDARY" && !hasCompaction)
                status = "not_applicable";
            else if (def.id === "POSTERIOR.CHAIN" && !hasPosteriors)
                status = "not_applicable";
            else if (vlist.length > 0)
                status = "fail";
            else
                status = "pass";
            const entry = { id: def.id, status, failures: vlist.length };
            if (vlist.length > 0)
                entry.first_failure = { version: vlist[0].version, message: vlist[0].message };
            return entry;
        });
        return {
            studentScopeId: rec.studentScopeId || "",
            schemaVersion: rec.schemaVersion || "0.2",
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
            if (c.status === "not_applicable")
                summary.checks_not_applicable++;
            else {
                summary.checks_run++;
                if (c.status === "pass")
                    summary.checks_passed++;
                else
                    summary.checks_failed++;
            }
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
function formatText(path, records, results) {
    const lines = [];
    const filename = path.split("/").pop() || path;
    lines.push(`qlm-measure verify ${filename}`);
    lines.push(`records: ${records.length}`);
    let totalValid = 0, totalInvalid = 0;
    for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const result = results[i];
        const isV03_t = rec.schemaVersion === "0.3" || !!rec.evidence;
        const checksList_t = isV03_t ? SHIPPED_CHECKS_V03 : SHIPPED_CHECKS;
        const categories_t = isV03_t ? CATEGORIES_V03 : CATEGORIES;
        const entries_t = isV03_t ? (rec.evidence?.entries || []) : (rec.entries || []);
        const hasCompaction = !!rec.compactedBefore || !!(rec.evidence?.compactedBefore);
        const hasPosteriors_t = entries_t.some((e) => typeof e.updatedPosterior === "number");
        const violsByCheck = {};
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
                }
                else if (def.id === "POSTERIOR.CHAIN" && !hasPosteriors_t) {
                    lines.push(`    \u2013 ${def.label}  (not applicable)`);
                }
                else if (vlist.length > 0) {
                    const first = vlist[0];
                    const detail = `${vlist.length} failure${vlist.length > 1 ? "s" : ""}; first at v${first.version}: ${first.message}`;
                    lines.push(`    \u2717 ${def.label}  (${detail})`);
                }
                else {
                    lines.push(`    \u2713 ${def.label}`);
                }
            }
        }
        const nv = result.violations.length;
        lines.push(`  violations: ${nv}`);
        if (result.valid) {
            lines.push("  VERDICT: CLEAN \u2014 record is verifiable");
            totalValid++;
        }
        else {
            lines.push(`  VERDICT: NOT CLEAN \u2014 ${nv} violation(s); see report`);
            totalInvalid++;
        }
    }
    const report = buildReport(path, records, results);
    const s = report.summary;
    lines.push("");
    lines.push(`summary: ${s.records} record(s), ${s.valid} valid, ${s.invalid} invalid; checks run ${s.checks_run}, passed ${s.checks_passed}, failed ${s.checks_failed}, not applicable ${s.checks_not_applicable}`);
    return lines.join("\n") + "\n";
}
// ── Commands ────────────────────────────────────────────────
function cmdVerify(args) {
    let format = "text";
    let reportFile = null;
    let quiet = false;
    const paths = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--format" && args[i + 1]) {
            format = args[++i];
        }
        else if (args[i] === "--report" && args[i + 1]) {
            reportFile = args[++i];
        }
        else if (args[i] === "--quiet") {
            quiet = true;
        }
        else if (args[i] === "--tolerance-ms") {
            i++; /* skip value, use default for now */
        }
        else if (args[i] === "--redact") { /* TODO */ }
        else {
            paths.push(args[i]);
        }
    }
    if (paths.length === 0) {
        console.error("error: no files specified");
        return 2;
    }
    let allRecords = [];
    let allResults = [];
    for (const p of paths) {
        try {
            const records = loadRecords(p);
            for (const r of records) {
                allRecords.push(r);
                // Dispatch by schema version
                const sv = r.schemaVersion || "0.2";
                if (sv === "0.3" || r.evidence) {
                    const r03 = verifyRecordV03(r);
                    allResults.push({ valid: r03.valid, violations: r03.violations.map(v => ({
                            version: v.version, category: v.category, message: v.message, checkId: v.checkId,
                        })), entriesChecked: r03.entriesChecked });
                }
                else {
                    allResults.push(verifyRecord(r));
                }
            }
        }
        catch (e) {
            console.error(`error: ${e.message}`);
            return 2;
        }
    }
    const label = paths.length === 1 ? paths[0] : `${paths.length} files`;
    if (format === "json" || reportFile) {
        const report = buildReport(label, allRecords, allResults);
        const json = JSON.stringify(report, null, 2);
        if (reportFile)
            writeFileSync(reportFile, json + "\n");
        if (format === "json")
            console.log(json);
        else if (!quiet)
            process.stdout.write(formatText(label, allRecords, allResults));
    }
    else if (!quiet) {
        process.stdout.write(formatText(label, allRecords, allResults));
    }
    return allResults.some(r => !r.valid) ? 1 : 0;
}
function cmdExplain(args) {
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
    }
    else {
        console.log("qlm-measure check catalog (v1)");
        console.log();
        console.log("Shipped checks (run by verify):");
        for (const c of SHIPPED_CHECKS)
            console.log(`  ${c.id.padEnd(28)} ${c.label}`);
        console.log();
        console.log("Planned checks (listed, not run):");
        for (const c of PLANNED_CHECKS)
            console.log(`  ${c.id.padEnd(28)} ${c.label}`);
        console.log();
        console.log("Use 'qlm-measure explain CHECK_ID' for details.");
    }
    return 0;
}
function cmdVersion() {
    console.log(`qlm-measure ${VERSION}`);
    console.log("schema version: 0.2");
    console.log("catalog version: 1");
    return 0;
}
// ── Main ────────────────────────────────────────────────────
// ── verify-chain: per-event hash chains sealed by QLM products ─────────────
function cmdVerifyChain(argv) {
    const opts = {};
    const positional = [];
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === "--family" || a === "--scheme" || a === "--format") {
            opts[a.slice(2)] = argv[++i];
        }
        else if (a === "--allow-mixed") {
            opts.allowMixed = "1";
        }
        else if (a === "--list") {
            opts.list = "1";
        }
        else
            positional.push(a);
    }
    if (opts.list) {
        for (const s of listSchemes())
            console.log(`${s.id}\t${s.family}\tsince ${s.since}\t${s.hashField}/${s.prevField}`);
        return 0;
    }
    const file = positional[0];
    if (!file) {
        console.error("Usage: qlm-measure verify-chain <events.json> (--family F | --scheme S) [--allow-mixed] [--format text|json] | --list");
        return 2;
    }
    if (!opts.family && !opts.scheme) {
        console.error("ERROR: pass --family (e.g. tpc/clinical) or --scheme (e.g. tpc/clinical-v2)");
        return 2;
    }
    if (!existsSync(file)) {
        console.error(`ERROR: ${file} not found`);
        return 2;
    }
    let events;
    try {
        events = JSON.parse(readFileSync(file, "utf-8"));
    }
    catch (e) {
        console.error(`ERROR: parse failed: ${e}`);
        return 2;
    }
    if (!Array.isArray(events) && events && typeof events === "object" && Array.isArray(events.events)) {
        events = events.events; // { events: [...] } wrapper (vectors, exports with metadata)
    }
    if (!Array.isArray(events)) {
        console.error("ERROR: not an array of events (or an object with an events array)");
        return 2;
    }
    let r;
    try {
        r = verifyChain(events, { family: opts.family, scheme: opts.scheme, rejectMixed: !opts.allowMixed });
    }
    catch (e) {
        console.error(`ERROR: ${e.message}`);
        return 2;
    }
    if (opts.format === "json") {
        console.log(JSON.stringify({ verifier: `qlm-measure ${VERSION}`, file, ...r }, null, 2));
        return r.clean ? 0 : 1;
    }
    console.log(`qlm-measure verify-chain ${VERSION}`);
    console.log(`file: ${file}`);
    console.log(`timestamp: ${new Date().toISOString()}`);
    console.log(`result: ${r.clean ? "CLEAN" : "FAIL"}`);
    console.log(`events: ${r.stats.total}`);
    console.log(`gaps: ${r.stats.gaps}`);
    console.log(`duplicates: ${r.stats.duplicates}`);
    console.log(`tampered: ${r.stats.tampered}`);
    console.log(`schema_errors: ${r.stats.schema_errors}`);
    console.log(`hash_scheme: ${r.stats.hash_scheme}`);
    console.log(`schemes: ${JSON.stringify(r.stats.schemes)}`);
    if (!r.clean) {
        console.log("\nerrors:");
        r.errors.forEach((e) => console.log(`  ${e}`));
    }
    return r.clean ? 0 : 1;
}
const args = process.argv.slice(2);
const cmd = args[0];
let exitCode;
switch (cmd) {
    case "verify":
        exitCode = cmdVerify(args.slice(1));
        break;
    case "verify-chain":
        exitCode = cmdVerifyChain(args.slice(1));
        break;
    case "explain":
        exitCode = cmdExplain(args.slice(1));
        break;
    case "version":
        exitCode = cmdVersion();
        break;
    default:
        console.log("Usage: qlm-measure <verify|verify-chain|explain|version> [options]");
        console.log("  verify PATH [--format text|json] [--report FILE] [--quiet]");
        console.log("  explain [CHECK_ID]");
        console.log("  version");
        exitCode = cmd ? 2 : 2;
}
process.exit(exitCode);
//# sourceMappingURL=cli.js.map