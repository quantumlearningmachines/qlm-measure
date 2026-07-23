/**
 * Replay — reconstruct evidence state at any historical version.
 *
 * This is pure bookkeeping: it slices the entry array to version N
 * and returns the logged values. It does NOT recompute any posteriors.
 */
import type { EvidenceRecord, EvidenceEntry } from "../schema/evidence-record";
/**
 * Replay an evidence record to a specific version.
 *
 * Returns entries up to and including the target version.
 * The last entry's `updatedPosterior` is the posterior at that version.
 *
 * This function reconstructs state from LOGGED values only —
 * it never calls an update function, never contains estimation math.
 */
export declare function replayToVersion(record: EvidenceRecord, targetVersion: number): EvidenceEntry[];
/**
 * Get the posterior value at a specific version.
 * Returns null if the version is not found.
 */
export declare function posteriorAtVersion(record: EvidenceRecord, targetVersion: number): number | null;
/**
 * Get a summary of the record up to a version.
 */
export declare function summarizeToVersion(record: EvidenceRecord, targetVersion: number): {
    entriesIncluded: number;
    firstVersion: number;
    lastVersion: number;
    finalPosterior: number | null;
    scaffoldDistribution: Record<string, number>;
    triageDistribution: Record<string, number>;
};
//# sourceMappingURL=replay.d.ts.map