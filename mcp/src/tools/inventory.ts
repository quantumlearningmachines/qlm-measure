/**
 * assistance_inventory: what does this dataset actually record about help? Stage by stage, in the
 * draft's six terms, with counts by source and what the counts can't show. It reads Learnlog
 * records (made now from an export, or from a Learnlog file), or the preprint's three released
 * datasets (see preprint.ts).
 */
import { Refusal, readLocalText } from "../files.js";
import { LEARNLOG_DRAFT, NOT_RECORDED, STAGE_VERB, TRANSFORMER_EVENT_STAGE, byStage } from "../stages.js";
import { engine, type LearnlogRecord } from "../transformer.js";
import { preprintInventory, type PreprintInput } from "./preprint.js";
import { runTransform, type TransformInput } from "./transform.js";

type Obj = Record<string, unknown>;
const inc = (c: Record<string, number>, k: string) => {
  c[k] = (c[k] ?? 0) + 1;
};

export interface RecordsInput extends Partial<TransformInput> {
  learnlog_path?: string | undefined;
}

async function recordsFrom(input: RecordsInput): Promise<LearnlogRecord[]> {
  if (input.learnlog_path === undefined) return (await runTransform(input as TransformInput)).records;
  let doc: unknown;
  try {
    doc = engine.parseStrictJSON(readLocalText(input.learnlog_path, "learnlog_path", 50_000_000).replace(/^\ufeff/, ""));
  } catch (e) {
    if (e instanceof Refusal) throw e;
    throw new Refusal(`${input.learnlog_path} isn't valid JSON: ${(e as Error).message}`);
  }
  try {
    await engine.verify(doc);
  } catch (e) {
    throw new Refusal(`${input.learnlog_path} does not verify, so it isn't inventoried: ${(e as Error).message} Run learnlog_validate for details.`);
  }
  return (doc as { records: LearnlogRecord[] }).records;
}

function sourceInventory(records: LearnlogRecord[]): Obj {
  const h = records[0]!.header;
  const entries = records.flatMap((r) => r.entries);
  const data = entries.map((e) => e.event.data);
  const mode = h.import_mode as string;
  const base: Obj = { source: h.source_platform, ...(h.source_namespace ? { source_namespace: h.source_namespace } : {}), import_mode: mode, source_kind: h.source_kind, records: records.length, entries: entries.length };
  const coverage = { help_coverage: h.assistance_coverage, mapping_coverage: (h.semantic_mapping as Obj).coverage };
  if (mode === "dialogue") {
    const bySpeaker: Record<string, number> = {};
    for (const d of data) inc(bySpeaker, (d.dialogue as Obj).role as string);
    return {
      ...base,
      what_is_recorded: { unit: "dialogue turns", sessions: records.length, turns: entries.length, turns_by_speaker: bySpeaker },
      stages: byStage(() => ({ status: NOT_RECORDED, note: "This source keeps who spoke and what they said. The adapter doesn't classify any turn as help, and a Tutor turn isn't a help event." })),
      coverage,
    };
  }
  if (mode === "summary") {
    const conditions: Record<string, number> = {};
    const use: Record<string, number> = {};
    for (const d of data) {
      const ev = d.help_evidence as Obj;
      inc(conditions, ev.condition as string);
      inc(use, ev.actual_help_use as string);
    }
    return {
      ...base,
      what_is_recorded: { unit: "participant summaries", participants: entries.length, assigned_condition: conditions, actual_help_use: use },
      stages: byStage(() => ({ status: NOT_RECORDED, note: "This table gives each participant's assigned help condition. Being assigned to a condition doesn't show that help was asked for, offered or shown." })),
      coverage,
    };
  }
  const types: Record<string, number> = {};
  const capture: Record<string, number> = {};
  for (const d of data) {
    inc(types, (d.lifecycle as Obj).event_type as string);
    inc(capture, (d.assistance_context as Obj).capture as string);
  }
  const stages = byStage((stage) => {
    const type = Object.keys(TRANSFORMER_EVENT_STAGE).find((t) => TRANSFORMER_EVENT_STAGE[t] === stage);
    if (!type) return { status: NOT_RECORDED, note: "The transformer's lifecycle input has no event type for this stage, so nothing here can record it." };
    const n = types[type] ?? 0;
    if (n === 0) return { status: NOT_RECORDED, note: `No ${type} assertions in this file. Not recorded is not proof that no help was ${STAGE_VERB[stage]}: capture of this stage isn't established.` };
    return { status: "recorded", count: n, note: `${n} ${type} assertions in this file. Each is the source's assertion, and a count isn't a total unless capture of this stage was complete.` };
  });
  return {
    ...base,
    what_is_recorded: { unit: "lifecycle assertions", assertions: entries.length, event_types: types },
    stages,
    learner_response_observed: types.learner_response_observed ?? 0,
    capture_declared: capture,
    coverage,
  };
}

export const RECORD_LIMITS = [
  "An inventory isn't a help rate: there is no denominator of opportunities, time or learners.",
  "A missing record isn't proof that no help was given. Not recorded is never the same as none.",
  "Each stage is its own observation. A request doesn't show that help was generated, and a display doesn't show that it was read.",
  "Counts from different sources measure different things and can't be pooled into one number.",
];

export async function assistanceInventoryOfRecords(input: RecordsInput): Promise<Obj> {
  const records = await recordsFrom(input);
  const groups = new Map<string, LearnlogRecord[]>();
  for (const r of records) {
    const key = JSON.stringify([r.header.source_platform, r.header.source_namespace ?? null]);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return {
    kind: "learnlog_records",
    learnlog: LEARNLOG_DRAFT,
    sources: [...groups.values()].map(sourceInventory),
    cannot_conclude: RECORD_LIMITS,
    does_not_show: [
      "Help outside the recorded source: other apps, devices, people or AI tools.",
      "Whether any help worked. These are records of help, not of learning.",
      "Learner identities. Learner IDs are pseudonyms and no rows are listed.",
    ],
  };
}

export interface InventoryInput extends RecordsInput, PreprintInput {}

/** Chooses what to inventory: Learnlog records, the preprint's files, or (with nothing given) the published figures. */
export async function assistanceInventory(input: InventoryInput): Promise<Obj> {
  const records = ["format", "path", "use_sample", "learnlog_path"].some((k) => input[k as keyof InventoryInput] !== undefined);
  const preprint = ["zenodo_zip", "idetrace_json", "assistments_csv"].some((k) => input[k as keyof InventoryInput] !== undefined);
  if (records && preprint) throw new Refusal("Ask about one thing at a time: either Learnlog records (format with path or use_sample, or learnlog_path) or the preprint's files (zenodo_zip, idetrace_json, assistments_csv).");
  if (records) {
    if (input.learnlog_path === undefined && input.format === undefined) throw new Refusal("Name the export's format (see learnlog_formats), or give learnlog_path for a Learnlog file.");
    if (input.learnlog_path !== undefined && input.format !== undefined) throw new Refusal("Give either learnlog_path or format with path or use_sample, not both.");
    return assistanceInventoryOfRecords(input);
  }
  return preprintInventory(input);
}
