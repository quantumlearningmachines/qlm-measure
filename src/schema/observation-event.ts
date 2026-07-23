/**
 * ObservationEvent v0.1 — Public evidence-event schema.
 *
 * A deliberate subset of the internal StudentObservation.
 * This is a deliberate public subset. Fields related to internal estimation,
 * trait models, and classification logic are excluded. Integrators needing
 * additional fields use the `ext` namespace.
 *
 * Integrators needing excluded fields use the `ext` namespace.
 */

import type { ScaffoldType, EpistemicMode } from "./enums";

export interface ObservationEvent {
  /** Pseudonymous student identifier. MUST NOT contain PII. */
  studentId: string;

  /** Session identifier. */
  sessionId: string;

  /** Source system that produced this event. */
  source: string;

  /** ISO 8601 timestamp. */
  timestamp: string;

  /** Whether the student response was correct. */
  correct: boolean;

  /** Response time in milliseconds. */
  responseTimeMs: number;

  /** Domain (e.g., "math", "science", "history"). */
  domain: string;

  /** Scaffold type that preceded this response. */
  scaffoldType?: ScaffoldType | null;

  /** Misconception ID from the public ontology (if detected). */
  misconceptionId?: string | null;

  /** Classifier confidence for the misconception detection (0-1). */
  classifierConfidence?: number;

  /** Human-readable label for the detected misconception. */
  classifierLabel?: string | null;

  /** Skill ID being assessed. */
  skillId?: string | null;

  /** Score for this response (0-1). */
  score?: number;

  /** Estimated difficulty of the item (0-1). */
  difficulty?: number;

  /** Consecutive errors in the current session. */
  consecutiveErrors?: number;

  /** Error rate for the current session (0-1). */
  sessionErrorRate?: number;

  /** Explanation quality score (0-1) from teach-back or written explanation. */
  explanationQuality?: number;

  /** Whether this was a transfer problem (novel, unscaffolded). */
  isTransferProblem?: boolean;

  /** Spontaneous cross-concept connections made (count). */
  connectionsMade?: number;

  /** Epistemic mode — how the student arrived at this response. */
  epistemicMode?: EpistemicMode;

  /** Whether the student self-corrected before final submission. */
  selfCorrected?: boolean;

  /** Reserved extension namespace for integrator-specific fields. */
  ext?: Record<string, unknown>;
}
