/**
 * Hash utilities for evidence record integrity.
 *
 * Uses SHA-256 via Node's crypto module (ESM import).
 * Canonical serialization ensures deterministic hashing.
 */
import type { EvidenceEntry } from "../schema/evidence-record.js";
/**
 * Canonical JSON serialization — sorted keys, no whitespace.
 * Matches Python's json.dumps(sort_keys=True, separators=(",",":"), default=str)
 * byte-for-byte, including number formatting.
 */
export declare function canonicalize(obj: unknown): string;
/**
 * Compute SHA-256 hash of a string.
 */
export declare function sha256(input: string): string;
/**
 * Compute the canonical hash of an evidence entry.
 * Every field must be explicitly null (not undefined) to match Python.
 */
export declare function hashEntry(entry: EvidenceEntry): string;
/**
 * Compute a hash over a canonical string.
 */
export declare function hashCanonical(input: string): string;
//# sourceMappingURL=hash.d.ts.map