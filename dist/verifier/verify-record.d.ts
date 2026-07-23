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
import type { EvidenceRecord } from "../schema/evidence-record";
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
/**
 * Verify the integrity of an evidence record.
 *
 * @param record The evidence record to verify.
 * @param timestampToleranceMs Maximum allowed backward timestamp drift (default: 1000ms).
 * @returns Verification result with any violations found.
 */
export declare function verifyRecord(record: EvidenceRecord, timestampToleranceMs?: number): VerificationResult;
//# sourceMappingURL=verify-record.d.ts.map