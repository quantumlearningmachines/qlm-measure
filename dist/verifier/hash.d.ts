/**
 * Hash utilities for evidence record integrity.
 *
 * Uses SHA-256 via the Web Crypto API (browser) or Node crypto module.
 * Canonical serialization ensures deterministic hashing.
 */
import type { EvidenceEntry } from "../schema/evidence-record";
/**
 * Canonical JSON serialization — sorted keys, no whitespace.
 * Ensures the same object always produces the same hash regardless
 * of property insertion order.
 */
export declare function canonicalize(obj: unknown): string;
/**
 * Compute SHA-256 hash of a string.
 * Works in both browser (Web Crypto) and Node (crypto module).
 */
export declare function sha256(input: string): string;
/**
 * Compute the canonical hash of an evidence entry.
 * Hashes all fields EXCEPT entryHash and prevHash (which are the chain links).
 */
export declare function hashEntry(entry: EvidenceEntry): string;
/**
 * Compute a hash over a canonical string (for summary hashes, etc.).
 */
export declare function hashCanonical(input: string): string;
//# sourceMappingURL=hash.d.ts.map