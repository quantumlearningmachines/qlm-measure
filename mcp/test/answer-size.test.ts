/**
 * Answers must fit what an assistant can take in at once. Claude Code warns above about 10,000 tokens
 * and rejects above 25,000, so every answer stays at or under ANSWER_BUDGET characters of JSON text.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../src/package.js";
import { ANSWER_BUDGET, answer } from "../src/respond.js";
import { qlmLearningGraph } from "../src/tools/learning-graph.js";
import { DatasetClient } from "../src/tools/qlm-datasets.js";
import { learnlogTransform } from "../src/tools/transform.js";
import { GRAPH_BODY, STANDARDS_BODY, datasetFetch } from "./helpers/qlm-fixtures.js";
import { workdir, writeFixture } from "./helpers/python.js";

type Obj = Record<string, any>;
const size = (body: Obj) => answer(body).content[0]!.text.length;

describe("the answer budget", () => {
  it("is 30,000 characters", () => {
    expect(ANSWER_BUDGET).toBe(30_000);
  });
  it("passes an answer that fits", () => {
    const r = answer({ x: "a".repeat(100), does_not_show: ["y"] });
    expect(r.isError).toBeUndefined();
  });
  it("refuses an answer that doesn't fit, saying how large it was and what to ask for instead", () => {
    const r = answer({ x: "a".repeat(ANSWER_BUDGET), does_not_show: ["y"] });
    expect(r.isError).toBe(true);
    const msg = JSON.parse(r.content[0]!.text).error as string;
    expect(msg).toMatch(/^This answer would be 30,\d{3} characters, more than the 30,000 an assistant can take in at once\. Ask for less/);
  });
});

describe("learnlog_transform with include_document", () => {
  it("returns the whole document when the answer fits", async () => {
    const dir = workdir();
    const one = readFileSync(join(ROOT, "data/samples/explicit-assistance-SYNTHETIC.jsonl"), "utf8").trim().split("\n")[0]!;
    const r = (await learnlogTransform({ format: "explicit-assistance-events", path: writeFixture(dir, "one.jsonl", one + "\n"), include_document: true })) as Obj;
    expect(r.document.records).toHaveLength(1);
    expect(r).not.toHaveProperty("document_omitted");
    expect(size(r)).toBeLessThanOrEqual(ANSWER_BUDGET);
  });
  it("leaves out a document too large for one answer and says how large it is", async () => {
    const r = (await learnlogTransform({ format: "tutormoments", use_sample: true, include_document: true })) as Obj;
    expect(r).not.toHaveProperty("document");
    expect(r.document_omitted.characters).toBeGreaterThan(ANSWER_BUDGET);
    expect(r.document_omitted.note).toBe(
      `The whole Learnlog document is ${r.document_omitted.characters.toLocaleString("en-US")} characters, too large to send in one answer (the limit is 30,000). The summary, heads, unknowns and preview here describe it. Nothing was written to disk.`,
    );
    expect(size(r)).toBeLessThanOrEqual(ANSWER_BUDGET);
  });
  it("without include_document, says how to ask for it", async () => {
    const r = (await learnlogTransform({ format: "oatutor", use_sample: true })) as Obj;
    expect(r.document_note).toMatch(/Set include_document: true/);
  });
});

describe("qlm_learning_graph answers fit", () => {
  const long = (n: number) => Array.from({ length: n }, (_, i) => `concept number ${i} with a fairly long description of the idea`);
  const busy = (reason = 300) => {
    const edges = [];
    for (let i = 0; i < 60; i++) {
      edges.push({ fromModeId: `pre-${i}`, toModeId: "hub", kind: "transfer", priority: "high", concepts: long(40), misconceptions: ["PHY-001", "PHY-002"], teacherFacingReason: "r".repeat(reason), studentFacingReason: "s".repeat(reason) });
      edges.push({ fromModeId: "hub", toModeId: `post-${i}`, kind: "transfer", priority: "high", concepts: long(40), misconceptions: [], teacherFacingReason: "r".repeat(reason), studentFacingReason: "s".repeat(reason) });
    }
    const st = (modeId: string, k: number) => ({ modeId, code: `HS-PS2-${k}`, description: "d".repeat(200), gradeBand: "9-12", disciplinaryCore: "PS2.A: Forces and Motion", discipline: "Physical Science" });
    const rows = [...Array.from({ length: 14 }, (_, k) => st("hub", k)), ...edges.flatMap((e, j) => [st(e.fromModeId === "hub" ? e.toModeId : e.fromModeId, j)])];
    return new DatasetClient(datasetFetch({ "learning-graph": { ...GRAPH_BODY, learningGraph: edges }, standards: { ...STANDARDS_BODY, standardsAlignment: rows } }).f);
  };
  it("shows 10 links per direction by default", async () => {
    const r = (await qlmLearningGraph({ mode_id: "hub" }, busy(60))) as Obj;
    expect(r.before).toHaveLength(10);
    expect(r.after).toHaveLength(10);
    expect(r.truncated).toEqual({ before: 60, after: 60 });
    expect(r).not.toHaveProperty("limit_lowered");
  });
  it("keeps the first 8 concepts of an edge and says how many there are", async () => {
    const r = (await qlmLearningGraph({ mode_id: "hub" }, busy(60))) as Obj;
    expect(r.before[0].concepts).toHaveLength(8);
    expect(r.before[0].concepts_total).toBe(40);
  });
  it("gives full standards for the asked-about mode and only codes for linked modes", async () => {
    const r = (await qlmLearningGraph({ mode_id: "hub" }, busy(60))) as Obj;
    expect(Object.keys(r.standards)).toEqual(["hub"]);
    expect(r.standards.hub).toHaveLength(14);
    expect(r.linked_mode_standards["pre-0"]).toEqual(["HS-PS2-0"]);
  });
  it("lowers a limit that would not fit, and says so", async () => {
    const r = (await qlmLearningGraph({ mode_id: "hub", limit: 50 }, busy())) as Obj;
    expect(size(r)).toBeLessThanOrEqual(ANSWER_BUDGET);
    expect(r.limit_lowered).toEqual({ asked: 50, used: r.before.length, why: expect.stringMatching(/^50 links per direction would not fit in one answer/) });
    expect(r.before.length).toBeLessThan(50);
    expect(r.before.length).toBe(r.after.length);
    expect(r.truncated).toEqual({ before: 60, after: 60 });
  });
  it("the default answer fits, even with long edges", async () => {
    expect(size((await qlmLearningGraph({ mode_id: "hub" }, busy())) as Obj)).toBeLessThanOrEqual(ANSWER_BUDGET);
  });
});
