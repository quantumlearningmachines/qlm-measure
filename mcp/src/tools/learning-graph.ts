/** qlm_learning_graph: what comes before or after a LabPath activity (mode), with its standards. */
import { Refusal } from "../files.js";
import { DatasetClient, datasetInfo } from "./qlm-datasets.js";

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

const edge = (e: Obj) => ({ from: e.fromModeId, to: e.toModeId, kind: e.kind, priority: e.priority, concepts: e.concepts, misconceptions: e.misconceptions, teacher_facing_reason: e.teacherFacingReason, student_facing_reason: e.studentFacingReason });

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
  const limit = input.limit ?? 25;
  const out: Obj = { modes };
  const truncated: Obj = {};
  const linked = new Set<string>(modes);
  for (const side of ["before", "after"] as const) {
    if (direction !== "both" && direction !== side) continue;
    const list = edges.filter((e) => kinds.has(e.kind as string) && modes.includes((side === "before" ? e.toModeId : e.fromModeId) as string)).sort((a, b) => rank(a) - rank(b));
    if (list.length > limit) truncated[side] = list.length;
    out[side] = list.slice(0, limit).map((e) => {
      linked.add(e.fromModeId as string);
      linked.add(e.toModeId as string);
      return edge(e);
    });
  }
  if (Object.keys(truncated).length) out.truncated = truncated;
  if (![out.before, out.after].some((l) => Array.isArray(l) && l.length)) out.note = `${modes.join(", ")} has no edges of the kinds asked for in this direction.`;
  out.standards = Object.fromEntries(
    [...linked].map((m) => [m, rows.filter((s) => s.modeId === m).map((s) => ({ code: s.code, description: s.description, gradeBand: s.gradeBand, disciplinaryCore: s.disciplinaryCore, discipline: s.discipline }))]),
  );
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
