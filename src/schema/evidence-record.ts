/**
 * Evidence Record — Public format v0.
 *
 * An append-only, hash-chained sequence of evidence entries.
 * Each entry records what happened, what the system estimated,
 * and what it decided — enabling external verification of
 * bookkeeping integrity without any estimation mathematics.
 */

import type { ObservationEvent } from "./observation-event.js";
import type { ScaffoldType, DepthLevel, EpistemicMode, TriageResult } from "./enums.js";

/**
 * A single evidence entry in the record.
 *
 * Carries the applied evidential weight and posteriors because
 * auditability is the product's promise — a tenant must be able
 * to see why their number moved.
 */
export interface EvidenceEntry {
  /** Monotonically increasing version number — primary ordering key. */
  version: number;

  /** ISO 8601 timestamp. */
  timestamp: string;

  /** The observation that generated this entry, or a redacted hash. */
  event: ObservationEvent | { redacted: true; eventHash: string };

  /** Scaffold type active when the response was elicited. */
  scaffoldType: ScaffoldType;

  /** Estimated depth level at time of response. */
  depthLevel: DepthLevel;

  /** Epistemic mode classification. */
  epistemicMode: EpistemicMode | null;

  /** Triage classification. */
  triageResult: TriageResult;

  /** The evidential weight applied to this response (as a number). */
  evidentialWeight: number;

  /** The proficiency posterior BEFORE this update. */
  priorPosterior: number;

  /** The proficiency posterior AFTER this update. */
  updatedPosterior: number;

  /** Non-intervention decision (calibrated silence). */
  nonInterventionDecision?: {
    intervened: boolean;
    confidence: number;
  };

  /** SHA-256 hash of this entry's canonical serialization. */
  entryHash: string;

  /** Hash of the previous entry (chain integrity). */
  prevHash: string;
}

/**
 * An append-only evidence record for a single student scope.
 */
export interface EvidenceRecord {
  /** Pseudonymous student scope ID. */
  studentScopeId: string;

  /** All entries, ordered by version. */
  entries: EvidenceEntry[];

  /** If the record has been compacted, info about the compaction boundary. */
  compactedBefore?: {
    /** Version number of the last compacted entry. */
    version: number;
    /** Hash summarizing the compacted entries. */
    summaryHash: string;
  };
}

/** Maximum entries retained after compaction. Public constant (bookkeeping, not estimation). */
export const COMPACTION_RETENTION = 500;
