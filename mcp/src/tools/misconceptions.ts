/** qlm_misconceptions: search QLM's public misconception dataset (CC BY 4.0). */
import { DatasetClient, datasetInfo } from "./qlm-datasets.js";
import { worldLinks } from "./worlds.js";

type Obj = Record<string, unknown>;

export interface MisconceptionsInput {
  id?: string | undefined;
  domain?: string | undefined;
  grade_band?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
}

const TEXT = ["id", "name", "subdomain", "studentBelief", "scientificReality", "counterexample", "teacherIntervention"];
const KEEP = ["id", "tier", "domain", "subdomain", "gradeBands", "name", "studentBelief", "scientificReality", "counterexample", "teacherIntervention", "researchSource", "severity", "frequency", "persistence", "modes"];
const placeholder = (v: unknown) => typeof v === "string" && v.startsWith("[");
const lc = (v: unknown) => (typeof v === "string" ? v.toLowerCase() : "");
const bands = (r: Obj) => (Array.isArray(r.gradeBands) ? (r.gradeBands as string[]) : []);

/** A record as returned: never an evaluation-tier record's trigger patterns or diagnostic question. */
function shown(r: Obj): Obj {
  const out: Obj = Object.fromEntries(KEEP.map((k) => [k, r[k]]));
  out.worlds = worldLinks(r.modes);
  if (r.tier === "evaluation") {
    out.withheld = "triggerPatterns and diagnosticQuestion are withheld for evaluation-tier records, for benchmark integrity.";
    return out;
  }
  if (placeholder(r.diagnosticQuestion)) out.withheld = "The diagnostic question is embedded in its residency scenario, not in the export.";
  else out.diagnosticQuestion = r.diagnosticQuestion;
  out.triggerPatterns = Array.isArray(r.triggerPatterns) ? r.triggerPatterns.filter((p) => !placeholder(p)) : [];
  return out;
}

const tally = (values: string[]) => {
  const c: Record<string, number> = {};
  for (const v of values) c[v] = (c[v] ?? 0) + 1;
  return c;
};

export async function qlmMisconceptions(input: MisconceptionsInput, client: DatasetClient): Promise<Obj> {
  const body = await client.get("misconceptions");
  const all = (body.misconceptions as unknown[]).filter((r): r is Obj => typeof r === "object" && r !== null);
  const words = lc(input.search).split(/\s+/).filter(Boolean);
  const matches = all.filter(
    (r) =>
      (!input.id || lc(r.id) === lc(input.id)) &&
      (!input.domain || lc(r.domain) === lc(input.domain)) &&
      (!input.grade_band || bands(r).some((b) => lc(b) === lc(input.grade_band))) &&
      words.every((w) => TEXT.some((k) => lc(r[k]).includes(w))),
  );
  const limit = input.limit ?? 10;
  return {
    dataset: { ...datasetInfo(body, "misconceptions"), records_in_export: all.length, records_by_tier: tally(all.map((r) => String(r.tier))) },
    total_matching: matches.length,
    returned: Math.min(limit, matches.length),
    misconceptions: matches.slice(0, limit).map(shown),
    worlds_note: "Each misconception's worlds are the LabPath worlds that work on it, with their public pages. Suggest them by name and link.",
    ...(matches.length === 0 ? { note: "No misconception in the export matches. Try fewer words, or see the domains and grade bands listed under available." } : {}),
    available: { domains: tally(all.map((r) => String(r.domain))), grade_bands: tally(all.flatMap(bands)) },
    does_not_show: [
      "Whether any student holds one of these. They are curated, research-based descriptions of common misconceptions, not observations of a learner.",
      "Held-out records, kept back for benchmark integrity; they aren't in the export at all.",
      "Evaluation-tier trigger patterns and diagnostic questions, withheld for benchmark integrity.",
      "How often a misconception occurs in your setting. Frequency, persistence and severity are the dataset's research-based bands.",
    ],
  };
}
