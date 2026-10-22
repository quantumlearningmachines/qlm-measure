import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { sealEvent, verifyChain } from "../src/schemes/node.js";
import { familySchemes, getScheme, protoKeyPath, fnv1a64Hex } from "../src/schemes/index.js";

const VEC = join(__dirname, "..", "schema", "vectors", "chains");
const vec = (name: string) => JSON.parse(readFileSync(join(VEC, name), "utf-8"));
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("play/encounter-sha256-1 (0.9.0): the SHA-256 successor of play/encounter-fnv64-1", () => {
  it("hashes the same nine fields, in the same order, with SHA-256 instead of FNV-1a 64", () => {
    const s = getScheme("play/encounter-sha256-1");
    expect([s.family, s.hashField, s.prevField, s.genesis, s.digest ?? "sha256"]).toEqual(["play/encounter", "eventHash", "prevHash", "", "sha256"]);
    const e = vec("play-encounter-sha256-1.json").events[0];
    const text = getScheme("play/encounter-fnv64-1").canonical(e);
    expect(s.canonical(e)).toBe(text);
    expect(e.eventHash).toBe(sha(text));
    expect(e.eventHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is the family's newest scheme, and both formats verify as their own scheme", () => {
    expect(familySchemes("play/encounter").map((s) => s.id)).toEqual(["play/encounter-sha256-1", "play/encounter-fnv64-1"]);
    const sha256 = vec("play-encounter-sha256-1.json");
    expect(verifyChain(sha256.events, { family: "play/encounter" })).toMatchObject({ clean: true, stats: { hash_scheme: "play/encounter-sha256-1" } });
    const fnv = vec("play-encounter-fnv64-1.json");
    expect(verifyChain(fnv.events, { family: "play/encounter" })).toMatchObject({ clean: true, stats: { hash_scheme: "play/encounter-fnv64-1" } });
  });

  it("refuses an edited event, and a chain that mixes the two formats", () => {
    const tampered = vec("play-encounter-sha256-1-tampered.json");
    const r = verifyChain(tampered.events, { family: "play/encounter" });
    expect(r.clean).toBe(false);
    expect(r.errors).toContain("[1] hash mismatch (tampered)");
    const events = vec("play-encounter-sha256-1.json").events;
    const fnvTail = { ...events[1], prevHash: events[0].eventHash, eventHash: "" };
    fnvTail.eventHash = fnv1a64Hex(getScheme("play/encounter-fnv64-1").canonical(fnvTail));
    const mixed = verifyChain([events[0], fnvTail], { family: "play/encounter" });
    expect(mixed.clean).toBe(false);
    expect(mixed.errors.some((x) => x.startsWith("mixed hash schemes:"))).toBe(true);
  });

  it("seals with sealEvent like every other scheme", () => {
    const e = vec("play-encounter-sha256-1.json").events[0];
    expect(sealEvent({ ...e, eventHash: "" }, "play/encounter-sha256-1").eventHash).toBe(e.eventHash);
  });
});

// sortKeysDeep drops a JSON "__proto__" key on purpose (it mirrors the products' original code), so
// two events that differ only by such a key share a hash. verifyChain refuses such an event.
describe("an event holding a __proto__ key the hash does not cover (0.9.0)", () => {
  it("play/clinical-clin-1.0: a payload __proto__ key leaves the hash unchanged, and verifyChain refuses the event", () => {
    const v = vec("play-clinical-clin-1.0.json");
    const forged = JSON.parse(JSON.stringify(v.events[0]).replace('"payload":{', '"payload":{"__proto__":{"score":"forged"},'));
    expect(Object.keys(forged.payload)).toContain("__proto__");
    expect(sealEvent({ ...forged, hash: "" }, "play/clinical-clin-1.0").hash).toBe(v.events[0].hash);
    const r = verifyChain([forged, ...v.events.slice(1)], { family: "play/clinical" });
    expect(r.clean).toBe(false);
    expect(r.errors).toContain('[0] holds a "__proto__" key at payload.__proto__, which the hash does not cover');
    expect(r.stats.schema_errors).toBe(1);
  });

  it("tpc/clinical-v4: a nested payload __proto__ key is refused the same way, and arrays are searched too", () => {
    const base = { type: "clinical_evidence", learner: "l", encounter: "e", turn: 0, construct: "c", signal: "partial", scaffold: 1, extractor: "x", confidence: 0.5, prev_hash: "genesis", event_kind: "chart.item" };
    const clean = sealEvent({ ...base, payload: { a: { b: 1 }, list: [{ c: 1 }] } }, "tpc/clinical-v4");
    expect(verifyChain([clean], { scheme: "tpc/clinical-v4" }).clean).toBe(true);
    const nested = JSON.parse(JSON.stringify(clean).replace('"a":{', '"a":{"__proto__":{"b":2},'));
    expect(verifyChain([nested], { scheme: "tpc/clinical-v4" }).errors).toContain('[0] holds a "__proto__" key at payload.a.__proto__, which the hash does not cover');
    const inArray = JSON.parse(JSON.stringify(clean).replace('[{"c":1}]', '[{"c":1,"__proto__":{"c":2}}]'));
    expect(verifyChain([inArray], { scheme: "tpc/clinical-v4" }).errors).toContain('[0] holds a "__proto__" key at payload.list[0].__proto__, which the hash does not cover');
  });

  it("protoKeyPath names the first such key, or null", () => {
    expect(protoKeyPath({ a: [1, { b: null }], c: "x" })).toBeNull();
    expect(protoKeyPath(JSON.parse('{"__proto__":1}'))).toBe(".__proto__");
    expect(protoKeyPath(null)).toBeNull();
    expect(protoKeyPath("text")).toBeNull();
  });
});
