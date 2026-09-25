import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { sealEvent, computeEventHash, detectScheme, verifyChain, sha256Hex } from "../src/schemes/node.js";
import { listSchemes, getScheme, sealEventWith, verifyChainWith, computeEventHashAsyncWith } from "../src/schemes/index.js";

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
        for (const e of v.events) {
          const id = detectScheme(e, v.family)!;
          expect(id).not.toBeNull();
          const scheme = getScheme(id);
          const { [scheme.hashField]: stored, ...rest } = e;
          expect(computeEventHash(rest, id)).toBe(stored);
          expect(sealEvent(rest, id)[scheme.hashField]).toBe(stored);
        }
      });
    }
  }
});

describe("chain schemes: behaviour", () => {
  it("lists five schemes across two families, newest first", () => {
    const ids = listSchemes().map((s) => s.id);
    expect(ids).toEqual(["tpc/clinical-v4", "tpc/clinical-v3", "tpc/clinical-v2", "tpc/clinical-v1", "play/clinical-clin-1.0"]);
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
