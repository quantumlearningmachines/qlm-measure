/**
 * The three released datasets of the Learnlog preprint (v0.6), "Preserving assistance meaning in
 * cross-source learning analytics". Their learner records are not bundled: the tool reads the
 * user's own copies, recomputes the preprint's counts with the published rules (episodes.ts), and,
 * when a file is the exact release the preprint pinned, compares every number with the published
 * aggregate outputs bundled in data/preprint and vendor/transformer.
 */
import tableTwo from "../../vendor/transformer/cross-source-analysis-data.mjs";
import { analyzeAssistments, analyzeIdetrace, analyzeZenodo, crossSourceEpisodes, type IdetraceAnalysis, type ZenodoAnalysis } from "../episodes.js";
import { Refusal, localFile, readLocalBytes } from "../files.js";
import { VENDORED_FROM, readJsonFile } from "../package.js";
import { LEARNLOG_DRAFT, NOT_RECORDED } from "../stages.js";

type Obj = Record<string, unknown>;

export const PINNED = {
  zenodo: "5527127f0a3c939601b17ef207ef8b34df7cad9159c9617f879efbf4e989d499",
  idetrace: "09972201c16a9f6def7d1e25a9b9e6827994601d720a37696afb0927168befc8",
  assistments: "1d06aee9e649c5ba9db49052fe9a86e68d0c3ccb4709a7487289d7721f5464db",
};

export const PREPRINT_DATASETS = [
  {
    id: "zenodo.17551130",
    argument: "zenodo_zip",
    name: "JetBrains Academy next-step hint study (Zenodo 17551130 v1)",
    records: "Hint requests, errors and displays inside 1,050 HTML scenario reports, plus a raw IDE activity file that isn't linked to them",
    license: "CC BY 4.0",
    bundled: false,
    why_not_bundled: "QLM's releases carry only aggregate counts from this dataset, never its learner records (THIRD_PARTY_DATA.md).",
    get_it: "https://zenodo.org/records/17551130 (ai_hints_interaction.zip)",
    pinned_sha256: PINNED.zenodo,
  },
  {
    id: "tutortrace.deployment8",
    argument: "idetrace_json",
    name: "TutorTrace / IDETrace, deployment 8",
    records: "Chat queries and responses, code edits and test results in an instrumented programming environment",
    license: "CC BY 4.0, as declared in its pinned Croissant metadata (GitHub reports no repository license)",
    bundled: false,
    why_not_bundled: "No permission to redistribute the raw payload is inferred. Reading it here needs allow_idetrace_research: true, the same opt-in the preprint's pipeline asks for.",
    get_it: "https://github.com/divadbaroon/TutorTrace_dataset_and_benchmark/tree/bc7990370da18a611a122255ebc3e475bd8a3fc6 (dataset/raw_telemetry/deployment_8.json)",
    pinned_sha256: PINNED.idetrace,
  },
  {
    id: "assistments.2012-13",
    argument: "assistments_csv",
    name: "ASSISTments 2012-13 School Data with Affect",
    records: "One row per problem: hints asked, whether the last hint was reached, the first action, scaffolding, and four affect detector confidences",
    license: "ASSISTments terms of use",
    bundled: false,
    why_not_bundled: "The data were provided by the ASSISTments TestBed (WPI) and are not redistributed. Get them from ASSISTments under its terms of use.",
    get_it: "https://sites.google.com/site/assistmentsdata/datasets/2012-13-school-data-with-affect",
    pinned_sha256: PINNED.assistments,
  },
];

export interface Published {
  tableTwo: Obj;
  crossSource: Obj;
  assistments: Obj;
}

export const PUBLISHED: Published = {
  tableTwo,
  crossSource: readJsonFile("data/preprint/cross_source_episodes.json") as Obj,
  assistments: readJsonFile("data/preprint/assistments_episodes.json") as Obj,
};

// ── comparison with the published numbers ────────────────────────────────

export interface Comparison {
  numbers_compared: number;
  matches: boolean;
  mismatches: { path: string; published: unknown; recomputed: unknown }[];
}

/** Every leaf of the published value against the recomputed value at the same path, both ways. */
export function compare(published: unknown, recomputed: unknown): Comparison {
  const mismatches: Comparison["mismatches"] = [];
  let n = 0;
  const walk = (p: unknown, r: unknown, path: string) => {
    if (typeof p === "object" && p !== null && typeof r === "object" && r !== null && Array.isArray(p) === Array.isArray(r)) {
      const keys = new Set([...Object.keys(p), ...Object.keys(r)]);
      for (const k of keys) walk((p as Obj)[k], (r as Obj)[k], Array.isArray(p) ? `${path}[${k}]` : `${path}.${k}`);
      return;
    }
    n++;
    if (p !== r) mismatches.push({ path, published: p ?? null, recomputed: r ?? null });
  };
  walk(published, recomputed, "$");
  return { numbers_compared: n, matches: mismatches.length === 0, mismatches };
}

const pick = (o: Obj, keys: string[]): Obj => Object.fromEntries(keys.map((k) => [k, o[k]]));
const sourceRow = (p: Published, id: string) => ((p.tableTwo.sources as Obj[]).find((s) => s.source_id === id) as Obj);

// ── what each release records, in the draft's six stages ─────────────────

type View = Record<string, Obj | string>;
const n = (x: unknown) => x as number;

export function zenodoStages(inv: Obj, ep: Obj): View {
  const labels = inv.native_log_label_counts as Record<string, number>;
  const outcomes = ep.outcomes as Record<string, number>;
  return {
    requested: { status: "recorded", count: n(ep.requests), note: "Get Hint and Retry clicks (Table 2 inventory rule). Each report holds one." },
    offered: NOT_RECORDED,
    generated: { status: "not mapped", native_rows: pick(labels, ["Code hint generated", "Text hint generated"]), note: "The release logs generation rows, but the preprint's rules don't link them to requests, so no count is given for this stage." },
    transmitted: NOT_RECORDED,
    displayed: { status: "recorded by the episode rule", count: n(ep.shown), of_requests: n(ep.requests), not_displayed: n(ep.not_shown), not_displayed_with_error: outcomes.not_shown_error ?? 0, note: "A banner shown, or the code hint revealed or accepted, after the request. Links between stages come from the rule; the source declares none." },
    accepted: { status: "recorded by the episode rule", count: outcomes.shown_acted_accepted ?? 0, revealed_only: outcomes.shown_acted_revealed_not_accepted ?? 0, note: "The product's 'Code hint is accepted' action. Accepting doesn't show use or learning." },
    never_asked: "not in the release: it contains only request episodes, so going without help can't be counted here",
  };
}

export function idetraceStages(ep: Obj): View {
  return {
    requested: { status: "recorded", count: n(ep.requests), note: "CHAT_QUERY events (Table 2 inventory rule)." },
    offered: NOT_RECORDED,
    generated: { status: "not mapped", note: "The release logs CHAT_RESPONSE events; the episode rule reads a response as a display, not as its own generated stage." },
    transmitted: NOT_RECORDED,
    displayed: { status: "recorded by the episode rule", count: n(ep.shown), of_requests: n(ep.requests), note: "No separate display event exists: a response before the next query is counted as a display. A reply that was itself an error would still count." },
    accepted: NOT_RECORDED,
    never_asked: { records: n(ep.records), records_never_asked: n(ep.records_never_asked), note: "Learner records, which may not be people: the source's population descriptions conflict." },
  };
}

export function assistmentsStages(a: Obj): View {
  const ep = a.episodes as Record<string, number>;
  const hints = (ep["requested; hints short of the answer"] ?? 0) + (ep["requested; hints to the answer (bottom-out)"] ?? 0);
  const steps = ep["requested; asked for steps (scaffolding)"] ?? 0;
  const checks = a.checks as Record<string, number>;
  return {
    requested: { status: "recorded", count: hints + steps, with_hints: hints, asked_for_steps: steps, hints_to_the_answer: ep["requested; hints to the answer (bottom-out)"] ?? 0, note: "Counted by main problem. The last hint 'will generally contain the problem's answer' (ASSISTments' own description)." },
    offered: { status: "candidates only", count: ep["not requested; system gave steps after a wrong first answer"] ?? 0, note: "Steps the system likely gave after a wrong first answer, by rule. The release logs no initiation event and keeps only the first action, so these aren't established offers." },
    generated: NOT_RECORDED,
    transmitted: NOT_RECORDED,
    displayed: "not recorded as its own event (asking for a hint shows it, but display isn't logged)",
    accepted: NOT_RECORDED,
    never_asked: { students: n(a.students), never_asked_on_main_problems: n(a.students) - n(a.students_who_ever_requested), never_asked_anywhere_including_hints_inside_steps: n(a.students) - checks.students_who_ever_requested_including_hints_inside_scaffolding! },
    inferred: "The four affect values are detector inferences on every row, not observations. Whether hint use was among the detectors' inputs isn't known.",
  };
}

export const PREPRINT_LIMITS = [
  "1,109 is an inventory of selected released request records. It isn't a request rate, a dose of help or a learning effect.",
  "There is no shared denominator of opportunities, time or learners, so rates can't be compared across the releases.",
  "Links between stages come from the scripts' rules (Supplement S1); the sources declare none. Display shares are provisional.",
  "A missing record isn't proof that no help was given. Not recorded is never the same as none.",
  "Pooling the two programming releases hides that IDETrace has no separate display record.",
  "ASSISTments is counted by problem and is set beside the other two, never pooled with them.",
  "The mappings were written and audited by software agents; independent human review of them is still pending.",
];

const NOT_ESTABLISHED = {
  actual_request_total: "not established: release selection and capture completeness are unknown",
  request_rate: "not established: no comparable denominator of exposure or opportunity",
  request_to_display_rate: "provisional only: links come from episode rules, not the sources",
  learning_effect: "not estimated: a count of help records isn't an outcome",
};

const DOES_NOT_SHOW = [
  "Any learner row, identity, dialogue or code. Only counts leave the files.",
  "Help outside the instrumented tools: other apps, people or AI.",
  "Whether any help worked.",
];

// ── the tool ─────────────────────────────────────────────────────────────

export interface PreprintInput {
  zenodo_zip?: string | undefined;
  idetrace_json?: string | undefined;
  allow_idetrace_research?: boolean | undefined;
  assistments_csv?: string | undefined;
}

const GB = 1_000_000_000;

export async function preprintInventory(input: PreprintInput, pins = PINNED, published: Published = PUBLISHED): Promise<Obj> {
  if (input.idetrace_json !== undefined && input.allow_idetrace_research !== true) {
    throw new Refusal("Reading the IDETrace file needs allow_idetrace_research: true. It holds learner telemetry whose redistribution terms are unclear, so the preprint's pipeline asks for the same explicit opt-in. Only counts are returned.");
  }
  const z: ZenodoAnalysis | undefined = input.zenodo_zip === undefined ? undefined : analyzeZenodo(readLocalBytes(input.zenodo_zip, "zenodo_zip", 2 * GB));
  const i: IdetraceAnalysis | undefined = input.idetrace_json === undefined ? undefined : analyzeIdetrace(readLocalBytes(input.idetrace_json, "idetrace_json", GB).toString("utf8"));
  const a = input.assistments_csv === undefined ? undefined : await analyzeAssistments(localFile(input.assistments_csv, "assistments_csv", 100 * GB).path);

  const inputs: Obj = {};
  const inventory: Obj = {};
  const stages: Obj = {};
  const comparison: Obj = {};
  const episodes = z || i ? crossSourceEpisodes(z, i) : undefined;
  if (z) {
    const pinned = z.input_sha256 === pins.zenodo;
    inputs.zenodo = { sha256: z.input_sha256, is_the_preprint_release: pinned };
    inventory.zenodo = z.inventory;
    stages.zenodo = zenodoStages(z.inventory, z.episodes);
    const cs = published.crossSource;
    comparison.zenodo = pinned
      ? compare({ table_2: pick(sourceRow(published, "zenodo.17551130"), Object.keys(z.inventory)), table_4: cs.zenodo, checks: pick(cs.checks as Obj, Object.keys(z.checks)) }, { table_2: z.inventory, table_4: z.episodes, checks: z.checks })
      : "not compared: this file isn't the release the preprint pinned, so its numbers aren't the preprint's";
  }
  if (i) {
    const pinned = i.input_sha256 === pins.idetrace;
    inputs.idetrace = { sha256: i.input_sha256, is_the_preprint_release: pinned };
    inventory.idetrace = i.inventory;
    stages.idetrace = idetraceStages(i.episodes);
    const cs = published.crossSource;
    comparison.idetrace = pinned
      ? compare({ table_2: pick(sourceRow(published, "tutortrace.deployment8"), Object.keys(i.inventory)), table_4: cs.idetrace, checks: pick(cs.checks as Obj, Object.keys(i.checks)) }, { table_2: i.inventory, table_4: i.episodes, checks: i.checks })
      : "not compared: this file isn't the release the preprint pinned, so its numbers aren't the preprint's";
  }
  if (z && i) {
    inventory.total_request_observations = z.inventory.assistance_request_observations + i.inventory.assistance_request_observations;
    if (z.input_sha256 === pins.zenodo && i.input_sha256 === pins.idetrace) {
      comparison.pooled = compare({ table_2_total: (published.tableTwo.aggregate as Obj).assistance_request_observations, table_4_pooled: published.crossSource.pooled }, { table_2_total: inventory.total_request_observations, table_4_pooled: (episodes as Obj).pooled });
    }
  }
  if (a) {
    const pinned = a.input_sha256 === pins.assistments;
    inputs.assistments = { sha256: a.input_sha256, is_the_preprint_release: pinned };
    stages.assistments = assistmentsStages(a);
    comparison.assistments = pinned ? compare(published.assistments, a) : "not compared: this file isn't the release the preprint pinned, so its numbers aren't the preprint's";
  }
  if (!z && !i && !a) return publishedFigures(published);
  return {
    kind: "recomputed from your files",
    learnlog: LEARNLOG_DRAFT,
    inputs,
    ...(z || i ? { inventory_table_2: { ...inventory, ...NOT_ESTABLISHED }, episodes_table_4: episodes } : {}),
    ...(a ? { assistments_table_4: a } : {}),
    stages,
    comparison_with_preprint: comparison,
    rules: RULES,
    cannot_conclude: PREPRINT_LIMITS,
    does_not_show: DOES_NOT_SHOW,
  };
}

const RULES = {
  inventory: "aggregate.py native filters: Zenodo Log rows 'Hint button is clicked' or 'Hint retry is clicked'; IDETrace CHAT_QUERY events. This tool recomputes the counts; it doesn't rerun the capture-schema validation and xAPI/Caliper round trips the Python pipeline also performs.",
  episodes: "research/learnlog-episodes/cross_source.py and assistments_episodes.py at preprint v0.6 (paste rule by timestamp), ported to TypeScript and tested against the Python on the same files.",
  source: VENDORED_FROM,
};

/** The published figures, bundled with this package, when no files are given. */
export function publishedFigures(published: Published = PUBLISHED): Obj {
  const cs = published.crossSource;
  const zRow = sourceRow(published, "zenodo.17551130");
  const iRow = sourceRow(published, "tutortrace.deployment8");
  return {
    kind: "published figures, not recomputed",
    note: "These are the preprint's published aggregate outputs, bundled with this package. Nothing was recomputed in this call. To recompute them, give your own copies of the files (zenodo_zip, idetrace_json with allow_idetrace_research: true, assistments_csv).",
    learnlog: LEARNLOG_DRAFT,
    inventory_table_2: {
      zenodo: pick(zRow, ["input_sha256", "source_file_count", "native_input_count", "native_assistance_log_count", "native_log_label_counts", "assistance_request_observations", "help_request_subtypes"]),
      idetrace: pick(iRow, ["input_sha256", "source_file_count", "native_input_count", "native_event_label_counts", "assistance_request_observations"]),
      total_request_observations: (published.tableTwo.aggregate as Obj).assistance_request_observations,
      ...NOT_ESTABLISHED,
    },
    episodes_table_4: cs,
    assistments_table_4: published.assistments,
    stages: { zenodo: zenodoStages(zRow, cs.zenodo as Obj), idetrace: idetraceStages(cs.idetrace as Obj), assistments: assistmentsStages(published.assistments) },
    datasets: PREPRINT_DATASETS,
    rules: RULES,
    cannot_conclude: PREPRINT_LIMITS,
    does_not_show: DOES_NOT_SHOW,
  };
}
