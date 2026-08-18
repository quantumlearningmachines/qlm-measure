/**
 * MeasurementEvent — Telemetry event for the measurement pipeline.
 *
 * Ported from the production measurement-emitter.
 */

import type { EventCategory } from "./enums.js";

export interface MeasurementEvent {
  /** Event type identifier. */
  eventType: string;

  /** Event category. */
  eventCategory: EventCategory;

  /** Session identifier. */
  sessionId?: string;

  /** Classroom identifier. */
  classroomId?: string;

  /** Domain (e.g., "math", "science"). */
  domain?: string;

  /** Topic within the domain. */
  topic?: string;

  /** Simulation mode or activity type. */
  mode?: string;

  /** Estimated difficulty (0-1). */
  difficulty?: number;

  /** Arbitrary payload for event-specific data. */
  payload?: Record<string, unknown>;

  /** Quality signal (0-1) for this event. */
  qualitySignal?: number;

  /** Confidence in this measurement (0-1). */
  confidence?: number;

  /** Duration of the measured activity in milliseconds. */
  durationMs?: number;

  /** Parent event ID for hierarchical events. */
  parentEventId?: string;
}
