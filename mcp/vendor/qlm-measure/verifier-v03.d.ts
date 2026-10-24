/**
 * Verifier for schema 0.3 records — two-level verification.
 * Evidence chain + estimate chains + record-level consent/attestation checks.
 */
export interface Violation03 {
    version: number;
    category: string;
    message: string;
    checkId: string;
    chain: string;
}
export interface VerificationResult03 {
    valid: boolean;
    level: number;
    violations: Violation03[];
    entriesChecked: number;
    estimators: Array<{
        name: string;
        version: string;
        opaque: boolean;
    }>;
}
export declare function verifyRecordV03(record: Record<string, any>, timestampToleranceMs?: number, estimateTolerance?: number): VerificationResult03;
//# sourceMappingURL=verifier-v03.d.ts.map