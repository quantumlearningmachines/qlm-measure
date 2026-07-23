/**
 * Public enum types for the open measurement vocabulary.
 *
 * These are structural labels only — no weights, thresholds, or
 * estimation parameters are included or implied.
 */

/** The pedagogical move that preceded a student response. */
export type ScaffoldType =
  | "none"            // Unprompted response
  | "socratic"        // Open Socratic question
  | "probing"         // Probing assumption
  | "metacognitive"   // "What strategy are you using?"
  | "scaffolding"     // Broke problem into parts
  | "explain"         // Direct explanation given
  | "hint"            // Explicit hint
  | "demonstrate";    // Worked example shown

/** How the student arrived at knowledge. */
export type EpistemicMode =
  | "experience"      // Direct perception (simulation, experiment)
  | "inference"       // Reasoned from premises
  | "analogy"         // Understood by comparison to known domain
  | "testimony";      // Told by teacher/text

/** Depth of understanding. */
export type DepthLevel =
  | "surface"         // Can recall or identify
  | "conceptual"      // Can explain why
  | "transfer"        // Can apply to novel context
  | "integration";    // Can connect across domains

/** Triage classification of a student response. */
export type TriageResult =
  | "correct"
  | "slip"            // Incorrect but not a misconception
  | "misconception"   // Systematic error pattern
  | "disengagement"   // Rushing, checked out, or gaming
  | "ambiguous";      // Insufficient info to classify

/** Category of a measurement event. */
export type EventCategory =
  | "learning"
  | "teaching"
  | "assessment"
  | "interaction"
  | "system";

// ── Internal ↔ Public mapping (used at the EngineClient boundary) ────────

const EPISTEMIC_MAP: Record<string, EpistemicMode> = {
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
export function toPublicEpistemicMode(value: string): EpistemicMode {
  return EPISTEMIC_MAP[value] ?? "testimony";
}
