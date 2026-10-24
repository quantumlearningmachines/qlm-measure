/**
 * Evidence Record Verifier
 *
 * Verifies the bookkeeping integrity of an evidence record WITHOUT
 * containing any estimation mathematics.
 *
 * verify makes no network calls. Records never leave your machine.
 */
import type { EvidenceRecord } from "../schema/evidence-record.js";
export interface Violation {
    version: number;
    category: "schema" | "version" | "timestamp" | "hash" | "posterior" | "compaction" | "enum";
    message: string;
    checkId: string;
}
export interface VerificationResult {
    valid: boolean;
    violations: Violation[];
    entriesChecked: number;
}
export declare function verifyRecord(record: EvidenceRecord, timestampToleranceMs?: number): VerificationResult;
//# sourceMappingURL=verify-record.d.ts.map