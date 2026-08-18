/**
 * EngineClient — Commercial boundary for the QLM measurement engine.
 *
 * The estimation service is QLM's hosted engine. This client wraps the
 * API for submitting observations and retrieving student model state.
 *
 * Authentication is required. Contact QLM for API access.
 */

import type { ObservationEvent } from "../schema/observation-event.js";
import { toPublicEpistemicMode } from "../schema/enums.js";

export interface EngineClientConfig {
  /** Base URL of the QLM measurement service. */
  baseUrl: string;
  /** API key for authentication. */
  apiKey: string;
}

export interface ModelStateSummary {
  studentId: string;
  totalSessions: number;
  totalEvidenceEvents: number;
  lastSessionAt: string | null;
  /** Top misconceptions with posterior > 0.3 */
  activeMisconceptions: Array<{
    id: string;
    posterior: number;
    persistence: string;
    detections: number;
  }>;
  /** Triage summary */
  triage: {
    correct: number;
    slips: number;
    misconceptions: number;
    disengagements: number;
  };
}

export class EngineClient {
  private readonly config: EngineClientConfig;

  constructor(config: EngineClientConfig) {
    this.config = config;
  }

  /**
   * Submit a student observation to the measurement engine.
   *
   * The engine runs the full measurement pipeline and returns
   * a summary of the updated state.
   */
  async updateStudentModel(observation: ObservationEvent): Promise<ModelStateSummary> {
    // Map public epistemic mode to internal at the boundary
    const mapped = {
      ...observation,
      epistemicMode: observation.epistemicMode
        ? toPublicEpistemicMode(observation.epistemicMode)
        : undefined,
    };

    const response = await fetch(`${this.config.baseUrl}/api/student-model/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(mapped),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`EngineClient.updateStudentModel: ${response.status} ${response.statusText} — ${body}`);
    }

    return response.json() as Promise<ModelStateSummary>;
  }

  /**
   * Retrieve the current model state for a student.
   */
  async getState(studentId: string): Promise<ModelStateSummary> {
    const response = await fetch(
      `${this.config.baseUrl}/api/student-model/state?studentId=${encodeURIComponent(studentId)}`,
      {
        headers: {
          "Authorization": `Bearer ${this.config.apiKey}`,
        },
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`EngineClient.getState: ${response.status} ${response.statusText} — ${body}`);
    }

    return response.json() as Promise<ModelStateSummary>;
  }
}
