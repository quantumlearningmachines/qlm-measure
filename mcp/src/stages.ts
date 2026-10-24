/**
 * The six assistance observations of draft-srivastava-learnlog-03, Section 2.2. Each is its own
 * observation: one never implies the next, and a stage that wasn't captured is "not recorded".
 */
export const LEARNLOG_DRAFT = "draft-srivastava-learnlog-03 (IETF Internet-Draft, work in progress)";

export const STAGES = [
  { stage: "requested", meaning: "A learner or other identified actor asked for assistance. A request doesn't show that help was produced." },
  { stage: "offered", meaning: "The instrument recorded a system or another identified actor starting assistance, for example steps given after a wrong answer. An offer doesn't show that help was displayed." },
  { stage: "generated", meaning: "A system produced assistance content. Generation doesn't show that it was sent or displayed." },
  { stage: "transmitted", meaning: "The instrument recorded assistance being sent to a stated destination. Sending doesn't show display or use." },
  { stage: "displayed", meaning: "The instrument recorded assistance being shown in a stated interface. Display doesn't show attention, understanding or learning." },
  { stage: "accepted", meaning: "The instrument recorded the action the product defines as accepting assistance. That doesn't by itself show use, agreement or learning." },
] as const;

export type Stage = (typeof STAGES)[number]["stage"];
export const STAGE_IDS: readonly Stage[] = STAGES.map((s) => s.stage);
export const NOT_RECORDED = "not recorded";

/** The transformer's lifecycle event types, and the stage each one asserts. offered and accepted have none. */
export const TRANSFORMER_EVENT_STAGE: Readonly<Record<string, Stage>> = {
  help_requested: "requested",
  help_generated: "generated",
  help_transmitted: "transmitted",
  help_displayed: "displayed",
};

/** The past participle for "no help was ___" in a stage's note. */
export const STAGE_VERB: Readonly<Record<Stage, string>> = {
  requested: "asked for",
  offered: "offered",
  generated: "generated",
  transmitted: "sent",
  displayed: "shown",
  accepted: "accepted",
};

/** An object with one value per stage, in the draft's order. */
export function byStage<T>(value: (stage: Stage) => T): Record<Stage, T> {
  return Object.fromEntries(STAGE_IDS.map((s) => [s, value(s)])) as Record<Stage, T>;
}
