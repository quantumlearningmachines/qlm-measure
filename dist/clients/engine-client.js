/**
 * EngineClient — Commercial boundary for the QLM measurement engine.
 *
 * The estimation service is QLM's hosted engine. This client wraps the
 * API for submitting observations and retrieving student model state.
 *
 * Authentication is required. Contact QLM for API access.
 */
import { toPublicEpistemicMode } from "../schema/enums";
export class EngineClient {
    config;
    constructor(config) {
        this.config = config;
    }
    /**
     * Submit a student observation to the measurement engine.
     *
     * The engine runs the full measurement pipeline and returns
     * a summary of the updated state.
     */
    async updateStudentModel(observation) {
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
        return response.json();
    }
    /**
     * Retrieve the current model state for a student.
     */
    async getState(studentId) {
        const response = await fetch(`${this.config.baseUrl}/api/student-model/state?studentId=${encodeURIComponent(studentId)}`, {
            headers: {
                "Authorization": `Bearer ${this.config.apiKey}`,
            },
        });
        if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`EngineClient.getState: ${response.status} ${response.statusText} — ${body}`);
        }
        return response.json();
    }
}
//# sourceMappingURL=engine-client.js.map