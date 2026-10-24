/**
 * LabPath worlds: every misconception and learning-graph answer names the worlds that work on it, with
 * their public pages. Kumar (Oct 24, 2026): "qlm misconception should be default for all adapters and it
 * should suggest specific labpath worlds".
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../src/package.js";
import { qlmLearningGraph } from "../src/tools/learning-graph.js";
import { qlmMisconceptions } from "../src/tools/misconceptions.js";
import { DatasetClient } from "../src/tools/qlm-datasets.js";
import { WORLD_URL, worldLink, worldLinks } from "../src/tools/worlds.js";
import { GRAPH_BODY, MISCONCEPTIONS_BODY, STANDARDS_BODY, datasetFetch } from "./helpers/qlm-fixtures.js";

type Obj = Record<string, any>;
const table = JSON.parse(readFileSync(join(ROOT, "data/labpath-worlds.json"), "utf8"));

describe("the bundled list of LabPath worlds", () => {
  it("names 100 worlds, each checked against its public page, with the address pattern and the date", () => {
    expect(Object.keys(table.worlds)).toHaveLength(100);
    for (const [id, name] of Object.entries(table.worlds)) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
      expect(typeof name === "string" && name.trim().length > 0).toBe(true);
    }
    expect(table.url_pattern).toBe("https://play.quantumlearningmachines.com/ecogenesis/worlds/{id}");
    expect(table.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(table.worlds.forcefield).toBe("Force Field");
    expect(table.worlds.proportionlab).toBe("Proportion Lab");
  });
});

describe("worldLink", () => {
  it("gives a known world its name and public page", () => {
    expect(WORLD_URL).toBe("https://play.quantumlearningmachines.com/ecogenesis/worlds/");
    expect(worldLink("forcefield")).toEqual({ id: "forcefield", name: "Force Field", url: "https://play.quantumlearningmachines.com/ecogenesis/worlds/forcefield" });
  });
  it("never makes up a page for a world it doesn't know", () => {
    expect(worldLink("no-such-world")).toEqual({ id: "no-such-world", name: null, url: null, note: "No public page is known for this world." });
  });
  it("links a list, skipping what isn't text and repeats", () => {
    expect(worldLinks(["forcefield", 5, "forcefield", "proportionlab"]).map((w) => w.id)).toEqual(["forcefield", "proportionlab"]);
    expect(worldLinks(undefined)).toEqual([]);
  });
});

describe("qlm_misconceptions names the worlds for each misconception", () => {
  it("in the order the record lists its modes", async () => {
    const extra = { ...MISCONCEPTIONS_BODY.misconceptions[0], id: "PHY-W", modes: ["forcefield", "aerospacelab", "unknown-mode"] };
    const c = new DatasetClient(datasetFetch({ misconceptions: { ...MISCONCEPTIONS_BODY, misconceptions: [extra] } }).f);
    const r = (await qlmMisconceptions({ id: "PHY-W" }, c)) as Obj;
    expect(r.misconceptions[0].worlds).toEqual([
      { id: "forcefield", name: "Force Field", url: "https://play.quantumlearningmachines.com/ecogenesis/worlds/forcefield" },
      { id: "aerospacelab", name: "Aerospace Lab", url: "https://play.quantumlearningmachines.com/ecogenesis/worlds/aerospacelab" },
      { id: "unknown-mode", name: null, url: null, note: "No public page is known for this world." },
    ]);
    expect(r.worlds_note).toMatch(/LabPath worlds/);
  });
});

describe("qlm_learning_graph names every world in its answer", () => {
  it("the asked-about world and each linked one", async () => {
    const edges = [
      { fromModeId: "simpleforces", toModeId: "forcefield", kind: "labpath-sequence", priority: "high", concepts: ["force"], misconceptions: [], teacherFacingReason: "r", studentFacingReason: "s" },
      { fromModeId: "forcefield", toModeId: "fluidlab", kind: "prerequisite", priority: "high", concepts: ["force"], misconceptions: [], teacherFacingReason: "r", studentFacingReason: "s" },
    ];
    const c = new DatasetClient(datasetFetch({ "learning-graph": { ...GRAPH_BODY, learningGraph: edges }, standards: STANDARDS_BODY }).f);
    const r = (await qlmLearningGraph({ mode_id: "forcefield" }, c)) as Obj;
    expect(Object.keys(r.worlds)).toEqual(["forcefield", "simpleforces", "fluidlab"]);
    expect(r.worlds.fluidlab).toEqual({ id: "fluidlab", name: "Fluid Lab", url: "https://play.quantumlearningmachines.com/ecogenesis/worlds/fluidlab" });
    expect(r).not.toHaveProperty("worlds_without_a_known_page");
  });
  it("lists worlds with no known page by id only, never with a made-up link", async () => {
    const edges = [{ fromModeId: "forcefield", toModeId: "made-up-world", kind: "transfer", priority: "high", concepts: [], misconceptions: [], teacherFacingReason: "r", studentFacingReason: "s" }];
    const c = new DatasetClient(datasetFetch({ "learning-graph": { ...GRAPH_BODY, learningGraph: edges }, standards: STANDARDS_BODY }).f);
    const r = (await qlmLearningGraph({ mode_id: "forcefield" }, c)) as Obj;
    expect(Object.keys(r.worlds)).toEqual(["forcefield"]);
    expect(r.worlds_without_a_known_page).toEqual(["made-up-world"]);
  });
});
