/**
 * Replay — reconstruct evidence state at any historical version.
 *
 * This is pure bookkeeping: it slices the entry array to version N
 * and returns the logged values. It does NOT recompute any posteriors.
 */
/**
 * Replay an evidence record to a specific version.
 *
 * Returns entries up to and including the target version.
 * The last entry's `updatedPosterior` is the posterior at that version.
 *
 * This function reconstructs state from LOGGED values only —
 * it never calls an update function, never contains estimation math.
 */
export function replayToVersion(record, targetVersion) {
    return record.entries.filter((e) => e.version <= targetVersion);
}
/**
 * Get the posterior value at a specific version.
 * Returns null if the version is not found.
 */
export function posteriorAtVersion(record, targetVersion) {
    const entries = replayToVersion(record, targetVersion);
    if (entries.length === 0)
        return null;
    return entries[entries.length - 1].updatedPosterior;
}
/**
 * Get a summary of the record up to a version.
 */
export function summarizeToVersion(record, targetVersion) {
    const entries = replayToVersion(record, targetVersion);
    const scaffoldDist = {};
    const triageDist = {};
    for (const e of entries) {
        if (e.scaffoldType)
            scaffoldDist[e.scaffoldType] = (scaffoldDist[e.scaffoldType] ?? 0) + 1;
        if (e.triageResult)
            triageDist[e.triageResult] = (triageDist[e.triageResult] ?? 0) + 1;
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
//# sourceMappingURL=replay.js.map