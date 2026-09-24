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
export type HashFn = (canonical: string) => string;
export type AsyncHashFn = (canonical: string) => Promise<string>;
export type ChainEvent = Record<string, unknown>;
export interface ChainScheme {
    /** Stable identifier, e.g. "tpc/clinical-v2". */
    id: string;
    /** Schemes in one family share storage and a link convention; detection walks the family newest-first. */
    family: string;
    /** ISO date the scheme entered production. */
    since: string;
    /** Field carrying this event's hash. */
    hashField: string;
    /** Field carrying the previous event's hash. */
    prevField: string;
    /** Value of `prevField` on the first event of a chain. */
    genesis: string;
    /** Structural precondition for trying this scheme on an event. */
    applies(event: ChainEvent): boolean;
    /** The exact string that is hashed. Never includes `hashField`. */
    canonical(event: ChainEvent): string;
    /** Schema errors for one event (not integrity errors). Empty when valid. */
    validate(event: ChainEvent): string[];
}
/** Recursively sorts object keys; arrays keep their order. Mirrors Play's residency canonicalize(). */
export declare function sortKeysDeep(value: unknown): unknown;
export declare const TPC_SIGNALS: readonly ["demonstrated", "partial", "missed_opportunity", "not_observable"];
export declare const TPC_CLINICAL_V1: ChainScheme;
/** 2026-09-10 (teachproof ac9375b): triage_class and engine_version join the hash, null when absent. */
export declare const TPC_CLINICAL_V2: ChainScheme;
/** 2026-09-14: mapping_version joins the hash on events that carry it. */
export declare const TPC_CLINICAL_V3: ChainScheme;
export declare const PLAY_CLINICAL_1_0: ChainScheme;
export declare const SCHEMES: Readonly<Record<string, ChainScheme>>;
export declare function getScheme(id: string): ChainScheme;
/** Schemes of a family, newest first — the order detection tries them in. */
export declare function familySchemes(family: string): ChainScheme[];
export declare function listSchemes(): Array<Pick<ChainScheme, "id" | "family" | "since" | "hashField" | "prevField">>;
export declare function computeEventHashWith(hash: HashFn, event: ChainEvent, schemeId: string): string;
export declare function computeEventHashAsyncWith(hash: AsyncHashFn, event: ChainEvent, schemeId: string): Promise<string>;
/** Returns a copy of `event` with the scheme's hash field set. Never mutates the input. */
export declare function sealEventWith<E extends ChainEvent>(hash: HashFn, event: E, schemeId: string): E;
/** Which scheme of `family` the event's stored hash was sealed under, or null. Tries newest first. */
export declare function detectSchemeWith(hash: HashFn, event: ChainEvent, family: string): string | null;
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
export declare function verifyChainWith(hash: HashFn, events: ChainEvent[], opts: VerifyChainOptions): ChainVerification;
//# sourceMappingURL=index.d.ts.map