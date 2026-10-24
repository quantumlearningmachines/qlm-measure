/** qlm_learning_graph: what comes before or after a LabPath activity (mode), with its standards. */
import { Refusal } from "../files.js";
import { ANSWER_BUDGET, answerSize } from "../respond.js";
import { DatasetClient, datasetInfo } from "./qlm-datasets.js";
import { worldLink } from "./worlds.js";

type Obj = Record<string, unknown>;
export const EDGE_KINDS = ["prerequisite", "labpath-sequence", "reinforcement", "transfer", "extension"] as const;
/** Closest links first; within a kind, the export's own order. */
const KIND_ORDER = ["prerequisite", "labpath-sequence", "reinforcement", "extension", "transfer"];
const rank = (e: Obj) => KIND_ORDER.indexOf(e.kind as string);

export interface LearningGraphInput {
  mode_id?: string | undefined;
  standard?: string | undefined;
  direction?: "before" | "after" | "both" | undefined;
  kinds?: (typeof EDGE_KINDS)[number][] | undefined;
  limit?: number | undefined;
}

/** An edge keeps its first CONCEPTS_SHOWN concepts; concepts_total says how many it has when that's more. */
export const CONCEPTS_SHOWN = 8;
export const DEFAULT_LIMIT = 10;
const edge = (e: Obj) => {
  const concepts = Array.isArray(e.concepts) ? (e.concepts as unknown[]) : [];
  return {
    from: e.fromModeId,
    to: e.toModeId,
    kind: e.kind,
    priority: e.priority,
    concepts: concepts.slice(0, CONCEPTS_SHOWN),
    ...(concepts.length > CONCEPTS_SHOWN ? { concepts_total: concepts.length } : {}),
    misconceptions: e.misconceptions,
    teacher_facing_reason: e.teacherFacingReason,
    student_facing_reason: e.studentFacingReason,
  };
};

export async function qlmLearningGraph(input: LearningGraphInput, client: DatasetClient): Promise<Obj> {
  if ((input.mode_id === undefined) === (input.standard === undefined)) throw new Refusal("Give either mode_id or standard, not both and not neither.");
  const [graph, standards] = await Promise.all([client.get("learning-graph"), client.get("standards")]);
  const edges = graph.learningGraph as Obj[];
  const rows = standards.standardsAlignment as Obj[];
  const known = new Set<string>([...edges.flatMap((e) => [e.fromModeId as string, e.toModeId as string]), ...rows.map((s) => s.modeId as string)]);
  let modes: string[];
  if (input.mode_id !== undefined) {
    const id = input.mode_id;
    if (!known.has(id)) {
      const close = [...known].filter((m) => m.includes(id.toLowerCase())).slice(0, 10);
      throw new Refusal(`No LabPath mode "${id}".${close.length ? ` Close matches: ${close.join(", ")}` : ""}`);
    }
    modes = [id];
  } else {
    const code = input.standard!.toLowerCase();
    modes = [...new Set(rows.filter((s) => String(s.code).toLowerCase() === code).map((s) => s.modeId as string))];
    if (!modes.length) throw new Refusal(`No LabPath mode is aligned to the standard ${input.standard!}.`);
  }
  const kinds = new Set<string>(input.kinds ?? EDGE_KINDS);
  const direction = input.direction ?? "both";
  const asked = input.limit ?? DEFAULT_LIMIT;
  const lists: Partial<Record<"before" | "after", Obj[]>> = {};
  for (const side of ["before", "after"] as const) {
    if (direction !== "both" && direction !== side) continue;
    lists[side] = edges.filter((e) => kinds.has(e.kind as string) && modes.includes((side === "before" ? e.toModeId : e.fromModeId) as string)).sort((a, b) => rank(a) - rank(b));
  }
  const build = (limit: number): Obj => {
    const out: Obj = { modes };
    const truncated: Obj = {};
    const linked = new Set<string>();
    for (const side of ["before", "after"] as const) {
      const list = lists[side];
      if (!list) continue;
      if (list.length > limit) truncated[side] = list.length;
      out[side] = list.slice(0, limit).map((e) => {
        for (const m of [e.fromModeId as string, e.toModeId as string]) if (!modes.includes(m)) linked.add(m);
        return edge(e);
      });
    }
    if (Object.keys(truncated).length) out.truncated = truncated;
    if (![out.before, out.after].some((l) => Array.isArray(l) && l.length)) out.note = `${modes.join(", ")} has no edges of the kinds asked for in this direction.`;
    out.standards = Object.fromEntries(modes.map((m) => [m, rows.filter((s) => s.modeId === m).map((s) => ({ code: s.code, description: s.description, gradeBand: s.gradeBand, disciplinaryCore: s.disciplinaryCore, discipline: s.discipline }))]));
    out.linked_mode_standards = Object.fromEntries([...linked].map((m) => [m, rows.filter((s) => s.modeId === m).map((s) => s.code)]));
    const links = [...modes, ...linked].map(worldLink);
    out.worlds = Object.fromEntries(links.filter((w) => w.url !== null).map((w) => [w.id, w]));
    const unknown = links.filter((w) => w.url === null).map((w) => w.id);
    if (unknown.length) out.worlds_without_a_known_page = unknown;
    return out;
  };
  // Fit the answer: lower the per-direction limit until it does, and say so.
  let used = asked;
  let out = build(used);
  while (used > 1 && answerSize({ ...out, does_not_show: ["x"] }) > ANSWER_BUDGET - 2_000) {
    used = Math.floor(used * 0.75);
    out = build(used);
  }
  if (used < asked) out.limit_lowered = { asked, used, why: `${asked} links per direction would not fit in one answer, so ${used} are shown. Ask for one direction or fewer kinds to see others.` };
  const priorities = new Set(edges.map((e) => e.priority));
  if (priorities.size === 1) out.priority_note = `Every edge in the export has priority "${String([...priorities][0])}", so priority doesn't rank these links.`;
  const byKind: Record<string, number> = {};
  for (const e of edges) byKind[e.kind as string] = (byKind[e.kind as string] ?? 0) + 1;
  out.dataset = { ...datasetInfo(graph, "learning-graph"), standards_source: datasetInfo(standards, "standards").source, edges_in_export: edges.length, edges_by_kind: byKind, standards_rows_in_export: rows.length };
  out.does_not_show = [
    "Whether a particular student needs a step. This is LabPath's designed sequence, not evidence about a learner.",
    "How strong a link is. Priority is the export's coarse band of a tuned ranking, not a measured effect.",
    "An official alignment. Standards are LabPath's own mapping of its modes to NGSS-style codes, not a standards body's.",
    "The misconceptions themselves. Edges carry misconception ids; look them up with qlm_misconceptions.",
  ];
  return out;
}
