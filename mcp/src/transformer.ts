/** The vendored QLM transformer (qlm-measure demo/transformer/dist/engine.mjs), used unchanged. */
import * as engine from "../vendor/transformer/engine.mjs";
import type { LearnlogRecord, Profile, TransformRun } from "../vendor/transformer/engine.mjs";
import { Refusal } from "./files.js";
import { NOT_RECORDED, byStage, type Stage } from "./stages.js";

export { engine };
export type { LearnlogRecord, Profile, TransformRun };

/** Every adapter the engine accepts, including sandpiper, which the transformer's demo page doesn't list. */
export const FORMAT_IDS = engine.ADAPTER_PROFILES.map((p) => p.id) as [string, ...string[]];

export function profileOf(id: string): Profile {
  const p = engine.ADAPTER_PROFILES.find((x) => x.id === id);
  if (!p) throw new Refusal(`Unknown format "${id}". Use one of: ${FORMAT_IDS.join(", ")}.`);
  return p;
}

const LIFECYCLE_TYPE: Partial<Record<Stage, string>> = { requested: "help_requested", generated: "help_generated", transmitted: "help_transmitted", displayed: "help_displayed" };

/** What a format can record at each stage, before looking at any data. */
export function formatStages(p: Profile): Record<Stage, string> {
  return byStage((stage) => {
    if (p.mode === "dialogue") return `${NOT_RECORDED}: the adapter keeps who spoke and what they said; it doesn't classify any turn as help`;
    if (p.mode === "summary") return `${NOT_RECORDED}: the table gives each participant's assigned help condition, not help events`;
    if (p.mode === "annotated_dialogue") return `${NOT_RECORDED}: the export keeps who spoke and what they said; annotation codes are kept as an annotator's inferred assertions and never set a help stage`;
    const type = LIFECYCLE_TYPE[stage];
    return type ? `recorded when the export asserts it (${type})` : `${NOT_RECORDED}: the transformer's lifecycle input has no event type for this stage`;
  });
}

const words = (s: string) => s.replaceAll("_", " ");
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const CONTEXT_LABEL: Record<string, string> = { phase: "Phase", permission: "Help policy (permission)", observed_use: "Observed help use", capture: "Capture coverage", capture_boundary: "Capture boundary", product_version: "Product version", model_version: "Model version" };

/** The unknowns a set of transformer-made records keep, in plain words, counted across their entries. */
export function unknownsOf(records: unknown[]): string[] {
  const out = new Set<string>();
  const counts = new Map<string, number>();
  let entries = 0;
  const count = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const r of records) {
    if (!isObj(r) || !isObj(r.header)) continue;
    const h = r.header;
    if (typeof h.assistance_coverage === "string") out.add(`Help coverage: ${words(h.assistance_coverage)}`);
    const m = isObj(h.semantic_mapping) ? h.semantic_mapping : {};
    const cov = isObj(m.coverage) ? m.coverage : {};
    if (typeof cov.status === "string") out.add(`Coverage of the mapping: ${words(cov.status)}${typeof cov.boundary === "string" ? ` (${cov.boundary})` : ""}`);
    if (m.measurement_profile === null) out.add("No measurement profile: these records don't define a measure");
    if (m.denominator === null) out.add("No denominator: counts from these records are not rates");
    for (const e of Array.isArray(r.entries) ? r.entries : []) {
      const data = isObj(e) && isObj(e.event) && isObj(e.event.data) ? e.event.data : null;
      if (!data) continue;
      entries++;
      if (data.original_source_timestamp === null) count("Source event time not recorded");
      const utterance = isObj(data.utterance) ? data.utterance : {};
      if (utterance.start_time === null) count("Utterance start time not recorded");
      if (utterance.end_time === null) count("Utterance end time not recorded");
      const ctx = isObj(data.assistance_context) ? data.assistance_context : {};
      for (const [k, label] of Object.entries(CONTEXT_LABEL)) {
        if (ctx[k] === "unknown") count(`${label} not recorded (unknown)`);
        if (ctx[k] === null) count(`${label} not recorded`);
      }
      for (const name of Array.isArray(data.missing_metrics) ? data.missing_metrics : []) count(`Metric ${String(name)} missing`);
      const help = isObj(data.help_evidence) ? data.help_evidence.actual_help_use : undefined;
      if (typeof help === "string") count(`Actual help use ${words(help)}`);
    }
  }
  for (const [k, n] of counts) out.add(`${k} on ${n} of ${entries} entries`);
  return [...out];
}

/** Warnings about where a set of records came from. */
export function sourceWarnings(records: unknown[]): string[] {
  const out = new Set<string>();
  for (const r of records) {
    const kind = isObj(r) && isObj(r.header) ? r.header.source_kind : undefined;
    if (kind === "unverified_user_input") out.add("The source bytes don't match a pinned public sample, so where they came from is the producer's claim.");
    if (kind === "synthetic_fixture") out.add("This is a SYNTHETIC contract fixture, not learner data.");
  }
  return [...out];
}
