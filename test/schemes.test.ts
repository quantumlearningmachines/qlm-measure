import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { sealEvent, computeEventHash, detectScheme, verifyChain, sha256Hex } from "../src/schemes/node.js";
import { listSchemes, getScheme, sealEventWith, verifyChainWith, computeEventHashAsyncWith, fnv1a64Hex, djb2Hex, sortKeysDeep } from "../src/schemes/index.js";

const VEC = join(__dirname, "..", "schema", "vectors", "chains");
const vectors = readdirSync(VEC).filter((f) => f.endsWith(".json")).map((f) => ({ name: f, ...JSON.parse(readFileSync(join(VEC, f), "utf-8")) }));

describe("chain schemes: vectors sealed by the original product code", () => {
  for (const v of vectors) {
    it(`${v.name}: verifies as ${v.expect.hash_scheme}${v.expect.clean ? "" : " (not clean)"}`, () => {
      const r = verifyChain(v.events, { family: v.family });
      expect(r.clean).toBe(v.expect.clean);
      expect(r.stats.hash_scheme).toBe(v.expect.hash_scheme);
      if (v.expect.tampered !== undefined) {
        expect(r.stats.tampered).toBe(v.expect.tampered);
        expect(r.errors.some((e) => e.startsWith(`[${v.expect.tampered_index}] hash mismatch`))).toBe(true);
      }
      if (v.expect.schemes) expect(r.stats.schemes).toEqual(v.expect.schemes);
    });
    if (v.expect.clean) {
      it(`${v.name}: re-sealing every event with its scheme reproduces the stored hash byte for byte`, () => {
        const family = getScheme(v.scheme);
        v.events.forEach((e: Record<string, unknown>, i: number) => {
          const prev = i === 0 ? (family.genesis ?? "") : String(v.events[i - 1][family.hashField]);
          const id = detectScheme(e, v.family, prev)!;
          expect(id).not.toBeNull();
          const scheme = getScheme(id);
          const { [scheme.hashField]: stored, ...rest } = e;
          expect(computeEventHash(rest, id, prev)).toBe(stored);
          expect(sealEvent(rest, id, prev)[scheme.hashField]).toBe(stored);
        });
      });
    }
  }
});

describe("chain schemes: behaviour", () => {
  it("lists twenty-seven schemes across nineteen families, clinical newest first", () => {
    const ids = listSchemes().map((s) => s.id);
    expect(ids.slice(0, 5)).toEqual(["tpc/clinical-v4", "tpc/clinical-v3", "tpc/clinical-v2", "tpc/clinical-v1", "play/clinical-clin-1.0"]);
    expect(ids.slice(5)).toEqual(["play/emit-1", "play/measure-session-1", "play/encounter-fnv64-1", "play/research-provenance-1", "qcore/qinverse-djb2-1", "studio/loop-1", "dp/ledger-v3", "tpc/dse-journal-1", "yardstick/spine-1", "labpath/learning-evidence-v1", "tpc/transcript-1", "tpc/differential-commit-2", "tpc/differential-commit-1", "tpc/rct-input-1",
      "play/world-trace-identity-1", "play/world-trace-tsim-1", "play/world-trace-1", "tpc/yardstick-record-2", "tpc/yardstick-record-1", "tpc/intervention-1", "tpc/rehearsal-stage-1", "yardstick/activity-1"]);
    expect(new Set(listSchemes().map((s) => s.family)).size).toBe(19);
  });
  it("djb2Hex equals the world components' verbatim djb2 (>>> 0 per step) on every string", () => {
    const worldDjb2 = (str: string): string => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, "0"); };
    const samples = ["", "a", "00000000[0,\"missionStart\",{}]", "ünïcödé 🧪 \uD83D", "x".repeat(5000), JSON.stringify({ a: [1, 2, { b: "c" }] })];
    for (let i = 0; i < 2000; i++) samples.push(Array.from({ length: (i * 7) % 40 }, (_, j) => String.fromCharCode((i * 31 + j * 17) % 0xffff)).join(""));
    for (const s of samples) expect(djb2Hex(s)).toBe(worldDjb2(s));
  });
  it("tpc/yardstick-record-1 does not cover the payload; tpc/yardstick-record-2 does", () => {
    const base = { sequence: 0, type: "protocol_commit", studyId: "s", timestamp: "t", payload: { title: "A", arms: ["x"] }, prevDigest: "0".repeat(64) };
    const edited = { ...base, payload: { title: "B", arms: ["y", "z"] } };
    expect(computeEventHash(base, "tpc/yardstick-record-1")).toBe(computeEventHash(edited, "tpc/yardstick-record-1"));
    expect(computeEventHash(base, "tpc/yardstick-record-2")).not.toBe(computeEventHash(edited, "tpc/yardstick-record-2"));
    // a v1 sequence continued under v2 verifies as one chain and reports the newer scheme
    const r0 = sealEvent(base, "tpc/yardstick-record-1");
    const r1 = sealEvent({ sequence: 1, type: "enrollment", studyId: "s", timestamp: "t2", payload: { participantCode: "P" }, prevDigest: r0.digest }, "tpc/yardstick-record-2");
    const r = verifyChain([r0, r1], { family: "tpc/yardstick-record" });
    expect(r.clean).toBe(true); expect(r.stats.hash_scheme).toBe("tpc/yardstick-record-2"); expect(r.stats.schemes).toEqual({ "tpc/yardstick-record-1": 1, "tpc/yardstick-record-2": 1 });
  });
  it("play/world-trace: detection picks the variant from worldId / schemaVersion", () => {
    const e = { seq: 0, type: "commit", payload: { option: "a" }, prevHash: "00000000", worldId: "soundlab", tSim: 2, schemaVersion: "world-trace/1" };
    expect(getScheme("play/world-trace-tsim-1").applies(e)).toBe(true); expect(getScheme("play/world-trace-1").applies(e)).toBe(false);
    const c = { ...e, worldId: "cybersim", schemaVersion: "world-trace/2", missionId: null, band: "6-8", seed: 1 };
    expect(getScheme("play/world-trace-identity-1").applies(c)).toBe(true); expect(getScheme("play/world-trace-1").applies(c)).toBe(false);
    expect(getScheme("play/world-trace-1").applies({ ...e, worldId: "ratiorate" })).toBe(true);
  });
  it("built-in digests: FNV-1a 64 and djb2 over UTF-16 code units, matching the products' functions", () => {
    expect(fnv1a64Hex("")).toBe("cbf29ce484222325");
    expect(fnv1a64Hex("a")).toBe("af63dc4c8601ec8c");
    expect(djb2Hex("")).toBe("00001505");
    expect(djb2Hex("abc")).toBe("0b885c8b");
    // a non-BMP character is two UTF-16 units, as charCodeAt sees it
    expect(fnv1a64Hex("\u{1F600}")).not.toBe(fnv1a64Hex("\uD83D"));
    expect(listSchemes().find((s) => s.id === "play/encounter-fnv64-1")!.digest).toBe("fnv1a64");
    expect(listSchemes().find((s) => s.id === "qcore/qinverse-djb2-1")!.digest).toBe("djb2-32");
  });
  it("play/measure-session-1: truncated to 32 hex, unlinked, duplicates still caught", () => {
    const v = vectors.find((v) => v.name === "play-measure-session-1.json")!;
    for (const e of v.events) expect(String(e.event_hash)).toHaveLength(32);
    expect(listSchemes().find((s) => s.id === "play/measure-session-1")!.link).toBe("none");
    const r = verifyChain([v.events[0], v.events[0]], { scheme: "play/measure-session-1" });
    expect(r.stats.duplicates).toBe(1); expect(r.stats.gaps).toBe(0);
  });
  it("tpc/dse-journal-1: implicit link — sealing needs prev, verification threads it, an edit breaks every later entry", () => {
    const v = vectors.find((v) => v.name === "tpc-dse-journal-1.json")!;
    expect(() => sealEvent({ seq: 0, eventType: "tick", data: {} }, "tpc/dse-journal-1")).toThrow(/prev is required/);
    const edited = v.events.map((e: Record<string, unknown>) => ({ ...e }));
    edited[1] = { ...edited[1], data: { changed: true } };
    const r = verifyChain(edited, { scheme: "tpc/dse-journal-1" });
    expect(r.errors).toContain("[1] hash mismatch (tampered)");
    expect(r.stats.tampered).toBe(1); // later entries still verify against their stored predecessors' hashes
    const cut = [v.events[0], v.events[2]];
    expect(verifyChain(cut, { scheme: "tpc/dse-journal-1" }).stats.tampered).toBe(1); // a missing entry surfaces as a mismatch
  });
  it("dp/ledger-v3: first event has no previousEventHash; a stored row that dropped the key still verifies", () => {
    const v = vectors.find((v) => v.name === "dp-ledger-v3.json")!;
    expect("previousEventHash" in v.events[0]).toBe(false);
    expect(verifyChain(v.events, { scheme: "dp/ledger-v3" }).clean).toBe(true);
    const wrongGenesis = [{ ...v.events[0], previousEventHash: "genesis" }];
    expect(verifyChain(wrongGenesis, { scheme: "dp/ledger-v3" }).errors.some((e) => e.includes("must be absent"))).toBe(true);
  });
  it("labpath/learning-evidence-v1: locale key order at every depth; undefined values are not hashed", () => {
    const e = { event_id: "x", hash: "junk", prev_hash: null, action: { zeta: 1, Alpha: 2, _meta: 3, beta: undefined } };
    expect(getScheme("labpath/learning-evidence-v1").canonical(e)).toBe('{"action":{"_meta":3,"Alpha":2,"zeta":1},"event_id":"x","prev_hash":null}');
  });
  it("yardstick/spine-1: Python text forms (True/False) are what the hash covers", () => {
    const e = { enrollment_id: "e1", item_id: "i1", response: "B", correct: true, previous_hash: "" };
    expect(getScheme("yardstick/spine-1").canonical(e)).toBe(":e1:i1:B:True");
    expect(getScheme("yardstick/spine-1").canonical({ ...e, correct: false, previous_hash: "ab" })).toBe("ab:e1:i1:B:False");
    expect(getScheme("yardstick/spine-1").canonical({ ...e, previous_hash: null })).toBe("None:e1:i1:B:True"); // f"{None}"
  });
  it("sortKeysDeep as JavaScript runs it: array-index keys first, UTF-16 order, __proto__ dropped (the Python twin copies this)", () => {
    const text = '{"b":1,"10":2,"9":3,"!":4,"1":5,"｡":6,"😀":7,"4294967295":8,"01":9,"a":{"2":10,"__proto__":{"x":1},"z":[{"y":1,"0":2}]}}';
    expect(JSON.stringify(sortKeysDeep(JSON.parse(text)))).toBe('{"1":5,"9":3,"10":2,"!":4,"01":9,"4294967295":8,"a":{"2":10,"z":[{"0":2,"y":1}]},"b":1,"😀":7,"｡":6}');
  });
  it("v4: only events with event_kind; payload keys sorted at every depth; v1-v3 never claim such events", () => {
    const base = { type: "clinical_evidence", learner: "l", encounter: "e", turn: 0, construct: "c", signal: "partial", scaffold: 1, extractor: "x", confidence: 0.5, prev_hash: "genesis" };
    const proc = { ...base, event_kind: "chart.item", payload: { z: 1, a: { y: [3, { q: 1, p: 2 }], x: null } } };
    expect(getScheme("tpc/clinical-v4").canonical(proc)).toBe('["clinical_evidence","l","e",0,"c","partial",1,"x",0.5,"genesis",null,null,null,"chart.item",{"a":{"x":null,"y":[3,{"p":2,"q":1}]},"z":1}]');
    for (const id of ["tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3"]) expect(getScheme(id).applies(proc)).toBe(false);
    expect(getScheme("tpc/clinical-v4").applies(base)).toBe(false);
    const r = verifyChain([sealEvent({ ...proc, event_kind: "Chart", payload: [] }, "tpc/clinical-v4")], { scheme: "tpc/clinical-v4" });
    expect(r.errors).toEqual(["[0] invalid event_kind: Chart", "[0] payload must be an object"]);
  });
  describe("tpc/differential-commit-2 (TPC-SPEC-002 E4)", () => {
    const good = {
      type: "differential_commit", learner: "l", encounter: "e", turn: 0, checkpoint: "on_evidence", rankedDifferential: ["a", "b"], whyText: "w", nextAction: null,
      discipline: "GM", prev_hash: "genesis", commit_schema: 2, concepts: ["c.a", null], statuses: ["leading", "ruled_out"], confidence: [70, null],
      evidenceLinks: [{ ref: "x", direction: "against", rank: 2 }], discriminator: { text: "t", ref: null, kind: "time" }, planLinks: [{ ref: "p", rank: 1 }],
      trigger: "learner", captureSnapshot: ["x"], supersedes: null,
    };
    it("hashes version 1's list, then commit_schema and the E4 fields in order, keys sorted", () => {
      expect(getScheme("tpc/differential-commit-2").canonical(good)).toBe(
        '["differential_commit","l","e","on_evidence",["a","b"],"w",null,"GM","genesis",2,["c.a",null],["leading","ruled_out"],[70,null],'
        + '[{"direction":"against","rank":2,"ref":"x"}],{"kind":"time","ref":null,"text":"t"},[{"rank":1,"ref":"p"}],"learner",["x"],null]');
    });
    it("commit_schema picks the version: 2 is version 2's, absent is version 1's, anything else is neither's", () => {
      const v1 = getScheme("tpc/differential-commit-1"), v2 = getScheme("tpc/differential-commit-2");
      const skip = { type: "commit_skipped", learner: "l", encounter: "e", checkpoint: "pre_close", reason: "timeout", prev_hash: "genesis" };
      const { commit_schema: _cs, ...old } = good; void _cs;
      expect([v1.applies(good), v2.applies(good)]).toEqual([false, true]);
      expect([v1.applies(old), v2.applies(old)]).toEqual([true, false]);
      expect([v1.applies(skip), v2.applies(skip)]).toEqual([true, false]);
      for (const e of [{ ...good, commit_schema: 1 }, { ...good, commit_schema: null }, { ...skip, commit_schema: 2 }, { ...good, commit_schema: true }]) expect([v1.applies(e), v2.applies(e)]).toEqual([false, false]);
      for (const id of ["tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3", "tpc/clinical-v4"]) expect(getScheme(id).applies(good)).toBe(false);
    });
    it("covers every E4 field: an edit to any of them, or dropping commit_schema, reads as tampered", () => {
      const sealed = sealEvent(good, "tpc/differential-commit-2");
      expect(verifyChain([sealed], { family: "tpc/clinical" }).clean).toBe(true);
      const edits: Record<string, unknown> = {
        concepts: ["c.a", "c.b"], statuses: ["active", "ruled_out"], confidence: [71, null], evidenceLinks: [{ ref: "x", direction: "for", rank: 2 }],
        discriminator: { text: "t", ref: "x", kind: "time" }, planLinks: [], trigger: "LAB-02", captureSnapshot: ["x", "y"], supersedes: "f".repeat(64),
      };
      for (const [f, v] of Object.entries(edits)) expect(verifyChain([{ ...sealed, [f]: v }], { family: "tpc/clinical" }).stats.tampered, f).toBe(1);
      const { commit_schema: _cs, ...stripped } = sealed; void _cs;
      expect(verifyChain([stripped], { family: "tpc/clinical" }).stats.tampered).toBe(1);
    });
    it("validates the E4 shape: lengths, statuses, 0-100, 1-based ranks, links into the snapshot, the discriminator, a trigger on on_evidence", () => {
      const { supersedes: _s, ...bad } = {
        ...good, discipline: "nursing", statuses: ["leading", "maybe"], confidence: [101, null],
        evidenceLinks: [{ rank: 0, ref: "x", direction: "for" }, { rank: 1, ref: "not-seen", direction: "for" }],
        discriminator: { kind: "hunch", ref: null, text: "t" }, planLinks: [{ rank: 3, ref: "p" }], trigger: null,
      };
      void _s;
      const r = verifyChain([sealEvent(bad, "tpc/differential-commit-2")], { scheme: "tpc/differential-commit-2" });
      expect(r.stats.tampered).toBe(0);
      expect(r.errors).toEqual([
        "[0] invalid discipline: nursing",
        "[0] statuses must hold one of leading, active, ruled_out per ranked entry",
        "[0] confidence must hold one number 0 to 100 or null per ranked entry",
        "[0] invalid evidenceLinks[0]",
        "[0] evidenceLinks[1] ref not in captureSnapshot: not-seen",
        "[0] invalid discriminator",
        "[0] invalid planLinks[0]",
        "[0] on_evidence needs a trigger",
        "[0] supersedes must be a hash or null",
      ]);
      const empty = sealEvent({ ...good, checkpoint: "after_history", rankedDifferential: [], concepts: [], statuses: [], confidence: [] }, "tpc/differential-commit-2");
      expect(verifyChain([empty], { scheme: "tpc/differential-commit-2" }).errors).toEqual([
        "[0] invalid checkpoint: after_history", "[0] rankedDifferential must be 1 to 5 non-empty strings", "[0] invalid evidenceLinks[0]", "[0] invalid planLinks[0]",
      ]);
    });
    const errs = (e: Record<string, unknown>): string[] => verifyChain([sealEvent(e, "tpc/differential-commit-2")], { scheme: "tpc/differential-commit-2" }).errors;
    const without = (f: string): Record<string, unknown> => { const { [f]: _x, ...rest } = good as Record<string, unknown>; void _x; return rest; };
    it("wants every field written, null where empty: a missing field hashes as null but is not valid", () => {
      expect(errs(without("trigger"))).toEqual(["[0] trigger must be a non-empty string or null"]);
      expect(errs(without("discriminator"))).toEqual(["[0] invalid discriminator"]);
      expect(errs(without("nextAction"))).toEqual(["[0] nextAction must be a string or null"]);
      expect(errs({ ...good, discriminator: { kind: "time", text: "t" } })).toEqual(["[0] invalid discriminator"]);
      const six = { rankedDifferential: ["a", "b", "c", "d", "e", "f"], concepts: Array(6).fill(null), statuses: Array(6).fill("active"), confidence: Array(6).fill(null) };
      expect(errs({ ...good, ...six })).toEqual(["[0] rankedDifferential must be 1 to 5 non-empty strings"]);
      expect(errs({ ...good, planLinks: [{ ref: "p", rank: 1.5 }] })).toEqual(["[0] invalid planLinks[0]"]);
    });
    it("takes only the named keys in links and the discriminator, so every valid record hashes alike in both languages", () => {
      expect(errs({ ...good, evidenceLinks: [{ ref: "x", direction: "for", rank: 1, note: "n" }] })).toEqual(["[0] invalid evidenceLinks[0]"]);
      expect(errs({ ...good, planLinks: [{ ref: "p", rank: 1, 10: 1 }] })).toEqual(["[0] invalid planLinks[0]"]);
      expect(errs({ ...good, discriminator: { kind: "time", ref: null, text: "t", why: "w" } })).toEqual(["[0] invalid discriminator"]);
      const proto = JSON.parse('{"ref":"x","direction":"for","rank":1,"__proto__":{"a":1}}');
      expect(errs({ ...good, evidenceLinks: [proto] })).toEqual(["[0] invalid evidenceLinks[0]"]);
    });
    it("version 1 says why a commit fits neither version, instead of only \"tampered\"", () => {
      const r = verifyChain([sealEvent(without("commit_schema"), "tpc/differential-commit-1")], { family: "tpc/clinical" });
      expect(r.stats.tampered).toBe(0);
      expect(r.errors).toEqual(["[0] fields without commit_schema 2: concepts, statuses, confidence, evidenceLinks, discriminator, planLinks, trigger, captureSnapshot, supersedes"]);
      const skip = { type: "commit_skipped", learner: "l", encounter: "e", checkpoint: "pre_close", reason: "timeout", prev_hash: "genesis" };
      const why = (e: Record<string, unknown>): string[] => verifyChain([{ ...e, hash: "0".repeat(64) }], { family: "tpc/clinical" }).errors;
      expect(why({ ...skip, commit_schema: 2 })).toEqual(["[0] commit_skipped carries no commit_schema", "[0] hash mismatch (tampered)"]);
      expect(why({ ...good, commit_schema: 1 })).toEqual(["[0] invalid commit_schema: 1", "[0] hash mismatch (tampered)"]);
      expect(why({ ...good, commit_schema: "2" })).toEqual(["[0] invalid commit_schema: 2", "[0] hash mismatch (tampered)"]);
      expect(why({ ...skip, reason: ["skip"] })).toEqual(["[0] invalid reason: skip", "[0] hash mismatch (tampered)"]);
      const { reason: _r, ...noReason } = skip; void _r;
      expect(why(noReason)).toEqual(["[0] invalid reason: undefined", "[0] hash mismatch (tampered)"]);
      expect(verifyChain([sealEvent(good, "tpc/differential-commit-2")], { scheme: "tpc/differential-commit-1" }).errors[0])
        .toBe("[0] a commit with commit_schema 2 is tpc/differential-commit-2's");
    });
    it("acted_without_commit is a skip reason (TPC-SPEC-002 E6); an unknown reason still is not", () => {
      const skip = (reason: string) => sealEvent({ type: "commit_skipped", learner: "l", encounter: "e", checkpoint: "post_history", reason, prev_hash: "genesis" }, "tpc/differential-commit-1");
      expect(verifyChain([skip("acted_without_commit")], { family: "tpc/clinical" }).clean).toBe(true);
      expect(verifyChain([skip("nope")], { family: "tpc/clinical" }).errors).toEqual(["[0] invalid reason: nope"]);
    });
    it("a chain across the switch is not mixed, and version 1's own vector still verifies", () => {
      const across = vectors.find((v) => v.name === "tpc-differential-commit-1-to-2.json")!;
      const r = verifyChain(across.events, { family: "tpc/clinical" });
      expect(r.clean).toBe(true); expect(r.errors.some((e) => e.startsWith("mixed"))).toBe(false);
      const old = vectors.find((v) => v.name === "tpc-differential-commit-1.json")!;
      expect(verifyChain(old.events, { family: "tpc/clinical" }).clean).toBe(true);
    });
  });
  it("v3 and v4 coexist in one chain (newest reported); v1 and v2 still count as mixed", () => {
    const v = vectors.find((v) => v.name === "tpc-clinical-v3-v4-coexist.json")!;
    const r = verifyChain(v.events, { family: "tpc/clinical" });
    expect(r.clean).toBe(true); expect(r.stats.hash_scheme).toBe("tpc/clinical-v4");
    expect(r.errors.some((e) => e.startsWith("mixed"))).toBe(false);
  });
  it("rejects a chain that mixes schemes, and reports each scheme's count", () => {
    const v1 = vectors.find((v) => v.name === "tpc-clinical-v1.json")!.events;
    const v2 = vectors.find((v) => v.name === "tpc-clinical-v2.json")!.events;
    // re-link a v2 event onto the end of the v1 chain
    const tail = sealEvent({ ...v2[0], prev_hash: v1[v1.length - 1].hash, turn: 6 }, "tpc/clinical-v2");
    const r = verifyChain([...v1, tail], { family: "tpc/clinical" });
    expect(r.clean).toBe(false);
    expect(r.stats.hash_scheme).toBe("mixed");
    expect(r.stats.schemes).toEqual({ "tpc/clinical-v1": 6, "tpc/clinical-v2": 1 });
    expect(r.errors.at(-1)).toMatch(/^mixed hash schemes/);
    expect(verifyChain([...v1, tail], { family: "tpc/clinical", rejectMixed: false }).clean).toBe(true);
  });
  it("detects a gap, a duplicate, a wrong genesis and schema errors", () => {
    const v2 = vectors.find((v) => v.name === "tpc-clinical-v2.json")!.events;
    const gap = verifyChain([v2[0], v2[2]], { scheme: "tpc/clinical-v2" });
    expect(gap.stats.gaps).toBe(1); expect(gap.errors).toContain("[1] chain gap");
    const dup = verifyChain([v2[0], v2[0]], { scheme: "tpc/clinical-v2" });
    expect(dup.stats.duplicates).toBe(1); expect(dup.stats.gaps).toBe(1);
    const gen = verifyChain([v2[1]], { scheme: "tpc/clinical-v2" });
    expect(gen.errors[0]).toBe('[0] first event prev_hash must be "genesis"');
    const bad = sealEvent({ ...v2[0], signal: "nope", scaffold: 9, confidence: 2 }, "tpc/clinical-v2");
    const r = verifyChain([bad], { scheme: "tpc/clinical-v2" });
    expect(r.stats.schema_errors).toBe(3); expect(r.stats.tampered).toBe(0);
  });
  it("play/clinical: canonical form sorts keys recursively and ignores stored hash", () => {
    const e = { hash: "junk", prevHash: "", schemaVersion: "clin-1.0", eventId: "e1", ts: "t", encounterId: "x", actor: "a", source: "s", type: "encounter_start", payload: { b: 1, a: [{ z: 1, y: 2 }] }, consentRef: null };
    expect(getScheme("play/clinical-clin-1.0").canonical(e)).toBe('{"actor":"a","consentRef":null,"encounterId":"x","eventId":"e1","payload":{"a":[{"y":2,"z":1}],"b":1},"prevHash":"","schemaVersion":"clin-1.0","source":"s","ts":"t","type":"encounter_start"}');
    expect(sealEvent(e, "play/clinical-clin-1.0").hash).toHaveLength(64);
    expect(sealEvent(e, "play/clinical-clin-1.0").hash).not.toBe("junk");
  });
  it("pure API works with an injected hash (browser path) and async hash", async () => {
    const v2 = vectors.find((v) => v.name === "tpc-clinical-v2.json")!.events;
    const upper = (s: string) => createHash("sha256").update(s).digest("hex").toUpperCase();
    expect(sealEventWith(upper, v2[0], "tpc/clinical-v2").hash).toBe(v2[0].hash.toUpperCase());
    expect(verifyChainWith(sha256Hex, v2, { family: "tpc/clinical" }).clean).toBe(true);
    const asyncHash = async (s: string) => sha256Hex(s);
    expect(await computeEventHashAsyncWith(asyncHash, v2[0], "tpc/clinical-v2")).toBe(v2[0].hash);
  });
  it("sealEvent never mutates its input", () => {
    const e = { type: "clinical_evidence", learner: "l", encounter: "e", turn: 0, construct: "c", signal: "partial", scaffold: 0, extractor: "x", confidence: 0.5, prev_hash: "genesis" };
    const frozen = Object.freeze({ ...e });
    const sealed = sealEvent(frozen, "tpc/clinical-v2");
    expect((frozen as any).hash).toBeUndefined(); expect(sealed.hash).toHaveLength(64);
  });
  it("unknown scheme or family throws with a helpful message", () => {
    expect(() => getScheme("nope")).toThrow(/unknown chain scheme: nope/);
    expect(() => verifyChain([], { family: "nope" })).toThrow(/unknown chain family/);
    expect(() => verifyChain([], {})).toThrow(/pass \{ family \} or \{ scheme \}/);
  });
});
