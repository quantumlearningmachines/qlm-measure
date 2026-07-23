/**
 * Evidence Record Verifier
 *
 * Verifies the bookkeeping integrity of an evidence record WITHOUT
 * containing any estimation mathematics. This distinction is the design:
 * "verify instead of trust."
 *
 * What it checks:
 * - Schema validity (required fields present, correct types)
 * - Strictly monotonic version numbers
 * - Timestamp monotonicity (with configurable tolerance)
 * - Hash-chain integrity (prevHash linkage, entryHash recompute)
 * - Posterior chain consistency (each priorPosterior = previous updatedPosterior)
 * - Compaction-boundary integrity
 * - Enum validity (all enum values are from the public vocabulary)
 *
 * What it MUST NOT do (enforced by test):
 * - Never recompute a posterior
 * - Never contain an update function
 * - Never embed a weight or threshold
 * - Never import from any estimation module
 */

import type { EvidenceRecord, EvidenceEntry } from "../schema/evidence-record";
import type { ScaffoldType, DepthLevel, EpistemicMode, TriageResult } from "../schema/enums";
import { hashEntry, hashCanonical } from "./hash";

export interface Violation {
  /** Entry version where the violation was found, or 0 for record-level. */
  version: number;
  /** Category of the violation. */
  category: "schema" | "version" | "timestamp" | "hash" | "posterior" | "compaction" | "enum";
  /** Human-readable description. */
  message: string;
}

export interface VerificationResult {
  /** Whether the record passed all checks. */
  valid: boolean;
  /** List of violations found. */
  violations: Violation[];
  /** Number of entries checked. */
  entriesChecked: number;
}

const VALID_SCAFFOLD_TYPES: ScaffoldType[] = ["none", "socratic", "probing", "metacognitive", "scaffolding", "explain", "hint", "demonstrate"];
const VALID_DEPTH_LEVELS: DepthLevel[] = ["surface", "conceptual", "transfer", "integration"];
const VALID_EPISTEMIC_MODES: EpistemicMode[] = ["experience", "inference", "analogy", "testimony"];
const VALID_TRIAGE_RESULTS: TriageResult[] = ["correct", "slip", "misconception", "disengagement", "ambiguous"];

/**
 * Verify the integrity of an evidence record.
 *
 * @param record The evidence record to verify.
 * @param timestampToleranceMs Maximum allowed backward timestamp drift (default: 1000ms).
 * @returns Verification result with any violations found.
 */
export function verifyRecord(
  record: EvidenceRecord,
  timestampToleranceMs: number = 1000,
): VerificationResult {
  const violations: Violation[] = [];

  // Record-level schema checks
  if (!record.studentScopeId || typeof record.studentScopeId !== "string") {
    violations.push({ version: 0, category: "schema", message: "Missing or invalid studentScopeId" });
  }
  if (!Array.isArray(record.entries)) {
    violations.push({ version: 0, category: "schema", message: "entries must be an array" });
    return { valid: false, violations, entriesChecked: 0 };
  }

  // Compaction boundary check
  if (record.compactedBefore) {
    if (typeof record.compactedBefore.version !== "number") {
      violations.push({ version: 0, category: "compaction", message: "compactedBefore.version must be a number" });
    }
    if (typeof record.compactedBefore.summaryHash !== "string" || !record.compactedBefore.summaryHash) {
      violations.push({ version: 0, category: "compaction", message: "compactedBefore.summaryHash must be a non-empty string" });
    }
    // First entry version must be > compaction boundary
    if (record.entries.length > 0 && record.entries[0].version <= record.compactedBefore.version) {
      violations.push({
        version: record.entries[0].version,
        category: "compaction",
        message: `First entry version (${record.entries[0].version}) must be > compaction boundary (${record.compactedBefore.version})`,
      });
    }
  }

  let prevVersion = record.compactedBefore?.version ?? 0;
  let prevTimestamp = "";
  let prevHash = record.compactedBefore?.summaryHash ?? "";
  // Track last updatedPosterior per scope for posterior chain check
  let lastUpdatedPosterior: number | null = null;

  for (let i = 0; i < record.entries.length; i++) {
    const entry = record.entries[i];
    const v = entry.version ?? -1;

    // Schema validation
    if (typeof v !== "number" || v < 1) {
      violations.push({ version: v, category: "schema", message: "version must be a positive integer" });
    }
    if (typeof entry.timestamp !== "string" || !entry.timestamp) {
      violations.push({ version: v, category: "schema", message: "timestamp is required" });
    }
    if (entry.event === undefined || entry.event === null) {
      violations.push({ version: v, category: "schema", message: "event is required" });
    }
    if (typeof entry.evidentialWeight !== "number") {
      violations.push({ version: v, category: "schema", message: "evidentialWeight must be a number" });
    }
    if (typeof entry.priorPosterior !== "number") {
      violations.push({ version: v, category: "schema", message: "priorPosterior must be a number" });
    }
    if (typeof entry.updatedPosterior !== "number") {
      violations.push({ version: v, category: "schema", message: "updatedPosterior must be a number" });
    }

    // Strictly monotonic versions
    if (v <= prevVersion) {
      violations.push({
        version: v,
        category: "version",
        message: `Version ${v} is not strictly greater than previous ${prevVersion}`,
      });
    }

    // Timestamp monotonicity (with tolerance)
    if (prevTimestamp && entry.timestamp) {
      const prevMs = new Date(prevTimestamp).getTime();
      const currMs = new Date(entry.timestamp).getTime();
      if (!isNaN(prevMs) && !isNaN(currMs) && currMs < prevMs - timestampToleranceMs) {
        violations.push({
          version: v,
          category: "timestamp",
          message: `Timestamp goes backward: ${entry.timestamp} < ${prevTimestamp} (tolerance: ${timestampToleranceMs}ms)`,
        });
      }
    }

    // Enum validation
    if (entry.scaffoldType && !VALID_SCAFFOLD_TYPES.includes(entry.scaffoldType)) {
      violations.push({ version: v, category: "enum", message: `Invalid scaffoldType: ${entry.scaffoldType}` });
    }
    if (entry.depthLevel && !VALID_DEPTH_LEVELS.includes(entry.depthLevel)) {
      violations.push({ version: v, category: "enum", message: `Invalid depthLevel: ${entry.depthLevel}` });
    }
    if (entry.epistemicMode && !VALID_EPISTEMIC_MODES.includes(entry.epistemicMode)) {
      violations.push({ version: v, category: "enum", message: `Invalid epistemicMode: ${entry.epistemicMode}` });
    }
    if (entry.triageResult && !VALID_TRIAGE_RESULTS.includes(entry.triageResult)) {
      violations.push({ version: v, category: "enum", message: `Invalid triageResult: ${entry.triageResult}` });
    }

    // Hash-chain integrity
    if (entry.prevHash !== prevHash) {
      violations.push({
        version: v,
        category: "hash",
        message: `prevHash mismatch: expected "${prevHash}", got "${entry.prevHash}"`,
      });
    }
    const computedHash = hashEntry(entry);
    if (entry.entryHash !== computedHash) {
      violations.push({
        version: v,
        category: "hash",
        message: `entryHash mismatch: expected "${computedHash}", got "${entry.entryHash}"`,
      });
    }

    // Posterior chain consistency
    // Each entry's priorPosterior should equal the previous entry's updatedPosterior
    if (lastUpdatedPosterior !== null && typeof entry.priorPosterior === "number") {
      const diff = Math.abs(entry.priorPosterior - lastUpdatedPosterior);
      if (diff > 1e-9) {
        violations.push({
          version: v,
          category: "posterior",
          message: `priorPosterior (${entry.priorPosterior}) does not match previous updatedPosterior (${lastUpdatedPosterior})`,
        });
      }
    }

    prevVersion = v;
    prevTimestamp = entry.timestamp;
    prevHash = entry.entryHash;
    if (typeof entry.updatedPosterior === "number") {
      lastUpdatedPosterior = entry.updatedPosterior;
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    entriesChecked: record.entries.length,
  };
}
