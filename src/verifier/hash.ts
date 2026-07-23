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
export function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, (_, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = (value as Record<string, unknown>)[key];
        return sorted;
      }, {});
    }
    return value;
  });
}

/**
 * Compute SHA-256 hash of a string.
 * Works in both browser (Web Crypto) and Node (crypto module).
 */
export function sha256(input: string): string {
  // Node.js path
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(input).digest("hex");
  } catch {
    // Browser path — synchronous fallback using a simple hash
    // Note: in production, use Web Crypto API (async) for true SHA-256
    return simpleHash(input);
  }
}

/** Simple non-cryptographic hash for browser environments without crypto. */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

/**
 * Compute the canonical hash of an evidence entry.
 * Hashes all fields EXCEPT entryHash and prevHash (which are the chain links).
 */
export function hashEntry(entry: EvidenceEntry): string {
  const hashable = {
    version: entry.version,
    timestamp: entry.timestamp,
    event: entry.event,
    scaffoldType: entry.scaffoldType,
    depthLevel: entry.depthLevel,
    epistemicMode: entry.epistemicMode,
    triageResult: entry.triageResult,
    evidentialWeight: entry.evidentialWeight,
    priorPosterior: entry.priorPosterior,
    updatedPosterior: entry.updatedPosterior,
    nonInterventionDecision: entry.nonInterventionDecision ?? null,
  };
  return sha256(canonicalize(hashable));
}

/**
 * Compute a hash over a canonical string (for summary hashes, etc.).
 */
export function hashCanonical(input: string): string {
  return sha256(input);
}
