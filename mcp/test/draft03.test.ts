/**
 * Issue #22: Learnlog files without a QLM semantic profile (for example from `qlm-transformer convert`)
 * are checked against draft-srivastava-learnlog-03 itself: structure, timestamps and the hash chain.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isProfiled, validTimestamp, verifyDraft03, verifyLearnlog } from "../src/draft03.js";
import { ROOT } from "../src/package.js";
import { engine } from "../src/transformer.js";
import { assistanceInventoryOfRecords } from "../src/tools/inventory.js";
import { runTransform } from "../src/tools/transform.js";
import { learnlogValidate } from "../src/tools/validate.js";
import { workdir, writeFixture } from "./helpers/python.js";

type Obj = Record<string, any>;
const FIX = join(ROOT, "test/fixtures/convert");
const NAMES = ["convert-mathia-summary-SYNTHETIC", "convert-explicit-events-SYNTHETIC", "convert-ai-events-SYNTHETIC"];
const load = (n: string): Obj => JSON.parse(readFileSync(join(FIX, n + ".learnlog.json"), "utf8"));
const heads = (n: string): Obj => JSON.parse(readFileSync(join(FIX, n + ".heads.json"), "utf8"));
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** Builds a draft-03 record and recomputes its chain, so single rules can be broken one at a time. */
async function record(opts: { header?: Obj; events?: (Obj | "redacted")[]; times?: string[]; schemas?: unknown } = {}): Promise<Obj> {
  const header = { record_id: "r-1", subject: "qlm:s", hash_alg: "sha-256", created: "2026-10-25T00:00:00Z", ...opts.header };
  const events = opts.events ?? [{ name: "assist:help_requested", salt: "abc", data: {} }];
  const rh = await engine.digest(header);
  const entries: Obj[] = [];
  let prev = rh;
  for (const [i, ev] of events.entries()) {
    const time = opts.times?.[i] ?? "2026-10-25T00:00:01Z";
    const event_hash = ev === "redacted" ? "00".repeat(32) : await engine.digest(ev);
    const e: Obj = { seq: i + 1, time, event_hash, prev_hash: prev };
    e.entry_hash = await engine.digest({ record_hash: rh, ...e });
    if (ev === "redacted") e.redacted = true;
    else e.event = ev;
    entries.push(e);
    prev = e.entry_hash;
  }
  return { header, event_schemas: opts.schemas ?? ["urn:ietf:params:learnlog:events:assist"], entries };
}
/** Recomputes a record's chain after its header or events were changed on purpose. */
async function rechain(r: Obj): Promise<void> {
  const rh = await engine.digest(r.header);
  let prev = rh;
  for (const e of r.entries) {
    e.event_hash = await engine.digest(e.event);
    e.prev_hash = prev;
    e.entry_hash = await engine.digest({ record_hash: rh, seq: e.seq, time: e.time, event_hash: e.event_hash, prev_hash: e.prev_hash });
    prev = e.entry_hash;
  }
}
const file = (...records: Obj[]): Obj => ({ file_schema: "urn:ietf:params:learnlog:file:contained", serialization_format: "application/learnlog+json", records });
const fails = async (doc: unknown, message: RegExp) => expect(verifyDraft03(doc)).rejects.toThrow(message);

describe("files written by qlm-transformer convert (issue #22)", () => {
  it.each(NAMES)("%s validates, with the same heads its own checker recorded", async (n) => {
    const v = (await learnlogValidate({ path: join(FIX, n + ".learnlog.json") })) as Obj;
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
    expect(v.heads).toEqual(heads(n));
    expect(v.warnings).toContain("1 record carries no QLM semantic profile, so it was checked against draft-srivastava-learnlog-03 only: structure, timestamps and the hash chain. What its events mean wasn't checked against a profile.");
    expect(v.records[0]).toEqual(expect.objectContaining({ source: "mathia", entries: n.includes("summary") ? 1 : 3 }));
    expect(v.checked_with_draft).toMatch(/draft-srivastava-learnlog-03/);
  });
  it("keeps microsecond timestamps, which the draft allows", () => {
    expect(load(NAMES[0]!).records[0].header.created).toMatch(/\.\d{6}Z$/);
  });
  it("inventories a summary file: one importer observation, every stage not recorded", async () => {
    const r = (await assistanceInventoryOfRecords({ learnlog_path: join(FIX, `${NAMES[0]!}.learnlog.json`) })) as Obj;
    const s = r.sources[0];
    expect(s).toEqual(expect.objectContaining({ source: "mathia", import_mode: "summary", profile: "none", records: 1, entries: 1 }));
    expect(s.what_is_recorded).toEqual({ unit: "events", events: 1, event_names: { "qlm_import:summary_observed": 1 }, redacted_entries: 0, not_mapped_to_a_stage: { "qlm_import:summary_observed": 1 } });
    for (const st of Object.values(s.stages) as Obj[]) expect(st.status).toBe("not recorded");
    expect(r.cannot_conclude.length).toBeGreaterThan(0);
  });
  it("inventories an event file: only assist:help_requested counts, as requested; scaffold_provided isn't a stage", async () => {
    const r = (await assistanceInventoryOfRecords({ learnlog_path: join(FIX, `${NAMES[1]!}.learnlog.json`) })) as Obj;
    const s = r.sources[0];
    expect(s.import_mode).toBe("events");
    expect(s.stages.requested).toEqual({ status: "recorded", count: 1, note: expect.stringMatching(/^1 assist:help_requested event in this file\./) });
    for (const k of ["offered", "generated", "transmitted", "displayed", "accepted"]) {
      expect(s.stages[k]).toEqual({ status: "not recorded", note: expect.stringMatching(/draft defines no core event for this stage/) });
    }
    expect(s.what_is_recorded.not_mapped_to_a_stage).toEqual({ "assist:scaffold_provided": 1, "qlm_import:response_observed": 1 });
    expect(s.what_is_recorded.note).toMatch(/assist:scaffold_provided.*doesn't equate/);
  });
  it("catches a one-character change anywhere the chain covers", async () => {
    const dir = workdir();
    const base = load(NAMES[1]!);
    const cases: [string, (d: Obj) => void, RegExp][] = [
      ["event data", (d) => { d.records[0].entries[1].event.data.type = `${String(d.records[0].entries[1].event.data.type)}X`; }, /Record 1, entry 2: event hash mismatch\./],
      ["header", (d) => { d.records[0].header.subject = `${String(d.records[0].header.subject)}X`; }, /Record 1, entry 1: previous hash doesn't match/],
      ["entry time", (d) => (d.records[0].entries[2].time = "2026-10-08T12:00:09Z"), /Record 1, entry 3: entry hash mismatch\./],
      ["dropped entry", (d) => d.records[0].entries.splice(1, 1), /Record 1, entry 2: sequence number should be 2/],
    ];
    for (const [label, change, err] of cases) {
      const d = clone(base);
      change(d);
      const v = (await learnlogValidate({ path: writeFixture(dir, label + ".json", JSON.stringify(d)) })) as Obj;
      expect(v.valid, label).toBe(false);
      expect(v.errors[0], label).toMatch(err);
      expect(v).not.toHaveProperty("heads");
      await expect(assistanceInventoryOfRecords({ learnlog_path: join(dir, label + ".json") })).rejects.toThrow(/does not verify, so it isn't inventoried/);
    }
  });
});

describe("a document mixing profiled and unprofiled records", () => {
  it("checks both: the profile on the profiled records, the draft on all", async () => {
    const run = (await runTransform({ format: "explicit-assistance-events", use_sample: true })) as Obj;
    const doc = clone(run.document);
    doc.records.push(load(NAMES[1]!).records[0]);
    const r = await verifyLearnlog(doc);
    expect(r.unprofiled).toBe(1);
    expect(Object.keys(r.heads)).toHaveLength(6);
    const v = (await learnlogValidate({ path: writeFixture(workdir(), "mixed.json", JSON.stringify(doc)) })) as Obj;
    expect(v.valid).toBe(true);
    // Break only the profile: a wrong binding hash, with the chain recomputed so the draft check still passes.
    const bad = clone(doc);
    bad.records[0].header.semantic_profile_binding.sha256 = "00".repeat(32);
    await rechain(bad.records[0]);
    await expect(verifyDraft03(bad)).resolves.toBeTruthy();
    await expect(verifyLearnlog(bad)).rejects.toThrow("Unsupported or mismatched semantic profile binding.");
  });
  it("inventories each kind of record by its own rules", async () => {
    const run = (await runTransform({ format: "explicit-assistance-events", use_sample: true })) as Obj;
    const doc = clone(run.document);
    doc.records.push(load(NAMES[1]!).records[0]);
    const r = (await assistanceInventoryOfRecords({ learnlog_path: writeFixture(workdir(), "mixed.json", JSON.stringify(doc)) })) as Obj;
    expect(r.sources.map((s: Obj) => [s.source, s.profile ?? "qlm"])).toEqual([["explicit-assistance-events", "qlm"], ["mathia", "none"]]);
  });
  it("still uses only the profile check when every record is profiled", async () => {
    const run = (await runTransform({ format: "oatutor", use_sample: true })) as Obj;
    const r = await verifyLearnlog(run.document);
    expect(r).toEqual({ heads: run.checkpoint, unprofiled: 0, redacted: 0 });
  });
});

describe("draft-03 timestamps (Section 4)", () => {
  it.each([
    ["2026-10-25T00:00:00Z", true],
    ["2026-10-25T00:00:00.1Z", true],
    ["2026-10-25T00:00:00.123456789Z", true],
    ["2024-02-29T23:59:59Z", true],
    ["2026-10-25T00:00:00.1234567890Z", false],
    ["2026-10-25T00:00:00+00:00", false],
    ["2026-10-25t00:00:00Z", false],
    ["2026-10-25T00:00:00z", false],
    ["2026-02-29T00:00:00Z", false],
    ["2026-02-30T00:00:00Z", false],
    ["2026-13-01T00:00:00Z", false],
    ["2026-00-01T00:00:00Z", false],
    ["2026-04-31T00:00:00Z", false],
    ["2026-10-00T00:00:00Z", false],
    ["2026-10-25T24:00:00Z", false],
    ["2026-10-25T23:60:00Z", false],
    ["2026-10-25T23:59:60Z", false],
    ["2100-02-29T00:00:00Z", false],
    ["2000-02-29T00:00:00Z", true],
  ])("%s -> %s", (t, ok) => {
    expect(validTimestamp(t)).toBe(ok);
  });
  it("rejects anything that isn't text", () => {
    expect(validTimestamp(20261025 as unknown as string)).toBe(false);
  });
  it("applies to created and to every entry time", async () => {
    await fails(file(await record({ header: { created: "2026-10-25 00:00:00Z" } })), /Record 1: header\.created isn't a draft-03 timestamp/);
    await fails(file(await record({ times: ["2026-10-25T00:00:01+01:00"] })), /Record 1, entry 1: time isn't a draft-03 timestamp/);
  });
});

describe("draft-03 structure (Section 5)", () => {
  it("accepts a minimal record and returns its head", async () => {
    const r = await record();
    const out = await verifyDraft03(file(r));
    expect(out).toEqual({ heads: { "r-1": { seq: 1, entry_hash: r.entries[0].entry_hash } }, redacted: 0 });
  });
  it("accepts a record with no entries: its head is the record hash", async () => {
    const r = await record({ events: [] });
    const out = await verifyDraft03(file(r));
    expect(out.heads["r-1"]).toEqual({ seq: 0, entry_hash: await engine.digest(r.header) });
  });
  it("reports redacted entries without failing, as Section 8.3 requires", async () => {
    const r = await record({ events: [{ name: "a:b", salt: "s", data: 1 }, "redacted"] });
    expect((await verifyDraft03(file(r))).redacted).toBe(1);
    const v = (await learnlogValidate({ path: writeFixture(workdir(), "red.json", JSON.stringify(file(r))) })) as Obj;
    expect(v.valid).toBe(true);
    expect(v.warnings).toContain("1 entry is redacted. The chain still checks, but what it held can't be.");
    const two = await record({ events: ["redacted", "redacted"], header: { record_id: "r-2" } });
    const v2 = (await learnlogValidate({ path: writeFixture(workdir(), "red2.json", JSON.stringify(file(r, two))) })) as Obj;
    expect(v2.warnings).toContain("3 entries are redacted. The chain still checks, but what they held can't be.");
    expect(v2.warnings).toContain("2 records carry no QLM semantic profile, so they were checked against draft-srivastava-learnlog-03 only: structure, timestamps and the hash chain. What their events mean wasn't checked against a profile.");
    const inv = (await assistanceInventoryOfRecords({ learnlog_path: writeFixture(workdir(), "red3.json", JSON.stringify(file(r))) })) as Obj;
    expect(inv.sources[0]).toEqual(expect.objectContaining({ source: "not stated", import_mode: "not stated" }));
    expect(inv.sources[0].what_is_recorded.redacted_entries).toBe(1);
  });
  it("rejects documents that aren't draft-03 contained files", async () => {
    const bad = "Unsupported LearnLog document.";
    for (const d of [null, [], "x", { serialization_format: "application/learnlog+json", records: [{}] }, { file_schema: "x", records: [{}] }, { ...file(), records: [] }, { ...file(), records: {} }]) {
      await expect(verifyDraft03(d)).rejects.toThrow(bad);
      await expect(verifyLearnlog(d)).rejects.toThrow(bad);
    }
  });
  it("names each structural problem with its record and entry", async () => {
    const ok = await record();
    const swap = (patch: (r: Obj) => void) => {
      const r = clone(ok);
      patch(r);
      return file(r);
    };
    await fails(file("junk" as unknown as Obj), /Record 1 isn't an object\./);
    await fails(swap((r) => delete r.header), /Record 1: header must be an object\./);
    await fails(swap((r) => (r.header.record_id = " ")), /Record 1: header\.record_id must be nonempty text\./);
    await fails(swap((r) => (r.header.subject = 5)), /Record 1: header\.subject must be text\./);
    await fails(swap((r) => (r.header.producer = "me")), /Record 1: header\.producer must be an object when present\./);
    await fails(swap((r) => (r.header.hash_alg = "sha-512")), /Record 1 uses hash_alg "sha-512"\. This server checks only sha-256\./);
    await fails(swap((r) => (r.header.hash_alg = 5)), /Record 1 uses hash_alg 5\. This server checks only sha-256\./);
    await fails(swap((r) => delete r.event_schemas), /Record 1: event_schemas must list at least one schema as text\./);
    await fails(swap((r) => (r.event_schemas = [])), /Record 1: event_schemas must list at least one schema as text\./);
    await fails(swap((r) => (r.event_schemas = [""])), /Record 1: event_schemas must list at least one schema as text\./);
    await fails(swap((r) => (r.entries = {})), /Record 1: entries must be a list\./);
    await fails(swap((r) => (r.truncated = {})), /Record 1 is truncated or carries signed heads\. This server doesn't verify those, so it can't check this record\./);
    await fails(swap((r) => (r.signed_heads = [])), /Record 1 is truncated or carries signed heads/);
    await fails(swap((r) => (r.entries[0] = 7)), /Record 1, entry 1 isn't an object\./);
    for (const k of ["seq", "time", "event_hash", "prev_hash", "entry_hash"]) await fails(swap((r) => { r.entries[0] = Object.fromEntries(Object.entries(r.entries[0] as Obj).filter(([key]) => key !== k)); }), new RegExp(`Record 1, entry 1 is missing ${k}\\.`));
    await fails(swap((r) => (r.entries[0].seq = true)), /Record 1, entry 1: sequence number should be 1/);
    await fails(swap((r) => (r.entries[0].seq = 1.5)), /Record 1, entry 1: sequence number should be 1/);
    await fails(swap((r) => (r.entries[0].event_hash = "ABCD")), /Record 1, entry 1: event_hash must be lowercase hexadecimal\./);
    await fails(swap((r) => (r.entries[0].prev_hash = "abc")), /Record 1, entry 1: prev_hash must be lowercase hexadecimal\./);
    await fails(swap((r) => (r.entries[0].entry_hash = 7)), /Record 1, entry 1: entry_hash must be lowercase hexadecimal\./);
    await fails(swap((r) => (r.entries[0].redacted = true)), /Record 1, entry 1 must hold exactly one of event and redacted\./);
    await fails(swap((r) => delete r.entries[0].event), /Record 1, entry 1 must hold exactly one of event and redacted\./);
    await fails(swap((r) => ((r.entries[0].redacted = false), delete r.entries[0].event)), /Record 1, entry 1: redacted must be true\./);
    await fails(swap((r) => (r.entries[0].event = [])), /Record 1, entry 1: event must be an object\./);
    await fails(swap((r) => (r.entries[0].event.name = "")), /Record 1, entry 1: event\.name must be nonempty text\./);
    await fails(swap((r) => (r.entries[0].event.salt = 3)), /Record 1, entry 1: event\.salt must be nonempty text\./);
    await fails(swap((r) => delete r.entries[0].event.data), /Record 1, entry 1: event\.data is required\./);
    await fails(swap((r) => (r.entries[0].event.actor = "me")), /Record 1, entry 1: event\.actor must be an object with a role\./);
    await fails(swap((r) => (r.entries[0].event.actor = { role: "" })), /Record 1, entry 1: event\.actor must be an object with a role\./);
    await fails(swap((r) => (r.entries[0].event.actor = { role: "x", kind: "robot" })), /Record 1, entry 1: event\.actor\.kind must be human or software\./);
    await fails(swap((r) => (r.entries[0].event.actor = { role: "x", id: 4 })), /Record 1, entry 1: event\.actor\.id must be text\./);
    await fails(swap((r) => (r.entries[0].event.to = { kind: "human" })), /Record 1, entry 1: event\.to must be an object with a role\./);
  });
  it("says which link broke when a later entry points at the wrong one", async () => {
    const r = await record({ events: [{ name: "a:b", salt: "s", data: 1 }, { name: "a:c", salt: "t", data: 2 }] });
    r.entries[1].prev_hash = r.entries[0].event_hash;
    await fails(file(r), /Record 1, entry 2: previous hash doesn't match the entry before it\./);
  });
  it("counts several help requests, in the plural", async () => {
    const ask = (salt: string) => ({ name: "assist:help_requested", salt, data: {} });
    const r = await record({ events: [ask("a"), ask("b")], header: { source_platform: "mathia", import_mode: "events" } });
    const inv = (await assistanceInventoryOfRecords({ learnlog_path: writeFixture(workdir(), "two.json", JSON.stringify(file(r))) })) as Obj;
    expect(inv.sources[0].stages.requested).toEqual({ status: "recorded", count: 2, note: expect.stringMatching(/^2 assist:help_requested events in this file\./) });
    expect(inv.sources[0].what_is_recorded).not.toHaveProperty("note");
  });
  it("accepts every valid party form, and an actor the hash covers", async () => {
    const r = await record({ events: [{ name: "assist:help_requested", salt: "s", data: {}, actor: { role: "learner" }, to: { role: "assistant", kind: "software", id: "tutor-1", extra: 1 } }] });
    await expect(verifyDraft03(file(r))).resolves.toEqual(expect.objectContaining({ redacted: 0 }));
  });
  it("rejects two records with the same record_id", async () => {
    const r = await record();
    await fails(file(r, clone(r)), /Records 1 and 2 share record_id "r-1"\./);
  });
});

describe("isProfiled", () => {
  it("is true only for records whose header names a semantic profile binding", () => {
    expect(isProfiled({ header: { semantic_profile_binding: {} } })).toBe(true);
    expect(isProfiled({ header: {} })).toBe(false);
    expect(isProfiled({})).toBe(false);
    expect(isProfiled(null)).toBe(false);
  });
});
