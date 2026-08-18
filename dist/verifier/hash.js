/**
 * Hash utilities for evidence record integrity.
 *
 * Uses SHA-256 via Node's crypto module (ESM import).
 * Canonical serialization ensures deterministic hashing.
 */
import { createHash } from "crypto";
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
/**
 * Format a number to match Python's json.dumps output.
 *
 * Python uses the shortest decimal representation that round-trips
 * (David Gay's dtoa algorithm). JS's Number.toString() also uses dtoa
 * but sometimes produces longer representations with floating-point noise.
 *
 * We match Python by finding the shortest representation that round-trips.
 */
function pyNumberFormat(n) {
    if (Object.is(n, -0))
        return "-0.0";
    if (!Number.isFinite(n))
        return String(n);
    // Python int path
    if (Number.isInteger(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) {
        return n.toString();
    }
    // Find the shortest decimal representation that round-trips
    // This matches Python's float.__repr__ (shortest via dtoa)
    let best = JSON.stringify(n);
    // Try progressively shorter representations
    for (let prec = 17; prec >= 1; prec--) {
        const candidate = n.toPrecision(prec);
        if (parseFloat(candidate) === n) {
            best = candidate;
        }
        else {
            break; // once it stops round-tripping, shorter won't work either
        }
    }
    // Remove unnecessary trailing zeros and decimal point
    // but keep at least one digit after decimal for floats
    if (best.includes(".") && !best.includes("e") && !best.includes("E")) {
        best = best.replace(/0+$/, "");
        if (best.endsWith("."))
            best += "0"; // keep the .0 for e.g. "1.0"
    }
    // Python uses scientific notation for abs < 1e-4
    const abs = Math.abs(n);
    if (abs > 0 && abs < 1e-4) {
        // Force scientific notation matching Python
        if (!best.includes("e") && !best.includes("E")) {
            const exp = Math.floor(Math.log10(abs));
            const mantissa = n / Math.pow(10, exp);
            // Use shortest mantissa
            let mBest = String(mantissa);
            for (let p = 17; p >= 1; p--) {
                const mc = mantissa.toPrecision(p);
                if (parseFloat(mc) * Math.pow(10, exp) === n) {
                    mBest = mc;
                }
                else
                    break;
            }
            // Clean mantissa
            if (mBest.includes(".")) {
                mBest = mBest.replace(/0+$/, "").replace(/\.$/, "");
            }
            best = `${mBest}e-${String(-exp).padStart(2, "0")}`;
        }
    }
    // Fix exponent padding: e-7 → e-07, e+2 → e+02
    best = best.replace(/e([+-])(\d)$/, "e$10$2");
    return best;
}
/**
 * Format a string to match Python's json.dumps output.
 * Python escapes all non-ASCII characters to \\uXXXX by default.
 * JS JSON.stringify passes them through as UTF-8.
 */
function pyStringFormat(s) {
    let result = JSON.stringify(s);
    // Replace non-ASCII characters with \\uXXXX escapes, matching Python
    result = result.replace(/[\u0080-\uffff]/g, (ch) => {
        return "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
    });
    return result;
}
/**
 * Canonical JSON serialization — sorted keys, no whitespace.
 * Matches Python's json.dumps(sort_keys=True, separators=(",",":"), default=str)
 * byte-for-byte, including number and string formatting.
 */
export function canonicalize(obj) {
    return _canonicalizeValue(obj);
}
function _canonicalizeValue(val) {
    if (val === null)
        return "null";
    if (val === undefined)
        return "null";
    if (typeof val === "boolean")
        return val ? "true" : "false";
    if (typeof val === "number")
        return pyNumberFormat(val);
    if (typeof val === "string")
        return pyStringFormat(val);
    if (Array.isArray(val)) {
        return "[" + val.map(_canonicalizeValue).join(",") + "]";
    }
    if (typeof val === "object") {
        const keys = Object.keys(val).sort();
        const pairs = keys.map(k => {
            const v = val[k];
            return JSON.stringify(k) + ":" + _canonicalizeValue(v);
        });
        return "{" + pairs.join(",") + "}";
    }
    return JSON.stringify(val);
}
/**
 * Compute SHA-256 hash of a string.
 */
export function sha256(input) {
    return createHash("sha256").update(input).digest("hex");
}
/**
 * Compute the canonical hash of an evidence entry.
 * Every field must be explicitly null (not undefined) to match Python.
 */
export function hashEntry(entry) {
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
        const val = hashable[field];
        if (typeof val === "number" && Number.isInteger(val)) {
            canonical = canonical.replace(new RegExp(`"${field}":(-?\\d+)(?=[,}\\]])`), `"${field}":$1.0`);
        }
    }
    return sha256(canonical);
}
/**
 * Compute a hash over a canonical string.
 */
export function hashCanonical(input) {
    return sha256(input);
}
//# sourceMappingURL=hash.js.map