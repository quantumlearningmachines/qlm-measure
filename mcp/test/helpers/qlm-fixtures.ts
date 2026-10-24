/**
 * Fixtures shaped exactly like GET https://play.quantumlearningmachines.com/api/labpath/dataset-export
 * (qlm-games src/app/api/labpath/dataset-export/route.ts at fa9d4ea): the _meta block, the masked
 * evaluation-tier fields, the residency records, quantized edge priorities and the standards rows.
 * The texts are written for tests; the shapes and the masking strings are the route's own.
 */
export const META = {
  exportedAt: "2026-10-24T01:00:00.000Z",
  license: "CC-BY-4.0",
  source: "Quantum Learning Machines — LabPath K-16 STEM Platform",
  version: "1.0.0",
  description: "Open educational dataset for K-12 AI infrastructure research",
  citation: "QLM LabPath Dataset v1.0, Quantum Learning Machines, 2026",
};

const m = (o: Record<string, unknown>) => ({
  tier: "public",
  domain: "physics",
  subdomain: "forces",
  gradeBands: ["6-8", "9-12"],
  counterexample: "A puck on ice keeps sliding with no push.",
  triggerPatterns: ["needs a force to keep moving"],
  diagnosticQuestion: "A hockey puck slides on ice. What keeps it moving?",
  frequency: "very-high",
  persistence: "deep",
  severity: "critical",
  researchSource: "Clement (1982); Halloun & Hestenes (1985)",
  teacherIntervention: "Use a low-friction cart and ask students to predict before releasing it.",
  modes: ["forces-motion", "newton-lab"],
  ...o,
});

export const MISCONCEPTIONS = [
  m({ id: "PHY-001", name: "Motion requires a continuous force", studentBelief: "An object needs a constant push to keep moving.", scientificReality: "An object in motion stays in motion unless a net force acts on it." }),
  m({
    id: "PHY-002",
    tier: "evaluation",
    name: "Heavier objects fall faster",
    studentBelief: "A heavy ball hits the ground before a light one.",
    scientificReality: "Without air resistance, all objects fall with the same acceleration.",
    triggerPatterns: ["[evaluation tier — trigger patterns withheld]"],
    diagnosticQuestion: "[evaluation tier — withheld for benchmark integrity]",
    gradeBands: ["3-5", "6-8"],
    severity: "moderate",
    modes: ["gravity-drop"],
  }),
  m({ id: "MATH-010", domain: "math", subdomain: "fractions", gradeBands: ["3-5"], name: "Bigger denominator, bigger fraction", studentBelief: "1/8 is larger than 1/4 because 8 is larger than 4.", scientificReality: "A larger denominator means smaller equal parts.", counterexample: "Cut a pizza into 8 slices, then into 4.", severity: "moderate", researchSource: "Ni & Zhou (2005)", modes: ["fraction-bars"] }),
  {
    id: "NURS-01",
    tier: "public",
    domain: "health",
    subdomain: "clinical-nursing",
    gradeBands: ["postsecondary"],
    name: "Pulse oximetry alone rules out hypoxia",
    studentBelief: "Pulse oximetry alone rules out hypoxia (SpO2 above 94% means oxygenation is fine)",
    scientificReality: "A patient with carbon monoxide exposure reads 99% while hypoxic.",
    counterexample: "A patient with carbon monoxide exposure reads 99% while hypoxic.",
    triggerPatterns: [],
    diagnosticQuestion: "[residency clinical — embedded in scenario]",
    frequency: "high",
    persistence: "deep",
    severity: "critical",
    researchSource: "QLM Credentials Clinical Misconception Registry v1",
    teacherIntervention: "Scenario-embedded in clinical-nurse residency world",
    modes: ["clinical-nurse"],
  },
];

export const MISCONCEPTIONS_BODY = { _meta: META, misconceptions: MISCONCEPTIONS, misconceptionCount: MISCONCEPTIONS.length };

const e = (fromModeId: string, toModeId: string, kind: string, o: Record<string, unknown> = {}) => ({
  fromModeId,
  toModeId,
  kind,
  priority: "high",
  concepts: ["net force"],
  misconceptions: [],
  studentFacingReason: `This next lab uses a similar idea in a new situation.`,
  teacherFacingReason: `${fromModeId} and ${toModeId} share curriculum skills, so transfer can be tested instead of retaught.`,
  ...o,
});

export const EDGES = [
  e("intro-motion", "forces-motion", "prerequisite", { teacherFacingReason: "Mission graph already encodes intro-motion as a prerequisite for forces-motion.", misconceptions: ["PHY-001"] }),
  e("forces-motion", "newton-lab", "labpath-sequence", { priority: "medium", misconceptions: ["PHY-001"] }),
  e("forces-motion", "gravity-drop", "transfer", { priority: "low", concepts: ["acceleration"] }),
  e("friction-lab", "forces-motion", "reinforcement"),
  e("newton-lab", "rocket-design", "extension"),
  e("fraction-bars", "number-line", "transfer", { concepts: ["equal parts"] }),
];
export const GRAPH_BODY = { _meta: META, learningGraph: EDGES, learningGraphEdgeCount: EDGES.length };

const s = (modeId: string, code: string, gradeBand: string, description = "Apply Newton's Second Law to analyze data.") => ({ modeId, code, description, gradeBand, disciplinaryCore: "PS2.A: Forces and Motion", discipline: "Physical Science" });
export const STANDARDS = [s("forces-motion", "HS-PS2-1", "9-12"), s("forces-motion", "MS-PS2-2", "6-8", "Plan an investigation of balanced and unbalanced forces."), s("newton-lab", "HS-PS2-1", "9-12"), s("gravity-drop", "MS-PS2-4", "6-8", "Construct an argument about gravitational interactions.")];
export const STANDARDS_BODY = { _meta: META, standardsAlignment: STANDARDS, standardsCount: STANDARDS.length };

/** A fetch that answers the three dataset URLs, counts requests, and can be told to fail. */
export function datasetFetch(bodies: Record<string, unknown> = { misconceptions: MISCONCEPTIONS_BODY, "learning-graph": GRAPH_BODY, standards: STANDARDS_BODY }) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const f = async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(url instanceof Request ? url.url : url.toString());
    calls.push({ url: u.toString(), init });
    const body = bodies[u.searchParams.get("dataset") ?? ""];
    if (body === undefined) return new Response("not here", { status: 404 });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { f: f as typeof fetch, calls };
}
