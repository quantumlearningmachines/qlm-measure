/**
 * Public enum types for the open measurement vocabulary.
 *
 * These are structural labels only — no weights, thresholds, or
 * estimation parameters are included or implied.
 */
/** The pedagogical move that preceded a student response. */
export type ScaffoldType = "none" | "socratic" | "probing" | "metacognitive" | "scaffolding" | "explain" | "hint" | "demonstrate";
/** How the student arrived at knowledge. */
export type EpistemicMode = "experience" | "inference" | "analogy" | "testimony";
/** Depth of understanding. */
export type DepthLevel = "surface" | "conceptual" | "transfer" | "integration";
/** Triage classification of a student response. */
export type TriageResult = "correct" | "slip" | "misconception" | "disengagement" | "ambiguous";
/** Category of a measurement event. */
export type EventCategory = "learning" | "teaching" | "assessment" | "interaction" | "system";
/** Map internal or public epistemic mode value to the public enum. */
export declare function toPublicEpistemicMode(value: string): EpistemicMode;
//# sourceMappingURL=enums.d.ts.map