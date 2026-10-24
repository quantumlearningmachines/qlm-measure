/**
 * The sandpiper format (National Tutoring Observatory's Sandpiper utterance export), and documents
 * made before it existed. The bundled sandpiper sample is SYNTHETIC: Sandpiper's documented example rows.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../src/package.js";
import { ANSWER_BUDGET, answer, answerSize } from "../src/respond.js";
import { learnlogFormats } from "../src/tools/formats.js";
import { assistanceInventory, assistanceInventoryOfRecords } from "../src/tools/inventory.js";
import { learnlogTransform, runTransform } from "../src/tools/transform.js";
import { learnlogValidate } from "../src/tools/validate.js";
import { FORMAT_IDS } from "../src/transformer.js";
import { workdir, writeFixture } from "./helpers/python.js";

type Obj = Record<string, any>;
const SIX = ["requested", "offered", "generated", "transmitted", "displayed", "accepted"];
const FIXTURES = join(ROOT, "test/fixtures/pre-sandpiper");
const BASE = "_id,session_id,sequence_id,role,content,start_time,end_time";

describe("documents made by the transformer before sandpiper was added", () => {
  const manifest = JSON.parse(readFileSync(join(FIXTURES, "MANIFEST.json"), "utf8")) as { documents: { file: string; heads: Obj }[] };
  const kept = manifest.documents.filter((d) => existsSync(join(FIXTURES, d.file)));
  it("are the real outputs recorded in the manifest", () => {
    expect(kept.map((d) => d.file)).toEqual(["oatutor.learnlog.json", "explicit-assistance-events.learnlog.json"]);
  });
  it("still validate, with the chain heads they had when they were made", async () => {
    for (const d of kept) {
      const v = (await learnlogValidate({ path: join(FIXTURES, d.file) })) as Obj;
      expect(v.valid, d.file).toBe(true);
      expect(JSON.parse(JSON.stringify(v.heads))).toEqual(d.heads);
    }
  });
  it("still inventory the same way", async () => {
    const r = (await assistanceInventoryOfRecords({ learnlog_path: join(FIXTURES, "oatutor.learnlog.json") })) as Obj;
    expect(r.sources[0].what_is_recorded.participants).toBe(12);
  });
});

describe("learnlog_formats lists sandpiper", () => {
  const f = learnlogFormats() as Obj;
  const sp = (f.formats as Obj[]).find((x) => x.id === "sandpiper")!;
  it("as a fourth format with a SYNTHETIC sample and every stage not recorded", () => {
    expect(FORMAT_IDS).toEqual(["tutormoments", "oatutor", "explicit-assistance-events", "sandpiper"]);
    expect(sp.name).toMatch(/SYNTHETIC/);
    expect(sp.observation_unit).toBe("Sandpiper utterances");
    expect(Object.keys(sp.help_stages)).toEqual(SIX);
    for (const v of Object.values(sp.help_stages) as string[]) {
      expect(v).toMatch(/^not recorded: /);
      expect(v).toMatch(/inferred/);
    }
    expect(sp.coverage.status).toBe("partial");
    expect(sp.sample.file).toBe("data/samples/sandpiper-SYNTHETIC.csv");
    expect(existsSync(join(ROOT, sp.sample.file))).toBe(true);
    expect(sp.sample.summary).toMatch(/SYNTHETIC/);
    expect(sp.sample.license).toMatch(/National Tutoring Observatory/);
    expect(sp.limitations.some((x: string) => /SYNTHETIC/.test(x))).toBe(true);
  });
  it("and the whole answer stays within the budget", () => {
    expect(answerSize(f)).toBeLessThanOrEqual(ANSWER_BUDGET);
  });
});

describe("learnlog_transform with sandpiper", () => {
  it("transforms the SYNTHETIC sample into one record per session", async () => {
    const r = (await learnlogTransform({ format: "sandpiper", use_sample: true })) as Obj;
    expect(r.source).toEqual(expect.objectContaining({ file: "sandpiper-SYNTHETIC.csv", kind: "synthetic_fixture", verified_public_sample: false }));
    expect(r.summary).toEqual({ input_rows: 8, records: 2, entries: 8, unit: "transcript_utterances", event_types: { "qlm_import:transcript_utterance_observed": 8 } });
    expect(r.warnings).toContain("This is a SYNTHETIC contract fixture, not learner data.");
    expect(r.unknowns).toEqual(expect.arrayContaining(["Utterance start time not recorded on 2 of 8 entries", "Utterance end time not recorded on 2 of 8 entries", "Coverage of the mapping: partial (" + String((learnlogFormats() as Obj).formats[3].coverage.boundary) + ")"]));
    for (const v of Object.values(r.help_stages) as string[]) expect(v).toMatch(/^not recorded/);
    expect(r.preview.entries[0].event.data.utterance).toEqual({ _id: "0", session_id: "session_001", sequence_id: "1", role: "Tutor", content: "Hello! Today we're going to work on fractions.", start_time: "00:00:00", end_time: "00:00:05" });
    expect(answerSize(r)).toBeLessThanOrEqual(ANSWER_BUDGET);
    // The sample's whole document is larger than one answer, so it is described, not sent.
    const whole = (await learnlogTransform({ format: "sandpiper", use_sample: true, include_document: true })) as Obj;
    expect(whole).not.toHaveProperty("document");
    expect(whole.document_omitted.characters).toBeGreaterThan(ANSWER_BUDGET);
    expect(answerSize(whole)).toBeLessThanOrEqual(ANSWER_BUDGET);
    const dir = workdir();
    const one = (await learnlogTransform({ format: "sandpiper", path: writeFixture(dir, "one.csv", BASE + "\n0,s1,1,Tutor,Hi,,\n"), include_document: true })) as Obj;
    expect(one.document.records[0].entries).toHaveLength(1);
    expect(answerSize(one)).toBeLessThanOrEqual(ANSWER_BUDGET);
  });
  it("reads a user's own export, and passes on the transformer's reasons for refusing one", async () => {
    const dir = workdir();
    const own = writeFixture(dir, "run-utterances.csv", BASE + ",annotator[joe][0]TUTOR_MOVE\n0,s1,1,Teacher,What do you notice?,,,PROBING\n");
    const r = (await learnlogTransform({ format: "sandpiper", path: own })) as Obj;
    expect(r.source.kind).toBe("unverified_user_input");
    expect(r.summary.entries).toBe(1);
    const zero = writeFixture(dir, "zero.csv", BASE + "\n0,s1,0,Tutor,hi,,\n");
    await expect(learnlogTransform({ format: "sandpiper", path: zero })).rejects.toThrow(/The transformer refused this input: Row 1: sequence_id must be a positive integer string/);
  });
});

describe("assistance_inventory with sandpiper", () => {
  it("reports turns by role and inferred codes by annotator and field, never as help", async () => {
    const r = (await assistanceInventory({ format: "sandpiper", use_sample: true })) as Obj;
    const s = r.sources[0];
    expect(s).toEqual(expect.objectContaining({ source: "sandpiper", import_mode: "annotated_dialogue", source_kind: "synthetic_fixture", records: 2, entries: 8 }));
    expect(s.what_is_recorded).toEqual({
      unit: "utterances",
      sessions: 2,
      utterances: 8,
      turns_by_role: { Tutor: 4, Student: 4 },
      inferred_codes: {
        basis: "inferred",
        note: expect.stringMatching(/not help events/),
        codes: 1,
        utterances_with_codes: 1,
        by_annotator: { "AI-0": 1 },
        by_field: { given_praise: 1 },
        by_annotator_and_field: { "AI-0": { given_praise: 1 } },
        identified_by: {},
      },
    });
    expect(Object.keys(s.stages)).toEqual(SIX);
    for (const v of Object.values(s.stages) as Obj[]) {
      expect(v.status).toBe("not recorded");
      expect(v.note).toMatch(/inferred/);
    }
    expect(answerSize(r)).toBeLessThanOrEqual(ANSWER_BUDGET);
  });
  it("counts identifiedBy and several annotators, and reads a saved sandpiper Learnlog file", async () => {
    const dir = workdir();
    const csv = BASE + ",annotator[joe][0]TUTOR_MOVE,annotator[joe][1]TUTOR_MOVE,annotator[joe][0]identifiedBy,annotator[AI-0][0]TUTOR_MOVE\n" +
      "0,s1,1,Tutor,What do you notice?,,,PROBING,HINT,HUMAN,HINT\n1,s1,2,STUDENT_1,Oh,,,,,,\n0,s2,1,Tutor,Hi,,,,,,\n";
    const r = (await assistanceInventoryOfRecords({ format: "sandpiper", path: writeFixture(dir, "u.csv", csv) })) as Obj;
    expect(r.sources[0].what_is_recorded).toEqual(expect.objectContaining({
      sessions: 2,
      utterances: 3,
      turns_by_role: { Tutor: 2, STUDENT_1: 1 },
      inferred_codes: expect.objectContaining({ codes: 3, utterances_with_codes: 1, by_annotator: { joe: 2, "AI-0": 1 }, by_field: { TUTOR_MOVE: 3 }, by_annotator_and_field: { joe: { TUTOR_MOVE: 2 }, "AI-0": { TUTOR_MOVE: 1 } }, identified_by: { HUMAN: 1 } }),
    }));
    const odd = (await assistanceInventoryOfRecords({ format: "sandpiper", path: writeFixture(dir, "odd.csv", BASE + ",annotator[__proto__][0]__proto__\n0,s,1,__proto__,x,,,C\n") })) as Obj;
    const sent = JSON.parse(answer(odd).content[0]!.text) as Obj;
    const recorded = sent.sources[0].what_is_recorded;
    expect(Object.getOwnPropertyDescriptor(recorded.turns_by_role, "__proto__")?.value).toBe(1);
    expect(Object.getOwnPropertyDescriptor(recorded.inferred_codes.by_annotator, "__proto__")?.value).toBe(1);
    expect(Object.getOwnPropertyDescriptor(recorded.inferred_codes.by_field, "__proto__")?.value).toBe(1);
    const run = (await runTransform({ format: "sandpiper", use_sample: true })) as Obj;
    const file = writeFixture(dir, "sp.learnlog.json", JSON.stringify(run.document));
    const again = (await assistanceInventoryOfRecords({ learnlog_path: file })) as Obj;
    expect(again.sources[0].what_is_recorded.utterances).toBe(8);
    const v = (await learnlogValidate({ path: file })) as Obj;
    expect(v.valid).toBe(true);
    expect(v.warnings).toContain("This is a SYNTHETIC contract fixture, not learner data.");
  });
});
