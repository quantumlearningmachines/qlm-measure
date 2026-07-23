/**
 * Evidence Record — Public format v0.
 *
 * An append-only, hash-chained sequence of evidence entries.
 * Each entry records what happened, what the system estimated,
 * and what it decided — enabling external verification of
 * bookkeeping integrity without any estimation mathematics.
 */
/** Maximum entries retained after compaction. Public constant (bookkeeping, not estimation). */
export const COMPACTION_RETENTION = 500;
//# sourceMappingURL=evidence-record.js.map