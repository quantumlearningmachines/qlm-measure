/**
 * EngineClient — Commercial boundary for the QLM measurement engine.
 *
 * The estimation service is QLM's hosted engine. This client wraps the
 * API for submitting observations and retrieving student model state.
 *
 * Authentication is required. Contact QLM for API access.
 */
import type { ObservationEvent } from "../schema/observation-event.js";
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
export declare class EngineClient {
    private readonly config;
    constructor(config: EngineClientConfig);
    /**
     * Submit a student observation to the measurement engine.
     *
     * The engine runs the full measurement pipeline and returns
     * a summary of the updated state.
     */
    updateStudentModel(observation: ObservationEvent): Promise<ModelStateSummary>;
    /**
     * Retrieve the current model state for a student.
     */
    getState(studentId: string): Promise<ModelStateSummary>;
}
//# sourceMappingURL=engine-client.d.ts.map