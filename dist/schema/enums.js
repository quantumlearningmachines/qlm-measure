/**
 * Public enum types for the open measurement vocabulary.
 *
 * These are structural labels only — no weights, thresholds, or
 * estimation parameters are included or implied.
 */
// ── Internal ↔ Public mapping (used at the EngineClient boundary) ────────
const EPISTEMIC_MAP = {
    // Internal values (mapped at the service boundary)
    direct: "experience",
    reason: "inference",
    compare: "analogy",
    told: "testimony",
    // Public names map to themselves
    experience: "experience",
    inference: "inference",
    analogy: "analogy",
    testimony: "testimony",
};
/** Map internal or public epistemic mode value to the public enum. */
export function toPublicEpistemicMode(value) {
    return EPISTEMIC_MAP[value] ?? "testimony";
}
//# sourceMappingURL=enums.js.map