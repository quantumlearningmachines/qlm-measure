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

import { PRODUCT_SCHEMES } from "./products.js";

export type HashFn = (canonical: string) => string;
export type AsyncHashFn = (canonical: string) => Promise<string>;

export type ChainEvent = Record<string, unknown>;

export type Digest = "sha256" | "fnv1a64" | "djb2-32";

export interface ChainScheme {
  /** Stable identifier, e.g. "tpc/clinical-v2". */
  id: string;
  /** Schemes in one family share storage and a link convention; detection walks the family newest-first. */
  family: string;
  /** ISO date the scheme entered production. */
  since: string;
  /** Field carrying this event's hash. */
  hashField: string;
  /**
   * Field carrying the previous event's hash, or null when the record stores no
   * link field. With `link: "implicit"` the previous hash still enters the
   * canonical form (threaded from the previous record); with `link: "none"`
   * the scheme is a content hash and records are independent.
   */
  prevField: string | null;
  /** Value of `prevField` on the first event; null means absent/null is the genesis. */
  genesis: string | null;
  /** How records bind to their predecessor. Default: "explicit" when prevField is set, else "none". */
  link?: "explicit" | "implicit" | "none";
  /** Digest over the canonical string. Default sha256 (injected); the others are built in. */
  digest?: Digest;
  /** Keep only the first N hex characters of the digest (play/measure-session stores 32). */
  truncate?: number;
  /** Structural precondition for trying this scheme on an event. */
  applies(event: ChainEvent): boolean;
  /**
   * The exact string that is hashed. Never includes `hashField`. `prev` is the
   * previous record's stored hash (the genesis value for the first record);
   * schemes with an explicit link normally read the event's own field instead.
   */
  canonical(event: ChainEvent, prev?: string): string;
  /** Schema errors for one event (not integrity errors). Empty when valid. */
  validate(event: ChainEvent): string[];
  /** Scheme ids that may appear in the same chain as this one without the chain counting as mixed. */
  coexists?: string[];
}

export function linkOf(s: ChainScheme): "explicit" | "implicit" | "none" {
  return s.link ?? (s.prevField ? "explicit" : "none");
}

// ── Built-in non-cryptographic digests (products that sealed with them) ───

/** UTF-16 code units, as JavaScript's charCodeAt yields them. */
function utf16Units(str: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i));
  return out;
}

/** FNV-1a 64-bit over UTF-16 code units, 16 hex chars (qlm-games snapshot-commit hashSnapshotSync). */
export function fnv1a64Hex(str: string): string {
  let h = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  for (const c of utf16Units(str)) {
    h ^= BigInt(c);
    h = BigInt.asUintN(64, h * prime);
  }
  return h.toString(16).padStart(16, "0");
}

/** djb2, 32-bit wrap, unsigned hex padded to 8 (q-core evidence-chain hashString). */
export function djb2Hex(str: string): string {
  let hash = 5381;
  for (const c of utf16Units(str)) hash = ((hash << 5) + hash + c) | 0;
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The digest a scheme seals with: built in for fnv/djb2, the injected function for sha256. */
export function digestFor(scheme: ChainScheme, sha256: HashFn): HashFn {
  const base = scheme.digest === "fnv1a64" ? fnv1a64Hex : scheme.digest === "djb2-32" ? djb2Hex : sha256;
  return scheme.truncate ? (c) => base(c).slice(0, scheme.truncate) : base;
}

// ── Canonical forms ───────────────────────────────────────────────────────

/** Recursively sorts object keys; arrays keep their order. Mirrors Play's residency canonicalize(). */
export function sortKeysDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

// ── TeachProof clinical evidence (tpc/clinical) ───────────────────────────
// Source of truth until this module: teachproof
// src/lib/clinical/longitudinal/events/evidence-schema.ts, computeEventHash().
// Canonical form is JSON.stringify of a positional array.

export const TPC_SIGNALS = ["demonstrated", "partial", "missed_opportunity", "not_observable"] as const;

const TPC_BASE_FIELDS = [
  "type", "learner", "encounter", "turn", "construct",
  "signal", "scaffold", "extractor", "confidence", "prev_hash",
] as const;

function tpcArray(event: ChainEvent, variant: 1 | 2 | 3 | 4): unknown[] {
  const arr: unknown[] = TPC_BASE_FIELDS.map((f) => event[f]);
  if (variant >= 2) arr.push(event.triage_class ?? null, event.engine_version ?? null);
  if (variant === 3) arr.push(event.mapping_version);
  if (variant === 4) arr.push(event.mapping_version ?? null, event.event_kind, sortKeysDeep(event.payload ?? {}));
  return arr;
}

/** A schema 0.4 event: one with event_kind. Only tpc/clinical-v4 seals it, so its payload is always covered. */
const hasEventKind = (e: ChainEvent): boolean => e.event_kind !== undefined;
/** Commit/skip events share the clinical chain but have their own scheme (tpc/differential-commit-1). */
const isCommitEvent = (e: ChainEvent): boolean => e.type === "differential_commit" || e.type === "commit_skipped";

function tpcValidate(event: ChainEvent): string[] {
  const errors: string[] = [];
  if (event.type !== "clinical_evidence") errors.push(`invalid type: ${String(event.type)}`);
  if (!event.learner) errors.push("missing learner");
  if (!event.encounter) errors.push("missing encounter");
  if (typeof event.turn !== "number" || event.turn < 0) errors.push(`invalid turn: ${String(event.turn)}`);
  if (!event.construct) errors.push("missing construct");
  if (!(TPC_SIGNALS as readonly string[]).includes(event.signal as string)) errors.push(`invalid signal: ${String(event.signal)}`);
  if (typeof event.scaffold !== "number" || event.scaffold < 0 || event.scaffold > 3) errors.push(`invalid scaffold: ${String(event.scaffold)}`);
  if (typeof event.confidence !== "number" || event.confidence < 0 || event.confidence > 1) errors.push(`invalid confidence: ${String(event.confidence)}`);
  return errors;
}

const tpcCommon = { family: "tpc/clinical", hashField: "hash", prevField: "prev_hash", genesis: "genesis", validate: tpcValidate };

export const TPC_CLINICAL_V1: ChainScheme = {
  ...tpcCommon, id: "tpc/clinical-v1", since: "2026-08-31",
  applies: (e) => !hasEventKind(e) && !isCommitEvent(e),
  canonical: (e) => JSON.stringify(tpcArray(e, 1)),
};

/** 2026-09-10 (teachproof ac9375b): triage_class and engine_version join the hash, null when absent. */
export const TPC_CLINICAL_V2: ChainScheme = {
  ...tpcCommon, id: "tpc/clinical-v2", since: "2026-09-10",
  applies: (e) => !hasEventKind(e) && !isCommitEvent(e),
  canonical: (e) => JSON.stringify(tpcArray(e, 2)),
};

/** 2026-09-14: mapping_version joins the hash on events that carry it. */
export const TPC_CLINICAL_V3: ChainScheme = {
  ...tpcCommon, id: "tpc/clinical-v3", since: "2026-09-14",
  applies: (e) => e.mapping_version !== undefined && !hasEventKind(e) && !isCommitEvent(e),
  canonical: (e) => JSON.stringify(tpcArray(e, 3)),
  coexists: ["tpc/clinical-v4"],
};

const TPC_EVENT_KIND = /^[a-z]+\.[a-z_]+$/;

/**
 * 2026-09-25 (teachproof schema 0.4, TPC-SPEC-002 A6): an event may carry
 * event_kind ("chart.view", "chart.item", ...) and a per-kind payload. Both
 * join the hash: the v3 fields (mapping_version null when absent), then
 * event_kind, then the payload with its keys sorted at every depth. Only
 * events with event_kind use it; the rest of the chain stays v3.
 */
export const TPC_CLINICAL_V4: ChainScheme = {
  ...tpcCommon, id: "tpc/clinical-v4", since: "2026-09-25",
  applies: (e) => hasEventKind(e) && !isCommitEvent(e),
  canonical: (e) => JSON.stringify(tpcArray(e, 4)),
  validate: (e) => {
    const errors = tpcValidate(e);
    if (typeof e.event_kind !== "string" || !TPC_EVENT_KIND.test(e.event_kind)) errors.push(`invalid event_kind: ${String(e.event_kind)}`);
    if (!e.payload || typeof e.payload !== "object" || Array.isArray(e.payload)) errors.push("payload must be an object");
    return errors;
  },
  coexists: ["tpc/clinical-v3"],
};

// ── Play clinical events, schemaVersion "clin-1.0" (play/clinical) ────────
// Source of truth until this module: qlm-games
// src/lib/residency/clinical-event-schema.ts, computeEventHash().
// Canonical form is JSON.stringify of a recursively key-sorted object of the
// ten hashed fields. Genesis prevHash is the empty string.

const PLAY_HASHED_FIELDS = [
  "eventId", "ts", "encounterId", "actor", "source", "type", "payload", "consentRef", "schemaVersion", "prevHash",
] as const;

export const PLAY_CLINICAL_1_0: ChainScheme = {
  id: "play/clinical-clin-1.0", family: "play/clinical", since: "2026-08-16",
  hashField: "hash", prevField: "prevHash", genesis: "",
  applies: (e) => e.schemaVersion === "clin-1.0",
  canonical: (e) => {
    const picked: Record<string, unknown> = {};
    for (const f of PLAY_HASHED_FIELDS) picked[f] = e[f];
    return JSON.stringify(sortKeysDeep(picked));
  },
  validate: (e) => {
    const errors: string[] = [];
    if (e.schemaVersion !== "clin-1.0") errors.push(`invalid schemaVersion: ${String(e.schemaVersion)}`);
    for (const f of ["eventId", "ts", "encounterId", "type"] as const) {
      if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    }
    return errors;
  },
};

// ── Registry ──────────────────────────────────────────────────────────────

const ALL: ChainScheme[] = [TPC_CLINICAL_V4, TPC_CLINICAL_V3, TPC_CLINICAL_V2, TPC_CLINICAL_V1, PLAY_CLINICAL_1_0, ...PRODUCT_SCHEMES];

export const SCHEMES: Readonly<Record<string, ChainScheme>> = Object.freeze(
  Object.fromEntries(ALL.map((s) => [s.id, s])),
);

export function getScheme(id: string): ChainScheme {
  const s = SCHEMES[id];
  if (!s) throw new Error(`unknown chain scheme: ${id} (known: ${Object.keys(SCHEMES).join(", ")})`);
  return s;
}

/** Schemes of a family, newest first — the order detection tries them in. */
export function familySchemes(family: string): ChainScheme[] {
  const out = ALL.filter((s) => s.family === family);
  if (out.length === 0) throw new Error(`unknown chain family: ${family}`);
  return out;
}

export function listSchemes(): Array<Pick<ChainScheme, "id" | "family" | "since" | "hashField" | "prevField"> & { link: string; digest: Digest }> {
  return ALL.map((s) => ({ id: s.id, family: s.family, since: s.since, hashField: s.hashField, prevField: s.prevField, link: linkOf(s), digest: s.digest ?? "sha256" }));
}

// ── Sealing and detection ─────────────────────────────────────────────────

export function computeEventHashWith(hash: HashFn, event: ChainEvent, schemeId: string, prev?: string): string {
  const scheme = getScheme(schemeId);
  return digestFor(scheme, hash)(scheme.canonical(event, prev));
}

export async function computeEventHashAsyncWith(hash: AsyncHashFn, event: ChainEvent, schemeId: string, prev?: string): Promise<string> {
  const scheme = getScheme(schemeId);
  if (scheme.digest && scheme.digest !== "sha256") return digestFor(scheme, () => "")(scheme.canonical(event, prev));
  const full = await hash(scheme.canonical(event, prev));
  return scheme.truncate ? full.slice(0, scheme.truncate) : full;
}

/**
 * Returns a copy of `event` with the scheme's hash field set. Never mutates the
 * input. `prev` is required for implicit-link schemes (the previous record's
 * hash, or the genesis value for the first record).
 */
export function sealEventWith<E extends ChainEvent>(hash: HashFn, event: E, schemeId: string, prev?: string): E {
  const scheme = getScheme(schemeId);
  if (linkOf(scheme) === "implicit" && prev === undefined) throw new Error(`${schemeId}: prev is required (implicit link)`);
  const { [scheme.hashField]: _drop, ...rest } = event as Record<string, unknown>;
  void _drop;
  return { ...(rest as E), [scheme.hashField]: digestFor(scheme, hash)(scheme.canonical(rest, prev)) };
}

/** Which scheme of `family` the event's stored hash was sealed under, or null. Tries newest first. */
export function detectSchemeWith(hash: HashFn, event: ChainEvent, family: string, prev?: string): string | null {
  for (const s of familySchemes(family)) {
    if (!s.applies(event)) continue;
    if (event[s.hashField] === digestFor(s, hash)(s.canonical(event, prev))) return s.id;
  }
  return null;
}

// ── Chain verification ────────────────────────────────────────────────────

export interface ChainVerification {
  clean: boolean;
  errors: string[];
  stats: {
    total: number;
    gaps: number;
    duplicates: number;
    tampered: number;
    schema_errors: number;
    /** Scheme id when the whole chain is sealed under one scheme; "mixed"; or "none" for an empty chain. */
    hash_scheme: string;
    /** Events per detected scheme id. */
    schemes: Record<string, number>;
  };
}

export interface VerifyChainOptions {
  /** Detect the scheme per event within this family (default when `scheme` is not given). */
  family?: string;
  /** Require exactly this scheme for every event. */
  scheme?: string;
  /** Treat a chain that mixes schemes as an error (default true). */
  rejectMixed?: boolean;
}

const isAbsent = (v: unknown): boolean => v === undefined || v === null;

export function verifyChainWith(hash: HashFn, events: ChainEvent[], opts: VerifyChainOptions): ChainVerification {
  if (!opts.scheme && !opts.family) throw new Error("verifyChain: pass { family } or { scheme }");
  const candidates = opts.scheme ? [getScheme(opts.scheme)] : familySchemes(opts.family!);
  const { hashField, prevField, genesis } = candidates[0];
  const link = linkOf(candidates[0]);
  const rejectMixed = opts.rejectMixed ?? true;

  const errors: string[] = [];
  const seen = new Set<string>();
  const perScheme: Record<string, number> = {};
  let gaps = 0, duplicates = 0, tampered = 0, schemaErrors = 0;

  events.forEach((e, i) => {
    // The previous record's stored hash, threaded for implicit-link schemes.
    const prev = i === 0 ? (genesis ?? "") : String(events[i - 1][hashField] ?? "");
    let matched: ChainScheme | null = null;
    for (const s of candidates) {
      if (!s.applies(e)) continue;
      if (e[hashField] === digestFor(s, hash)(s.canonical(e, prev))) { matched = s; break; }
    }
    // Schema errors are reported under the matched scheme, or the family's newest applicable one.
    const schemeForSchema = matched ?? candidates.find((s) => s.applies(e)) ?? candidates[candidates.length - 1];
    for (const err of schemeForSchema.validate(e)) { errors.push(`[${i}] ${err}`); schemaErrors++; }

    if (matched) perScheme[matched.id] = (perScheme[matched.id] ?? 0) + 1;
    else { errors.push(`[${i}] hash mismatch (tampered)`); tampered++; }

    const h = e[hashField];
    if (link === "explicit" && prevField) {
      if (i === 0) {
        const ok = genesis === null ? isAbsent(e[prevField]) : e[prevField] === genesis;
        if (!ok) { errors.push(`[${i}] first event ${prevField} must be ${genesis === null ? "absent" : JSON.stringify(genesis)}`); gaps++; }
      } else if (e[prevField] !== events[i - 1][hashField]) { errors.push(`[${i}] chain gap`); gaps++; }
    }
    if (typeof h === "string") {
      if (seen.has(h)) { errors.push(`[${i}] duplicate hash`); duplicates++; }
      seen.add(h);
    }
  });

  const ids = Object.keys(perScheme);
  // Schemes that declare they coexist do not make a chain mixed; the chain
  // reports the newest of them (family order is newest first).
  const coexist = (a: string, b: string): boolean =>
    (getScheme(a).coexists ?? []).includes(b) || (getScheme(b).coexists ?? []).includes(a);
  const mixed = ids.some((a, i) => ids.slice(i + 1).some((b) => !coexist(a, b)));
  const newest = candidates.find((s) => ids.includes(s.id))?.id;
  const hashScheme = ids.length === 0 ? "none" : !mixed ? (ids.length === 1 ? ids[0] : newest!) : "mixed";
  if (mixed && rejectMixed) {
    errors.push(`mixed hash schemes: ${ids.map((id) => `${perScheme[id]} ${id}`).join(", ")}`);
  }

  return {
    clean: errors.length === 0,
    errors,
    stats: { total: events.length, gaps, duplicates, tampered, schema_errors: schemaErrors, hash_scheme: hashScheme, schemes: perScheme },
  };
}
