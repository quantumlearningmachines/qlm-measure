/**
 * Chain schemes — one implementation of every per-event hash chain a QLM
 * product seals.
 *
 * Products store one row per event with a hash field and a link to the
 * previous event's hash. Historically each product computed that hash with
 * its own copy of the code; when one copy changed (TeachProof, 2026-09-10:
 * 10 → 12 hashed fields) the standalone verifier did not, and every sealed
 * chain read as "tampered". This module makes each scheme a named,
 * versioned definition with a canonical serialization, so the sealer and
 * every verifier — in TypeScript or Python — hash the same bytes.
 *
 * This file is pure: no Node or browser APIs. Hashing is injected, so the
 * same code runs server-side (`./node.js`) and in a client component.
 * Python twin: `python/qlm_measure/schemes.py`. Both are checked against
 * `schema/vectors/chains/*.json`.
 */
// ── Canonical forms ───────────────────────────────────────────────────────
/** Recursively sorts object keys; arrays keep their order. Mirrors Play's residency canonicalize(). */
export function sortKeysDeep(value) {
    if (value === null || value === undefined)
        return value;
    if (Array.isArray(value))
        return value.map(sortKeysDeep);
    if (typeof value === "object") {
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = sortKeysDeep(value[key]);
        }
        return sorted;
    }
    return value;
}
// ── TeachProof clinical evidence (tpc/clinical) ───────────────────────────
// Source of truth until this module: teachproof
// src/lib/clinical/longitudinal/events/evidence-schema.ts, computeEventHash().
// Canonical form is JSON.stringify of a positional array.
export const TPC_SIGNALS = ["demonstrated", "partial", "missed_opportunity", "not_observable"];
const TPC_BASE_FIELDS = [
    "type", "learner", "encounter", "turn", "construct",
    "signal", "scaffold", "extractor", "confidence", "prev_hash",
];
function tpcArray(event, variant) {
    const arr = TPC_BASE_FIELDS.map((f) => event[f]);
    if (variant >= 2)
        arr.push(event.triage_class ?? null, event.engine_version ?? null);
    if (variant === 3)
        arr.push(event.mapping_version);
    return arr;
}
function tpcValidate(event) {
    const errors = [];
    if (event.type !== "clinical_evidence")
        errors.push(`invalid type: ${String(event.type)}`);
    if (!event.learner)
        errors.push("missing learner");
    if (!event.encounter)
        errors.push("missing encounter");
    if (typeof event.turn !== "number" || event.turn < 0)
        errors.push(`invalid turn: ${String(event.turn)}`);
    if (!event.construct)
        errors.push("missing construct");
    if (!TPC_SIGNALS.includes(event.signal))
        errors.push(`invalid signal: ${String(event.signal)}`);
    if (typeof event.scaffold !== "number" || event.scaffold < 0 || event.scaffold > 3)
        errors.push(`invalid scaffold: ${String(event.scaffold)}`);
    if (typeof event.confidence !== "number" || event.confidence < 0 || event.confidence > 1)
        errors.push(`invalid confidence: ${String(event.confidence)}`);
    return errors;
}
const tpcCommon = { family: "tpc/clinical", hashField: "hash", prevField: "prev_hash", genesis: "genesis", validate: tpcValidate };
export const TPC_CLINICAL_V1 = {
    ...tpcCommon, id: "tpc/clinical-v1", since: "2026-08-31",
    applies: () => true,
    canonical: (e) => JSON.stringify(tpcArray(e, 1)),
};
/** 2026-09-10 (teachproof ac9375b): triage_class and engine_version join the hash, null when absent. */
export const TPC_CLINICAL_V2 = {
    ...tpcCommon, id: "tpc/clinical-v2", since: "2026-09-10",
    applies: () => true,
    canonical: (e) => JSON.stringify(tpcArray(e, 2)),
};
/** 2026-09-14: mapping_version joins the hash on events that carry it. */
export const TPC_CLINICAL_V3 = {
    ...tpcCommon, id: "tpc/clinical-v3", since: "2026-09-14",
    applies: (e) => e.mapping_version !== undefined,
    canonical: (e) => JSON.stringify(tpcArray(e, 3)),
};
// ── Play clinical events, schemaVersion "clin-1.0" (play/clinical) ────────
// Source of truth until this module: qlm-games
// src/lib/residency/clinical-event-schema.ts, computeEventHash().
// Canonical form is JSON.stringify of a recursively key-sorted object of the
// ten hashed fields. Genesis prevHash is the empty string.
const PLAY_HASHED_FIELDS = [
    "eventId", "ts", "encounterId", "actor", "source", "type", "payload", "consentRef", "schemaVersion", "prevHash",
];
export const PLAY_CLINICAL_1_0 = {
    id: "play/clinical-clin-1.0", family: "play/clinical", since: "2026-08-16",
    hashField: "hash", prevField: "prevHash", genesis: "",
    applies: (e) => e.schemaVersion === "clin-1.0",
    canonical: (e) => {
        const picked = {};
        for (const f of PLAY_HASHED_FIELDS)
            picked[f] = e[f];
        return JSON.stringify(sortKeysDeep(picked));
    },
    validate: (e) => {
        const errors = [];
        if (e.schemaVersion !== "clin-1.0")
            errors.push(`invalid schemaVersion: ${String(e.schemaVersion)}`);
        for (const f of ["eventId", "ts", "encounterId", "type"]) {
            if (typeof e[f] !== "string" || !e[f])
                errors.push(`missing ${f}`);
        }
        return errors;
    },
};
// ── Registry ──────────────────────────────────────────────────────────────
const ALL = [TPC_CLINICAL_V3, TPC_CLINICAL_V2, TPC_CLINICAL_V1, PLAY_CLINICAL_1_0];
export const SCHEMES = Object.freeze(Object.fromEntries(ALL.map((s) => [s.id, s])));
export function getScheme(id) {
    const s = SCHEMES[id];
    if (!s)
        throw new Error(`unknown chain scheme: ${id} (known: ${Object.keys(SCHEMES).join(", ")})`);
    return s;
}
/** Schemes of a family, newest first — the order detection tries them in. */
export function familySchemes(family) {
    const out = ALL.filter((s) => s.family === family);
    if (out.length === 0)
        throw new Error(`unknown chain family: ${family}`);
    return out;
}
export function listSchemes() {
    return ALL.map(({ id, family, since, hashField, prevField }) => ({ id, family, since, hashField, prevField }));
}
// ── Sealing and detection ─────────────────────────────────────────────────
export function computeEventHashWith(hash, event, schemeId) {
    return hash(getScheme(schemeId).canonical(event));
}
export async function computeEventHashAsyncWith(hash, event, schemeId) {
    return hash(getScheme(schemeId).canonical(event));
}
/** Returns a copy of `event` with the scheme's hash field set. Never mutates the input. */
export function sealEventWith(hash, event, schemeId) {
    const scheme = getScheme(schemeId);
    const { [scheme.hashField]: _drop, ...rest } = event;
    void _drop;
    return { ...rest, [scheme.hashField]: hash(scheme.canonical(rest)) };
}
/** Which scheme of `family` the event's stored hash was sealed under, or null. Tries newest first. */
export function detectSchemeWith(hash, event, family) {
    for (const s of familySchemes(family)) {
        if (!s.applies(event))
            continue;
        if (event[s.hashField] === hash(s.canonical(event)))
            return s.id;
    }
    return null;
}
export function verifyChainWith(hash, events, opts) {
    if (!opts.scheme && !opts.family)
        throw new Error("verifyChain: pass { family } or { scheme }");
    const candidates = opts.scheme ? [getScheme(opts.scheme)] : familySchemes(opts.family);
    const { hashField, prevField, genesis } = candidates[0];
    const rejectMixed = opts.rejectMixed ?? true;
    const errors = [];
    const seen = new Set();
    const perScheme = {};
    let gaps = 0, duplicates = 0, tampered = 0, schemaErrors = 0;
    events.forEach((e, i) => {
        let matched = null;
        for (const s of candidates) {
            if (!s.applies(e))
                continue;
            if (e[hashField] === hash(s.canonical(e))) {
                matched = s;
                break;
            }
        }
        // Schema errors are reported under the matched scheme, or the family's newest applicable one.
        const schemeForSchema = matched ?? candidates.find((s) => s.applies(e)) ?? candidates[candidates.length - 1];
        for (const err of schemeForSchema.validate(e)) {
            errors.push(`[${i}] ${err}`);
            schemaErrors++;
        }
        if (matched)
            perScheme[matched.id] = (perScheme[matched.id] ?? 0) + 1;
        else {
            errors.push(`[${i}] hash mismatch (tampered)`);
            tampered++;
        }
        const h = e[hashField];
        if (i === 0) {
            if (e[prevField] !== genesis) {
                errors.push(`[${i}] first event ${prevField} must be ${JSON.stringify(genesis)}`);
                gaps++;
            }
        }
        else if (e[prevField] !== events[i - 1][hashField]) {
            errors.push(`[${i}] chain gap`);
            gaps++;
        }
        if (typeof h === "string") {
            if (seen.has(h)) {
                errors.push(`[${i}] duplicate hash`);
                duplicates++;
            }
            seen.add(h);
        }
    });
    const ids = Object.keys(perScheme);
    const hashScheme = ids.length === 0 ? "none" : ids.length === 1 ? ids[0] : "mixed";
    if (ids.length > 1 && rejectMixed) {
        errors.push(`mixed hash schemes: ${ids.map((id) => `${perScheme[id]} ${id}`).join(", ")}`);
    }
    return {
        clean: errors.length === 0,
        errors,
        stats: { total: events.length, gaps, duplicates, tampered, schema_errors: schemaErrors, hash_scheme: hashScheme, schemes: perScheme },
    };
}
//# sourceMappingURL=index.js.map