/**
 * Hash utilities for evidence record integrity.
 *
 * Uses SHA-256 via Node's crypto module (ESM import).
 * Canonical serialization ensures deterministic hashing.
 */

import { createHash } from "crypto";
import type { EvidenceEntry } from "../schema/evidence-record.js";

/**
 * Format a number to match Python's json.dumps output.
 *
 * Python's json.dumps uses different formatting for int vs float:
 *   int 9200     → "9200"     (no decimal point)
 *   float 1.0    → "1.0"     (always has decimal point)
 *   float 3e-05  → "3e-05"   (2-digit exponent minimum)
 *
 * JS has no int/float distinction. We use Number.isInteger() as the
 * heuristic: if the JSON source had no decimal point, Python stored
 * it as int and wrote it without .0.
 *
 * For the entry-hash hashable subset, only evidentialWeight,
 * priorPosterior, and updatedPosterior are Python floats. version is
 * an int. Everything inside event follows Python's own int/float typing
 * from the original JSON (which round-trips through JSON.parse identically).
 */
function pyNumberFormat(n: number): string {
  if (Object.is(n, -0)) return "-0.0";

  // Python int path: no decimal point
  if (Number.isInteger(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) {
    return n.toString();
  }

  // Python float path
  let s = JSON.stringify(n);

  // Fix scientific notation exponent padding: JS e-7 → Python e-07
  s = s.replace(/e([+-])(\d)$/, "e$10$2");

  // JS may not use scientific notation where Python does
  // Python uses it for |n| < 1e-4
  const abs = Math.abs(n);
  if (abs > 0 && abs < 1e-4 && !s.includes("e")) {
    const exp = Math.floor(Math.log10(abs));
    const mantissa = n / Math.pow(10, exp);
    let mStr = mantissa.toPrecision(17).replace(/0+$/, "").replace(/\.$/, "");
    const pyRepr = `${mStr}e-${String(-exp).padStart(2, "0")}`;
    if (parseFloat(pyRepr) === n) return pyRepr;
  }

  return s;
}

/**
 * Canonical JSON serialization — sorted keys, no whitespace.
 * Matches Python's json.dumps(sort_keys=True, separators=(",",":"), default=str)
 * byte-for-byte, including number formatting.
 */
export function canonicalize(obj: unknown): string {
  return _canonicalizeValue(obj);
}

function _canonicalizeValue(val: unknown): string {
  if (val === null) return "null";
  if (val === undefined) return "null";
  if (typeof val === "boolean") return val ? "true" : "false";
  if (typeof val === "number") return pyNumberFormat(val);
  if (typeof val === "string") return JSON.stringify(val);
  if (Array.isArray(val)) {
    return "[" + val.map(_canonicalizeValue).join(",") + "]";
  }
  if (typeof val === "object") {
    const keys = Object.keys(val as Record<string, unknown>).sort();
    const pairs = keys.map(k => {
      const v = (val as Record<string, unknown>)[k];
      return JSON.stringify(k) + ":" + _canonicalizeValue(v);
    });
    return "{" + pairs.join(",") + "}";
  }
  return JSON.stringify(val);
}

/**
 * Compute SHA-256 hash of a string.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Compute the canonical hash of an evidence entry.
 * Every field must be explicitly null (not undefined) to match Python.
 */
export function hashEntry(entry: EvidenceEntry): string {
  const hashable = {
    version: entry.version,
    timestamp: entry.timestamp,
    event: entry.event,
    scaffoldType: entry.scaffoldType ?? null,
    depthLevel: entry.depthLevel ?? null,
    epistemicMode: entry.epistemicMode ?? null,
    triageResult: entry.triageResult ?? null,
    evidentialWeight: entry.evidentialWeight,
    priorPosterior: entry.priorPosterior,
    updatedPosterior: entry.updatedPosterior,
    nonInterventionDecision: entry.nonInterventionDecision ?? null,
  };

  // Build canonical, then fix the three Python-float fields:
  // evidentialWeight, priorPosterior, updatedPosterior are Python floats.
  // Python writes 1.0 for float(1), but JS Number.isInteger(1) returns true
  // and pyNumberFormat writes "1". Fix by post-processing these three fields.
  let canonical = _canonicalizeValue(hashable);
  for (const field of ["evidentialWeight", "priorPosterior", "updatedPosterior"]) {
    const val = (hashable as Record<string, unknown>)[field];
    if (typeof val === "number" && Number.isInteger(val)) {
      canonical = canonical.replace(
        new RegExp(`"${field}":(-?\\d+)(?=[,}\\]])`),
        `"${field}":$1.0`
      );
    }
  }
  return sha256(canonical);
}

/**
 * Compute a hash over a canonical string.
 */
export function hashCanonical(input: string): string {
  return sha256(input);
}
