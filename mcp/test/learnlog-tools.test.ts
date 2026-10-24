import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../src/package.js";
import { STAGES } from "../src/stages.js";
import { learnlogFormats } from "../src/tools/formats.js";
import { assistanceInventoryOfRecords } from "../src/tools/inventory.js";
import { learnlogTransform, runTransform } from "../src/tools/transform.js";
import { learnlogValidate } from "../src/tools/validate.js";
import { workdir, writeFixture } from "./helpers/python.js";

const SIX = ["requested", "offered", "generated", "transmitted", "displayed", "accepted"];
type Obj = Record<string, any>;

describe("the six assistance stages of draft-srivastava-learnlog-03, Section 2.2", () => {
  it("lists each stage once, in the draft's order, each with its meaning and what it doesn't show", () => {
    expect(STAGES.map((s) => s.stage)).toEqual(SIX);
    for (const s of STAGES) expect(s.meaning).toMatch(/doesn't|does not/);
  });
});

describe("learnlog_formats", () => {
  const f = learnlogFormats() as Obj;
  it("lists the three transformer formats with what each records, stage by stage", () => {
    expect(f.formats.map((x: Obj) => x.id)).toEqual(["tutormoments", "oatutor", "explicit-assistance-events"]);
    const [tm, oa, ex] = f.formats as Obj[];
    expect(Object.keys(tm!.help_stages)).toEqual(SIX);
    expect(Object.values(tm!.help_stages).every((v) => String(v).startsWith("not recorded"))).toBe(true);
    expect(Object.values(oa!.help_stages).every((v) => String(v).startsWith("not recorded"))).toBe(true);
    expect(ex!.help_stages.requested).toBe("recorded when the export asserts it (help_requested)");
    expect(ex!.help_stages.offered).toMatch(/^not recorded/);
    expect(ex!.help_stages.accepted).toMatch(/^not recorded/);
    expect(ex!.also_recorded).toMatch(/learner_response_observed/);
    expect(tm!.sample).toEqual(expect.objectContaining({ file: "data/samples/tutormoments-real-transcripts.jsonl", license: "CC-BY-4.0" }));
    expect(tm!.limitations.length).toBeGreaterThan(3);
  });
  it("names the three preprint datasets, none of them bundled, and why", () => {
    expect(f.preprint_datasets.map((d: Obj) => d.argument)).toEqual(["zenodo_zip", "idetrace_json", "assistments_csv"]);
    for (const d of f.preprint_datasets) expect(d.bundled).toBe(false);
  });
  it("says what it doesn't show and where the transformer came from", () => {
    expect(f.does_not_show.length).toBeGreaterThan(0);
    expect(f.transformer.vendored_from).toMatch(/qlm-measure@2441968/);
  });
});

describe("learnlog_transform", () => {
  it("transforms the bundled TutorMoments sample and recognizes it as the pinned public excerpt", async () => {
    const r = (await learnlogTransform({ format: "tutormoments", use_sample: true })) as Obj;
    expect(r.source).toEqual(expect.objectContaining({ file: "tutormoments-real-transcripts.jsonl", kind: "verified_public_sample", verified_public_sample: true }));
    expect(r.source.provenance.license).toBe("CC-BY-4.0");
    expect(r.summary).toEqual({ input_rows: 2, records: 2, entries: 310, unit: "dialogue_turns", event_types: { "qlm_import:dialogue_turn_observed": 310 } });
    expect(Object.keys(r.heads)).toHaveLength(2);
    expect(r.preview.entries).toHaveLength(1);
    expect(r).not.toHaveProperty("document");
    expect(Object.values(r.help_stages).every((v) => String(v).startsWith("not recorded"))).toBe(true);
    expect(r.does_not_show.length).toBeGreaterThan(0);
  });
  it("converts every OATutor participant row into a record and keeps what the table doesn't report", async () => {
    const run = (await runTransform({ format: "oatutor", use_sample: true, tenant: "district-7" })) as Obj;
    expect(run.document.records).toHaveLength(12);
    const r = (await learnlogTransform({ format: "oatutor", use_sample: true, tenant: "district-7" })) as Obj;
    expect(r.unknowns).toContain("Actual help use not reported in participant table on 12 of 12 entries");
  });
  it("transforms a user's own file, which is not a pinned sample", async () => {
    const dir = workdir();
    const sample = readFileSync(join(ROOT, "data/samples/explicit-assistance-SYNTHETIC.jsonl"), "utf8");
    const own = writeFixture(dir, "mine.jsonl", sample.replaceAll("synthetic-contract-test", "my-product"));
    const r = (await learnlogTransform({ format: "explicit-assistance-events", path: own })) as Obj;
    expect(r.source).toEqual(expect.objectContaining({ file: "mine.jsonl", kind: "unverified_user_input", verified_public_sample: false }));
    expect(r.source).not.toHaveProperty("provenance");
    expect(r.summary.entries).toBe(5);
  });
  it("marks the synthetic fixture as synthetic", async () => {
    const r = (await learnlogTransform({ format: "explicit-assistance-events", use_sample: true })) as Obj;
    expect(r.source.kind).toBe("synthetic_fixture");
    expect(r.warnings).toContain("This is a SYNTHETIC contract fixture, not learner data.");
  });
  it("refuses unclear input and passes on the transformer's own reasons", async () => {
    await expect(learnlogTransform({ format: "tutormoments" })).rejects.toThrow(/Give either path or use_sample: true/);
    await expect(learnlogTransform({ format: "tutormoments", path: "/x", use_sample: true })).rejects.toThrow(/Give either path or use_sample: true/);
    await expect(learnlogTransform({ format: "nope" as "tutormoments", use_sample: true })).rejects.toThrow(/Unknown format "nope"/);
    const dir = workdir();
    const bad = writeFixture(dir, "bad.csv", "anonUserID,lesson,condition\n1,L,Unknown\n");
    await expect(learnlogTransform({ format: "oatutor", path: bad })).rejects.toThrow(/The transformer refused this input: Row 1: the OATutor adapter requires a documented assigned condition/);
  });
});

describe("learnlog_validate", () => {
  it("passes a transformer-made Learnlog file and lists the unknowns each record keeps", async () => {
    const dir = workdir();
    const run = (await runTransform({ format: "explicit-assistance-events", use_sample: true })) as Obj;
    const file = writeFixture(dir, "doc.learnlog.json", JSON.stringify(run.document));
    const v = (await learnlogValidate({ path: file })) as Obj;
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.records).toHaveLength(5);
    expect(v.records[0].unknowns).toEqual(expect.arrayContaining([expect.stringMatching(/^Source event time not recorded on/)]));
    expect(v.heads).toEqual(run.checkpoint);
    expect(v.warnings).toContain("This is a SYNTHETIC contract fixture, not learner data.");
    expect(v.not_checked.length).toBeGreaterThan(0);
  });
  it("lists every kind of unknown a dialogue or summary record keeps", async () => {
    const dir = workdir();
    for (const format of ["tutormoments", "oatutor"] as const) {
      const run = (await runTransform({ format, use_sample: true })) as Obj;
      const v = (await learnlogValidate({ path: writeFixture(dir, `${format}.json`, JSON.stringify(run.document)) })) as Obj;
      expect(v.valid).toBe(true);
      const all = v.records.flatMap((r: Obj) => r.unknowns).join("\n");
      expect(all).toMatch(/Phase not recorded/);
      expect(all).toMatch(/Model version not recorded/);
      expect(all).toMatch(/No denominator/);
    }
  });
  it("fails a file whose chain was changed after it was made, naming the check", async () => {
    const dir = workdir();
    const run = (await runTransform({ format: "explicit-assistance-events", use_sample: true })) as Obj;
    run.document.records[0].entries[0].event.data.lifecycle.event_type = "help_displayed";
    run.document.records[0].entries[0].event.data.assistance = "help_displayed";
    run.document.records[0].entries[0].event.data.raw_source_fields.event_type = "help_displayed";
    const v = (await learnlogValidate({ path: writeFixture(dir, "t.json", JSON.stringify(run.document)) })) as Obj;
    expect(v.valid).toBe(false);
    expect(v.errors).toEqual(["LearnLog event hash mismatch."]);
    expect(v).not.toHaveProperty("heads");
  });
  it("reports files that are not JSON or not Learnlog, and strips a byte-order mark", async () => {
    const dir = workdir();
    const notJson = (await learnlogValidate({ path: writeFixture(dir, "x.json", "{nope") })) as Obj;
    expect(notJson.valid).toBe(false);
    expect(notJson.errors[0]).toMatch(/^Not valid JSON: /);
    const other = (await learnlogValidate({ path: writeFixture(dir, "y.json", "﻿" + JSON.stringify({ file_schema: "x", records: [{ header: 5 }, "junk"] })) })) as Obj;
    expect(other.valid).toBe(false);
    expect(other.errors).toEqual(["Unsupported LearnLog document."]);
    expect(other.warnings).toContain("The file starts with a byte-order mark, which was ignored.");
    expect(other.records).toEqual([{ record: 1, unknowns: [] }, { record: 2, unknowns: [] }]);
    const arr = (await learnlogValidate({ path: writeFixture(dir, "z.json", "[1]") })) as Obj;
    expect(arr.records).toEqual([]);
  });
});

describe("assistance_inventory on Learnlog records", () => {
  it("TutorMoments: dialogue turns only, every help stage not recorded", async () => {
    const r = (await assistanceInventoryOfRecords({ format: "tutormoments", use_sample: true })) as Obj;
    const s = r.sources[0];
    expect(s.source).toBe("tutormoments");
    expect(Object.keys(s.stages)).toEqual(SIX);
    for (const v of Object.values(s.stages) as Obj[]) expect(v.status).toBe("not recorded");
    expect(s.what_is_recorded).toEqual({ unit: "dialogue turns", sessions: 2, turns: 310, turns_by_speaker: { Tutor: expect.any(Number), Student: expect.any(Number) } });
    expect(Number(s.what_is_recorded.turns_by_speaker.Tutor) + Number(s.what_is_recorded.turns_by_speaker.Student)).toBe(310);
    expect(r.cannot_conclude.length).toBeGreaterThan(2);
  });
  it("OATutor: assigned conditions, never observed help", async () => {
    const r = (await assistanceInventoryOfRecords({ format: "oatutor", use_sample: true })) as Obj;
    const s = r.sources[0];
    expect(s.what_is_recorded.unit).toBe("participant summaries");
    expect(Object.values(s.what_is_recorded.assigned_condition).reduce((a: number, b) => a + (b as number), 0)).toBe(12);
    expect(s.what_is_recorded.actual_help_use).toEqual({ not_reported_in_participant_table: 12 });
  });
  it("lifecycle events: a count for each asserted stage, not recorded for the rest", async () => {
    const r = (await assistanceInventoryOfRecords({ format: "explicit-assistance-events", use_sample: true })) as Obj;
    const s = r.sources[0];
    expect(s.stages.requested).toEqual({ status: "recorded", count: 1, note: expect.stringMatching(/assertions/) });
    expect(s.stages.generated.count).toBe(1);
    expect(s.stages.transmitted.count).toBe(1);
    expect(s.stages.displayed.count).toBe(1);
    expect(s.stages.offered.status).toBe("not recorded");
    expect(s.stages.accepted.status).toBe("not recorded");
    expect(s.learner_response_observed).toBe(1);
    expect(s.capture_declared).toEqual({ complete_within_boundary: 5 });
  });
  it("a lifecycle file with no display events says not recorded, never zero or none", async () => {
    const dir = workdir();
    const lines = readFileSync(join(ROOT, "data/samples/explicit-assistance-SYNTHETIC.jsonl"), "utf8").trim().split("\n").filter((l) => !l.includes('"help_displayed"'));
    const own = writeFixture(dir, "no-display.jsonl", lines.join("\n") + "\n");
    const r = (await assistanceInventoryOfRecords({ format: "explicit-assistance-events", path: own })) as Obj;
    expect(r.sources[0].stages.displayed).toEqual({ status: "not recorded", note: expect.stringMatching(/not proof that no help was shown/) });
  });
  it("reads a Learnlog file made earlier, and refuses one that does not verify", async () => {
    const dir = workdir();
    const run = (await runTransform({ format: "oatutor", use_sample: true })) as Obj;
    const file = writeFixture(dir, "doc.json", JSON.stringify(run.document));
    const r = (await assistanceInventoryOfRecords({ learnlog_path: file })) as Obj;
    expect(r.sources[0].records).toBe(12);
    run.document.records[0].header.source_kind = "verified_public_sample!";
    writeFileSync(file, JSON.stringify(run.document));
    await expect(assistanceInventoryOfRecords({ learnlog_path: file })).rejects.toThrow(/does not verify, so it isn't inventoried: /);
    await expect(assistanceInventoryOfRecords({ learnlog_path: writeFixture(dir, "bad.json", "{") })).rejects.toThrow(/isn't valid JSON/);
  });
});

describe("unknowns and warnings from records that may be malformed", () => {
  it("skips what isn't a record and reads what is", async () => {
    const { unknownsOf, sourceWarnings } = await import("../src/transformer.js");
    const records = [
      5,
      { header: 5 },
      { header: {}, entries: "x" },
      { header: { semantic_mapping: 5 } },
      { header: { assistance_coverage: "a_b", semantic_mapping: { coverage: { status: "partial" } } }, entries: [5, { event: { data: { original_source_timestamp: "t", assistance_context: { phase: "practice", model_version: "m" }, missing_metrics: "x", help_evidence: {} } } }, { event: { data: { assistance_context: 5, missing_metrics: ["preTest"] } } }] },
    ];
    expect(unknownsOf(records)).toEqual(["Help coverage: a b", "Coverage of the mapping: partial", "Metric preTest missing on 1 of 2 entries"]);
    expect(sourceWarnings(records)).toEqual([]);
  });
});

describe("assistance_inventory chooses what to read", () => {
  it("records through the same entry point, and a missing Learnlog file is refused plainly", async () => {
    const { assistanceInventory } = await import("../src/tools/inventory.js");
    const r = (await assistanceInventory({ format: "oatutor", use_sample: true })) as Obj;
    expect(r.kind).toBe("learnlog_records");
    await expect(assistanceInventory({ learnlog_path: "/no/such/learnlog.json" })).rejects.toThrow(/There is no file at \/no\/such\/learnlog.json/);
  });
  it("a lifecycle file with requests only has no learner responses", async () => {
    const dir = workdir();
    const lines = readFileSync(join(ROOT, "data/samples/explicit-assistance-SYNTHETIC.jsonl"), "utf8").trim().split("\n").filter((l) => l.includes('"help_requested"'));
    const r = (await assistanceInventoryOfRecords({ format: "explicit-assistance-events", path: writeFixture(dir, "req.jsonl", lines.join("\n")) })) as Obj;
    expect(r.sources[0].learner_response_observed).toBe(0);
    expect(r.sources[0].stages.requested.count).toBe(1);
  });
});
