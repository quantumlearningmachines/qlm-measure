import { describe, expect, it } from "vitest";
import { analyzeIdetrace, analyzeZenodo, crossSourceEpisodes, analyzeAssistments } from "../src/episodes.js";
import { assistanceInventory } from "../src/tools/inventory.js";
import { PINNED, PUBLISHED, compare, preprintInventory, publishedFigures, type Published } from "../src/tools/preprint.js";
import { assistmentsCsv, idetraceJson, zenodoZip } from "./helpers/fixtures.js";
import { workdir, writeFixture } from "./helpers/python.js";

type Obj = Record<string, any>;

describe("published figures, with no files given", () => {
  const p = publishedFigures() as Obj;
  it("are the preprint's Table 2 and Table 4 numbers, labeled as not recomputed", () => {
    expect(p.kind).toBe("published figures, not recomputed");
    expect(p.inventory_table_2.total_request_observations).toBe(1109);
    expect(p.inventory_table_2.zenodo.help_request_subtypes).toEqual([{ label: "Hint button is clicked", count: 960 }, { label: "Hint retry is clicked", count: 90 }]);
    expect(p.inventory_table_2.zenodo.native_input_count).toBe(1060271);
    expect(p.inventory_table_2.idetrace.native_input_count).toBe(30283);
    expect(p.inventory_table_2.request_rate).toMatch(/^not established/);
    expect(p.episodes_table_4.pooled.overstatement_pct).toBe(39.1);
  });
  it("read each release in the draft's six stages, as Table 4 does", () => {
    const s = p.stages;
    expect(s.zenodo.requested.count).toBe(1050);
    expect(s.zenodo.offered).toBe("not recorded");
    expect(s.zenodo.generated.status).toBe("not mapped");
    expect(s.zenodo.displayed).toEqual(expect.objectContaining({ count: 738, not_displayed: 312, not_displayed_with_error: 266 }));
    expect(s.zenodo.accepted).toEqual(expect.objectContaining({ count: 300, revealed_only: 129 }));
    expect(s.idetrace.requested.count).toBe(59);
    expect(s.idetrace.displayed.count).toBe(59);
    expect(s.idetrace.never_asked).toEqual(expect.objectContaining({ records: 35, records_never_asked: 17 }));
    expect(s.assistments.requested).toEqual(expect.objectContaining({ count: 814067, with_hints: 792278, asked_for_steps: 21789, hints_to_the_answer: 683138 }));
    expect(s.assistments.offered).toEqual(expect.objectContaining({ status: "candidates only", count: 110513 }));
    expect(s.assistments.never_asked).toEqual({ students: 46544, never_asked_on_main_problems: 14097, never_asked_anywhere_including_hints_inside_steps: 13607 });
    expect(s.assistments.displayed).toMatch(/^not recorded/);
  });
  it("say what can't be concluded and what isn't shown", () => {
    expect(p.cannot_conclude.length).toBeGreaterThan(4);
    expect(p.does_not_show.length).toBeGreaterThan(0);
    expect(p.datasets.every((d: Obj) => d.bundled === false)).toBe(true);
  });
  it("are what assistance_inventory answers when nothing is given", async () => {
    expect(await assistanceInventory({})).toEqual(p);
  });
});

describe("compare", () => {
  it("counts every leaf and reports each difference with its path", () => {
    expect(compare({ a: 1, b: [1, 2], c: { d: "x" } }, { a: 1, b: [1, 2], c: { d: "x" } })).toEqual({ numbers_compared: 4, matches: true, mismatches: [] });
    expect(compare({ a: 1, b: [1, 2] }, { a: 2, b: [1], e: 5 })).toEqual({
      numbers_compared: 4,
      matches: false,
      mismatches: [
        { path: "$.a", published: 1, recomputed: 2 },
        { path: "$.b[1]", published: 2, recomputed: null },
        { path: "$.e", published: null, recomputed: 5 },
      ],
    });
    expect(compare([1], { 0: 1 }).matches).toBe(false);
  });
});

describe("recomputing from the user's files", () => {
  const dir = workdir();
  const zip = writeFixture(dir, "z.zip", zenodoZip());
  const ide = writeFixture(dir, "d.json", idetraceJson());
  const csv = writeFixture(dir, "a.csv", assistmentsCsv());

  it("refuses IDETrace without the research opt-in, and mixed questions", async () => {
    await expect(preprintInventory({ idetrace_json: ide })).rejects.toThrow(/allow_idetrace_research: true/);
    await expect(assistanceInventory({ zenodo_zip: zip, use_sample: true, format: "oatutor" })).rejects.toThrow(/Ask about one thing at a time/);
    await expect(assistanceInventory({ path: zip })).rejects.toThrow(/Name the export's format/);
    await expect(assistanceInventory({ learnlog_path: zip, format: "oatutor" })).rejects.toThrow(/either learnlog_path or format/);
  });

  it("files that aren't the pinned releases are counted but not compared with the preprint", async () => {
    const r = (await assistanceInventory({ zenodo_zip: zip, idetrace_json: ide, allow_idetrace_research: true, assistments_csv: csv })) as Obj;
    expect(r.kind).toBe("recomputed from your files");
    expect(r.inputs.zenodo.is_the_preprint_release).toBe(false);
    expect(r.inventory_table_2.total_request_observations).toBe(16);
    expect(r.episodes_table_4.pooled.naive_requests).toBe(15);
    expect(r.comparison_with_preprint.zenodo).toMatch(/^not compared/);
    expect(r.comparison_with_preprint.idetrace).toMatch(/^not compared/);
    expect(r.comparison_with_preprint.assistments).toMatch(/^not compared/);
    expect(r.comparison_with_preprint).not.toHaveProperty("pooled");
    expect(r.stages.zenodo.requested.count).toBe(9);
    expect(r.stages.assistments.offered.count).toBe(3);
    expect(r.does_not_show.length).toBeGreaterThan(0);
  });

  it("only one source: no pooled numbers and no total", async () => {
    const r = (await preprintInventory({ assistments_csv: csv })) as Obj;
    expect(r).not.toHaveProperty("inventory_table_2");
    expect(r.assistments_table_4.main_problem_opportunities).toBeGreaterThan(0);
    const z = (await preprintInventory({ zenodo_zip: zip })) as Obj;
    expect(z.inventory_table_2).not.toHaveProperty("total_request_observations");
  });

  it("the pinned releases are compared number by number, and any difference is named", async () => {
    // Pin the synthetic files and publish their own numbers, then change one published number.
    const zA = analyzeZenodo(zenodoZipBytes());
    const iA = analyzeIdetrace(idetraceJson());
    const aA = await analyzeAssistments(csv);
    const ep = crossSourceEpisodes(zA, iA) as Obj;
    const published: Published = {
      tableTwo: {
        sources: [
          { source_id: "zenodo.17551130", ...zA.inventory },
          { source_id: "tutortrace.deployment8", ...iA.inventory },
        ],
        aggregate: { assistance_request_observations: 16 },
      },
      crossSource: ep,
      assistments: JSON.parse(JSON.stringify(aA)),
    };
    const pins = { zenodo: zA.input_sha256, idetrace: iA.input_sha256, assistments: aA.input_sha256 as string };
    const ok = (await preprintInventory({ zenodo_zip: zip, idetrace_json: ide, allow_idetrace_research: true, assistments_csv: csv }, pins, published)) as Obj;
    for (const k of ["zenodo", "idetrace", "pooled", "assistments"]) expect(ok.comparison_with_preprint[k].matches, k).toBe(true);
    expect(ok.comparison_with_preprint.zenodo.numbers_compared).toBeGreaterThan(30);
    published.assistments.students = 1;
    const bad = (await preprintInventory({ assistments_csv: csv }, pins, published)) as Obj;
    expect(bad.comparison_with_preprint.assistments.mismatches).toEqual([{ path: "$.students", published: 1, recomputed: aA.students }]);
  });

  it("the real pins are the preprint's published input hashes", () => {
    expect(PINNED.zenodo).toBe((PUBLISHED.crossSource.inputs as Obj).zenodo_sha256);
    expect(PINNED.idetrace).toBe((PUBLISHED.crossSource.inputs as Obj).idetrace_sha256);
    expect(PINNED.assistments).toBe(PUBLISHED.assistments.input_sha256);
  });
});

function zenodoZipBytes(): Buffer {
  return zenodoZip();
}

describe("stage views when a release recorded none of an outcome", () => {
  it("count zero rather than leave a gap", async () => {
    const { zenodoStages, assistmentsStages } = await import("../src/tools/preprint.js");
    const z = zenodoStages({ native_log_label_counts: {} }, { requests: 0, shown: 0, not_shown: 0, outcomes: {} }) as Obj;
    expect(z.displayed.not_displayed_with_error).toBe(0);
    expect(z.accepted).toEqual(expect.objectContaining({ count: 0, revealed_only: 0 }));
    const a = assistmentsStages({ episodes: {}, students: 0, students_who_ever_requested: 0, checks: { students_who_ever_requested_including_hints_inside_scaffolding: 0 } }) as Obj;
    expect(a.requested).toEqual(expect.objectContaining({ count: 0, with_hints: 0, asked_for_steps: 0, hints_to_the_answer: 0 }));
    expect(a.offered.count).toBe(0);
  });
});
