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
export function replayToVersion(
  record: EvidenceRecord,
  targetVersion: number,
): EvidenceEntry[] {
  return record.entries.filter((e) => e.version <= targetVersion);
}

/**
 * Get the posterior value at a specific version.
 * Returns null if the version is not found.
 */
export function posteriorAtVersion(
  record: EvidenceRecord,
  targetVersion: number,
): number | null {
  const entries = replayToVersion(record, targetVersion);
  if (entries.length === 0) return null;
  return entries[entries.length - 1].updatedPosterior;
}

/**
 * Get a summary of the record up to a version.
 */
export function summarizeToVersion(
  record: EvidenceRecord,
  targetVersion: number,
): {
  entriesIncluded: number;
  firstVersion: number;
  lastVersion: number;
  finalPosterior: number | null;
  scaffoldDistribution: Record<string, number>;
  triageDistribution: Record<string, number>;
} {
  const entries = replayToVersion(record, targetVersion);
  const scaffoldDist: Record<string, number> = {};
  const triageDist: Record<string, number> = {};

  for (const e of entries) {
    if (e.scaffoldType) scaffoldDist[e.scaffoldType] = (scaffoldDist[e.scaffoldType] ?? 0) + 1;
    if (e.triageResult) triageDist[e.triageResult] = (triageDist[e.triageResult] ?? 0) + 1;
  }

  return {
    entriesIncluded: entries.length,
    firstVersion: entries[0]?.version ?? 0,
    lastVersion: entries[entries.length - 1]?.version ?? 0,
    finalPosterior: entries.length > 0 ? entries[entries.length - 1].updatedPosterior : null,
    scaffoldDistribution: scaffoldDist,
    triageDistribution: triageDist,
  };
}
