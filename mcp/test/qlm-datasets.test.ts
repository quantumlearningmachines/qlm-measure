import { describe, expect, it } from "vitest";
import { DATASET_URL, DatasetClient } from "../src/tools/qlm-datasets.js";
import { qlmLearningGraph } from "../src/tools/learning-graph.js";
import { qlmMisconceptions } from "../src/tools/misconceptions.js";
import { GRAPH_BODY, MISCONCEPTIONS_BODY, STANDARDS_BODY, datasetFetch } from "./helpers/qlm-fixtures.js";

type Obj = Record<string, any>;

describe("the dataset client", () => {
  it("GETs one URL per dataset from play.quantumlearningmachines.com only, and caches it for the process", async () => {
    const { f, calls } = datasetFetch();
    const c = new DatasetClient(f);
    expect(DATASET_URL).toBe("https://play.quantumlearningmachines.com/api/labpath/dataset-export");
    await c.get("misconceptions");
    await c.get("misconceptions");
    await Promise.all([c.get("standards"), c.get("standards")]);
    expect(calls.map((x) => x.url)).toEqual([`${DATASET_URL}?dataset=misconceptions`, `${DATASET_URL}?dataset=standards`]);
    expect(calls[0]!.init).toEqual(expect.objectContaining({ method: "GET", redirect: "error" }));
    expect(calls[0]!.init!.body).toBeUndefined();
  });
  it("refuses answers that aren't the export, and doesn't cache a failure", async () => {
    const bad = new DatasetClient(datasetFetch({ misconceptions: { _meta: {}, misconceptions: "x" }, standards: "not json", "learning-graph": { learningGraph: [] } }).f);
    await expect(bad.get("misconceptions")).rejects.toThrow(/wasn't the misconceptions export this tool expects/);
    await expect(bad.get("standards")).rejects.toThrow(/wasn't the standards export this tool expects/);
    await expect(bad.get("learning-graph")).rejects.toThrow(/wasn't the learning-graph export/);
    const missing = new DatasetClient(datasetFetch({}).f);
    await expect(missing.get("misconceptions")).rejects.toThrow(/answered HTTP 404/);
    let n = 0;
    const flaky = (async (url: string) => {
      n++;
      if (n === 1) throw new TypeError("fetch failed");
      return datasetFetch().f(url);
    }) as unknown as typeof fetch;
    const c = new DatasetClient(flaky);
    await expect(c.get("misconceptions")).rejects.toThrow(/Couldn't reach play.quantumlearningmachines.com: fetch failed/);
    expect(((await c.get("misconceptions")) as Obj).misconceptions).toHaveLength(4);
    const odd = new DatasetClient((async () => {
      throw "boom"; // eslint-disable-line @typescript-eslint/only-throw-error
    }) as unknown as typeof fetch);
    await expect(odd.get("standards")).rejects.toThrow(/Couldn't reach play.quantumlearningmachines.com: boom/);
    const huge = new DatasetClient(datasetFetch({ standards: "x".repeat(50_000_001) }).f);
    await expect(huge.get("standards")).rejects.toThrow(/too large/);
  });
});

describe("qlm_misconceptions", () => {
  const client = () => new DatasetClient(datasetFetch().f);
  it("finds misconceptions by search text, and returns what a teacher needs with the citation and license", async () => {
    const r = (await qlmMisconceptions({ search: "keep MOVING" }, client())) as Obj;
    expect(r.total_matching).toBe(1);
    const x = r.misconceptions[0];
    expect(x).toEqual({
      id: "PHY-001", tier: "public", domain: "physics", subdomain: "forces", gradeBands: ["6-8", "9-12"],
      name: "Motion requires a continuous force", studentBelief: "An object needs a constant push to keep moving.",
      scientificReality: "An object in motion stays in motion unless a net force acts on it.", counterexample: "A puck on ice keeps sliding with no push.",
      teacherIntervention: "Use a low-friction cart and ask students to predict before releasing it.", researchSource: "Clement (1982); Halloun & Hestenes (1985)",
      severity: "critical", frequency: "very-high", persistence: "deep", modes: ["forces-motion", "newton-lab"],
      diagnosticQuestion: "A hockey puck slides on ice. What keeps it moving?", triggerPatterns: ["needs a force to keep moving"],
      worlds: [
        { id: "forces-motion", name: null, url: null, note: "No public page is known for this world." },
        { id: "newton-lab", name: null, url: null, note: "No public page is known for this world." },
      ],
    });
    expect(r.dataset).toEqual(expect.objectContaining({ license: "CC-BY-4.0", version: "1.0.0", citation: "QLM LabPath Dataset v1.0, Quantum Learning Machines, 2026", source: `${DATASET_URL}?dataset=misconceptions`, records_in_export: 4, records_by_tier: { public: 3, evaluation: 1 } }));
    expect(r.dataset.archived).toMatch(/10\.5281\/zenodo\.21800324/);
    expect(r.does_not_show.length).toBeGreaterThan(2);
  });
  it("never returns an evaluation-tier record's trigger patterns or diagnostic question, and says why", async () => {
    const r = (await qlmMisconceptions({ id: "phy-002" }, client())) as Obj;
    const x = r.misconceptions[0];
    expect(x.id).toBe("PHY-002");
    expect(x).not.toHaveProperty("triggerPatterns");
    expect(x).not.toHaveProperty("diagnosticQuestion");
    expect(x.withheld).toBe("triggerPatterns and diagnosticQuestion are withheld for evaluation-tier records, for benchmark integrity.");
    expect(JSON.stringify(r)).not.toMatch(/evaluation tier — /);
  });
  it("filters by domain and grade band, limits the list, and lists what's there", async () => {
    const r = (await qlmMisconceptions({ domain: "Physics", grade_band: "3-5" }, client())) as Obj;
    expect(r.misconceptions.map((x: Obj) => x.id)).toEqual(["PHY-002"]);
    const all = (await qlmMisconceptions({ limit: 2 }, client())) as Obj;
    expect(all).toEqual(expect.objectContaining({ total_matching: 4, returned: 2 }));
    expect(all.available.domains).toEqual({ physics: 2, math: 1, health: 1 });
    expect(all.available.grade_bands).toEqual({ "3-5": 2, "6-8": 2, "9-12": 1, postsecondary: 1 });
    const nurse = (await qlmMisconceptions({ search: "pulse" }, client())) as Obj;
    expect(nurse.misconceptions[0]).not.toHaveProperty("diagnosticQuestion");
    expect(nurse.misconceptions[0].withheld).toMatch(/embedded in its residency scenario/);
    expect(nurse.misconceptions[0].triggerPatterns).toEqual([]);
  });
  it("says plainly when nothing matches", async () => {
    const r = (await qlmMisconceptions({ search: "photosynthesis" }, client())) as Obj;
    expect(r).toEqual(expect.objectContaining({ total_matching: 0, returned: 0, misconceptions: [] }));
    expect(r.note).toMatch(/No misconception in the export matches/);
  });
});

describe("qlm_learning_graph", () => {
  const client = () => new DatasetClient(datasetFetch().f);
  it("what comes before and after a mode, with teacher-facing reasons, linked misconceptions and standards", async () => {
    const r = (await qlmLearningGraph({ mode_id: "forces-motion" }, client())) as Obj;
    expect(r.modes).toEqual(["forces-motion"]);
    expect(r.before.map((x: Obj) => [x.from, x.kind])).toEqual([["intro-motion", "prerequisite"], ["friction-lab", "reinforcement"]]);
    expect(r.after.map((x: Obj) => [x.to, x.kind, x.priority])).toEqual([["newton-lab", "labpath-sequence", "medium"], ["gravity-drop", "transfer", "low"]]);
    expect(r.before[0]).toEqual({ from: "intro-motion", to: "forces-motion", kind: "prerequisite", priority: "high", concepts: ["net force"], misconceptions: ["PHY-001"], teacher_facing_reason: "Mission graph already encodes intro-motion as a prerequisite for forces-motion.", student_facing_reason: "This next lab uses a similar idea in a new situation." });
    expect(r.standards["forces-motion"].map((x: Obj) => x.code)).toEqual(["HS-PS2-1", "MS-PS2-2"]);
    expect(r.standards["forces-motion"][1]).toEqual({ code: "MS-PS2-2", description: "Plan an investigation of balanced and unbalanced forces.", gradeBand: "6-8", disciplinaryCore: "PS2.A: Forces and Motion", discipline: "Physical Science" });
    expect(Object.keys(r.standards)).toEqual(["forces-motion"]);
    expect(r.linked_mode_standards).toEqual({ "intro-motion": [], "friction-lab": [], "newton-lab": ["HS-PS2-1"], "gravity-drop": ["MS-PS2-4"] });
    expect(r.before[0]).not.toHaveProperty("concepts_total");
    expect(r.dataset).toEqual(expect.objectContaining({ license: "CC-BY-4.0", edges_in_export: 6, standards_rows_in_export: 4 }));
    expect(r.dataset.edges_by_kind).toEqual({ prerequisite: 1, "labpath-sequence": 1, transfer: 2, reinforcement: 1, extension: 1 });
    expect(r.does_not_show.join(" ")).toMatch(/LabPath's design/);
  });
  it("one direction, chosen kinds, a limit", async () => {
    const r = (await qlmLearningGraph({ mode_id: "forces-motion", direction: "after", kinds: ["transfer"] }, client())) as Obj;
    expect(r).not.toHaveProperty("before");
    expect(r.after.map((x: Obj) => x.to)).toEqual(["gravity-drop"]);
    const b = (await qlmLearningGraph({ mode_id: "forces-motion", direction: "before", limit: 1 }, client())) as Obj;
    expect(b.before).toHaveLength(1);
    expect(b.truncated).toEqual({ before: 2 });
    expect(b).not.toHaveProperty("after");
  });
  it("starts from a standard code: every mode aligned to it", async () => {
    const r = (await qlmLearningGraph({ standard: "hs-ps2-1", direction: "after" }, client())) as Obj;
    expect(r.modes).toEqual(["forces-motion", "newton-lab"]);
    // closest links first: prerequisite, labpath-sequence, reinforcement, extension, then transfer
    expect(r.after.map((x: Obj) => x.to)).toEqual(["newton-lab", "rocket-design", "gravity-drop"]);
  });
  it("refuses unclear input and suggests close modes", async () => {
    await expect(qlmLearningGraph({}, client())).rejects.toThrow(/Give either mode_id or standard/);
    await expect(qlmLearningGraph({ mode_id: "a", standard: "b" }, client())).rejects.toThrow(/Give either mode_id or standard/);
    await expect(qlmLearningGraph({ mode_id: "forces" }, client())).rejects.toThrow(/No LabPath mode "forces". Close matches: forces-motion/);
    await expect(qlmLearningGraph({ mode_id: "zzz" }, client())).rejects.toThrow(/No LabPath mode "zzz"\.$/);
    await expect(qlmLearningGraph({ standard: "XX-1" }, client())).rejects.toThrow(/No LabPath mode is aligned to the standard XX-1/);
  });
  it("a mode with standards but no edges is still a mode", async () => {
    const lone = new DatasetClient(datasetFetch({ "learning-graph": { ...GRAPH_BODY, learningGraph: [] }, standards: STANDARDS_BODY, misconceptions: MISCONCEPTIONS_BODY }).f);
    const r = (await qlmLearningGraph({ mode_id: "gravity-drop" }, lone)) as Obj;
    expect(r.before).toEqual([]);
    expect(r.after).toEqual([]);
    expect(r.note).toMatch(/has no edges of the kinds asked for/);
  });
});

describe("records missing optional fields", () => {
  it("are still listed, with empty lists rather than invented values", async () => {
    const c = new DatasetClient(datasetFetch({ misconceptions: { _meta: MISCONCEPTIONS_BODY._meta, misconceptions: [{ id: "X-1", tier: "public", name: "bare" }, 5] } }).f);
    const r = (await qlmMisconceptions({}, c)) as Obj;
    expect(r.dataset.records_in_export).toBe(1);
    expect(r.misconceptions[0].triggerPatterns).toEqual([]);
    expect(r.available.grade_bands).toEqual({});
    const g = (await qlmMisconceptions({ grade_band: "6-8" }, c)) as Obj;
    expect(g.total_matching).toBe(0);
  });
});

describe("an edge without concepts", () => {
  it("lists no concepts rather than inventing any", async () => {
    const bare = { fromModeId: "intro-motion", toModeId: "forces-motion", kind: "prerequisite", priority: "high", misconceptions: [] };
    const c = new DatasetClient(datasetFetch({ "learning-graph": { ...GRAPH_BODY, learningGraph: [bare] }, standards: STANDARDS_BODY }).f);
    const r = (await qlmLearningGraph({ mode_id: "forces-motion" }, c)) as Obj;
    expect(r.before[0].concepts).toEqual([]);
    expect(r.before[0]).not.toHaveProperty("concepts_total");
  });
});

describe("edge order and priority", () => {
  it("lists the closest kinds of link first, and says when priority doesn't rank anything", async () => {
    const flat = datasetFetch({ "learning-graph": { ...GRAPH_BODY, learningGraph: GRAPH_BODY.learningGraph.map((e) => ({ ...e, priority: "high" })) }, standards: STANDARDS_BODY });
    const r = (await qlmLearningGraph({ mode_id: "forces-motion" }, new DatasetClient(flat.f))) as Obj;
    expect(r.before.map((x: Obj) => x.kind)).toEqual(["prerequisite", "reinforcement"]);
    expect(r.priority_note).toBe('Every edge in the export has priority "high", so priority doesn\'t rank these links.');
    const mixed = (await qlmLearningGraph({ mode_id: "forces-motion" }, new DatasetClient(datasetFetch().f))) as Obj;
    expect(mixed).not.toHaveProperty("priority_note");
  });
});
