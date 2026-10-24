/** learnlog_transform: a local export into Learnlog records, with source and capture details kept. */
import { basename } from "node:path";
import { Refusal, readLocalText } from "../files.js";
import { ANSWER_BUDGET, answerSize } from "../respond.js";
import { engine, formatStages, profileOf, sourceWarnings, unknownsOf, type TransformRun } from "../transformer.js";

export interface TransformInput {
  format: string;
  path?: string | undefined;
  use_sample?: boolean | undefined;
  tenant?: string | undefined;
  include_document?: boolean | undefined;
}

/** Runs the transformer on a local file or the format's bundled sample. Nothing is written. */
export async function runTransform(input: TransformInput): Promise<TransformRun> {
  const p = profileOf(input.format);
  if ((input.path === undefined) === (input.use_sample !== true)) throw new Refusal("Give either path or use_sample: true, not both and not neither.");
  const text = input.path === undefined ? engine.getSample(p.id) : readLocalText(input.path, "path", 2_000_000);
  try {
    return await engine.transform({ profileId: p.id, text, tenant: input.tenant ?? "local", sourceName: input.path === undefined ? p.sampleName : basename(input.path) });
  } catch (e) {
    throw new Refusal(`The transformer refused this input: ${(e as Error).message}`);
  }
}

export async function learnlogTransform(input: TransformInput): Promise<Record<string, unknown>> {
  const run = await runTransform(input);
  const s = run.profile.source;
  const first = run.records[0]!;
  const body: Record<string, unknown> = {
    format: run.profile.id,
    source: {
      file: run.sourceName,
      sha256: run.sourceHash,
      kind: run.sourceKind,
      verified_public_sample: run.sourceVerified,
      ...(run.sourceVerified ? { provenance: { citation: s.citation, license: s.license, url: s.url, revision: s.revision } } : {}),
    },
    summary: { input_rows: run.summary.inputRowCount, records: run.summary.recordCount, entries: run.summary.eventCount, unit: run.summary.unit, event_types: run.summary.eventTypes },
    help_stages: formatStages(run.profile),
    unknowns: unknownsOf(run.records),
    warnings: sourceWarnings(run.records),
    heads: run.checkpoint,
    pseudonyms: "Learner IDs are replaced with HMAC pseudonyms keyed by a random secret made when this server started. They don't match across restarts or other tools.",
    preview: { header: first.header, entries: first.entries.slice(0, 1) },
    does_not_show: [
      "Help that happened outside what the source recorded. A Learnlog record keeps what the export asserts, and nothing else.",
      "Whether the source's assertions are true. The transformer checks structure and keeps provenance; it can't check a recording against the world.",
      "Learning or the effect of help. These are records, not estimates.",
    ],
  };
  const limits = body.does_not_show;
  delete body.does_not_show;
  if (!input.include_document) return { ...body, document_note: "Set include_document: true to get the whole Learnlog document. This tool never writes it to disk.", does_not_show: limits };
  const whole = { ...body, document: run.document, does_not_show: limits };
  if (answerSize(whole) <= ANSWER_BUDGET) return whole;
  const characters = JSON.stringify(run.document, null, 2).length;
  return {
    ...body,
    document_omitted: {
      characters,
      note: `The whole Learnlog document is ${characters.toLocaleString("en-US")} characters, too large to send in one answer (the limit is ${ANSWER_BUDGET.toLocaleString("en-US")}). The summary, heads, unknowns and preview here describe it. Nothing was written to disk.`,
    },
    does_not_show: limits,
  };
}
