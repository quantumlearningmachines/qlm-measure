import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { SCHEMES, linkOf, computeEventHashAsyncWith, type ChainScheme } from "../src/schemes/index.js";
import { canonicalizeRfc8785 } from "../src/schemes/products.js";
import { computeEventHash, detectScheme, sealEvent, verifyChain } from "../src/schemes/node.js";

// What each scheme's validate reports for an event with none of its fields. The chain tests use
// well-formed events, so this is where every "missing" or "invalid" report is exercised.
const EMPTY_EVENT_ERRORS: Record<string, string[]> = {
  "tpc/clinical-v4": ["invalid type: undefined", "missing learner", "missing encounter", "invalid turn: undefined", "missing construct", "invalid signal: undefined", "invalid scaffold: undefined", "invalid confidence: undefined", "invalid event_kind: undefined", "payload must be an object"],
  "tpc/clinical-v3": ["invalid type: undefined", "missing learner", "missing encounter", "invalid turn: undefined", "missing construct", "invalid signal: undefined", "invalid scaffold: undefined", "invalid confidence: undefined"],
  "tpc/clinical-v2": ["invalid type: undefined", "missing learner", "missing encounter", "invalid turn: undefined", "missing construct", "invalid signal: undefined", "invalid scaffold: undefined", "invalid confidence: undefined"],
  "tpc/clinical-v1": ["invalid type: undefined", "missing learner", "missing encounter", "invalid turn: undefined", "missing construct", "invalid signal: undefined", "invalid scaffold: undefined", "invalid confidence: undefined"],
  "play/clinical-clin-1.0": ["invalid schemaVersion: undefined", "missing eventId", "missing ts", "missing encounterId", "missing type"],
  "play/emit-1": ["missing student_id", "missing product", "missing construct", "missing signal"],
  "play/measure-session-1": ["missing studyId", "missing sessionId"],
  "play/encounter-sha256-1": ["missing eventId", "missing ts", "missing encounterId", "missing type"],
  "play/encounter-fnv64-1": ["missing eventId", "missing ts", "missing encounterId", "missing type"],
  "play/research-provenance-1": ["missing designLayer", "missing runtimeLayer"],
  "qcore/qinverse-djb2-1": ["missing eventId", "missing sequence"],
  "studio/loop-1": ["missing sessionId", "missing participantId", "missing stage", "missing event", "missing at"],
  "dp/ledger-v3": ["missing eventId", "missing tenantId", "missing sessionId", "missing eventType", "missing eventSeq"],
  "tpc/dse-journal-1": ["missing seq", "missing eventType"],
  "yardstick/spine-1": ["missing enrollment_id", "missing item_id"],
  "labpath/learning-evidence-v1": ["missing event_id", "missing learner_id", "missing ts", "missing world_id", "missing session_id"],
  "tpc/transcript-1": ["missing transcript"],
  "tpc/differential-commit-2": ["missing learner", "missing encounter", "missing checkpoint", "invalid commit_schema: undefined", "rankedDifferential must be 1 to 5 non-empty strings", "whyText must be a string", "nextAction must be a string or null", "invalid discipline: undefined", "concepts must hold one concept id or null per ranked entry", "statuses must hold one of leading, active, ruled_out per ranked entry", "confidence must hold one number 0 to 100 or null per ranked entry", "captureSnapshot must be an array of non-empty strings", "evidenceLinks must be an array", "invalid discriminator", "planLinks must be an array", "trigger must be a non-empty string or null", "supersedes must be a hash or null"],
  "tpc/differential-commit-1": ["missing learner", "missing encounter", "missing checkpoint"],
  "tpc/rct-input-1": ["missing studyId"],
  "play/world-trace-identity-1": ["missing seq", "missing type", "missing prevHash", "payload must be an object"],
  "play/world-trace-tsim-1": ["missing seq", "missing type", "missing prevHash", "payload must be an object"],
  "play/world-trace-1": ["missing seq", "missing type", "missing prevHash", "payload must be an object"],
  "tpc/yardstick-record-2": ["missing sequence", "missing type", "missing studyId", "missing timestamp", "payload must be an object"],
  "tpc/yardstick-record-1": ["missing sequence", "missing type", "missing studyId", "missing timestamp", "payload must be an object"],
  "tpc/intervention-1": ["missing flagId", "missing actor", "missing actionType", "missing constructId", "missing timestamp"],
  "tpc/rehearsal-stage-1": ["missing stage", "missing passed", "missing timestamp"],
  "yardstick/activity-1": ["missing seq", "missing at", "missing who", "missing action"],
  "yardstick/depth-1": ["missing seq", "missing learner", "missing construct", "missing event", "missing at", "missing kind"],
};

describe("chain schemes: schema errors for an empty event", () => {
  it("every scheme is listed here, and reports exactly these errors", () => {
    expect(Object.keys(SCHEMES).sort()).toEqual(Object.keys(EMPTY_EVENT_ERRORS).sort());
    for (const [id, errors] of Object.entries(EMPTY_EVENT_ERRORS)) expect(SCHEMES[id].validate({}), id).toEqual(errors);
  });
});

// Branches the product vectors never reach: absent optional fields, the async hash path, implicit
// links with no previous hash given, and the depth scheme's per-kind field checks.
describe("chain schemes: edge cases", () => {
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const asyncSha = async (s: string) => sha(s);

  it("a scheme with neither a link nor a previous-hash field has no link", () => {
    expect(linkOf({ prevField: null } as unknown as ChainScheme)).toBe("none");
    expect(linkOf({ prevField: "prev" } as unknown as ChainScheme)).toBe("explicit");
  });

  it("the async hash matches the sync one for every digest, prefix and truncation", async () => {
    const e = { eventId: "e1", ts: "t", encounterId: "x", type: "a", payload: {}, prevHash: "", scheme: "yardstick/depth-1", seq: 1, studyId: "s", sessionId: "q" };
    for (const id of ["play/encounter-fnv64-1", "qcore/qinverse-djb2-1", "play/encounter-sha256-1", "yardstick/depth-1", "play/measure-session-1"]) {
      expect(await computeEventHashAsyncWith(asyncSha, e, id), id).toBe(computeEventHash(e, id));
    }
    expect(await computeEventHashAsyncWith(asyncSha, e, "yardstick/depth-1")).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(await computeEventHashAsyncWith(asyncSha, e, "play/measure-session-1")).toMatch(/^[0-9a-f]{32}$/);
  });

  it("detection skips schemes that do not apply and returns null when none matches", () => {
    expect(detectScheme({ eventId: "e", eventHash: "nope" }, "play/encounter")).toBeNull();
    expect(detectScheme({}, "play/encounter")).toBeNull();
  });

  it("tpc/clinical-v4 hashes an absent mapping_version as null and an absent payload as {}", () => {
    expect(SCHEMES["tpc/clinical-v4"].canonical({ event_kind: "k" })).toMatch(/,null,"k",\{\}\]$/);
  });

  it("verifyChain reads a missing previous hash, and a null genesis, as the empty string", () => {
    const first = sealEvent({ eventId: "a", tenantId: "t", sessionId: "s", eventType: "x", eventSeq: 1 }, "dp/ledger-v3");
    const r = verifyChain([{ ...first, eventHash: undefined }, { eventId: "b", tenantId: "t", sessionId: "s", eventType: "x", eventSeq: 2, previousEventHash: "" }], { scheme: "dp/ledger-v3" });
    expect(r.clean).toBe(false);
    expect(verifyChain([first], { scheme: "dp/ledger-v3" }).clean).toBe(true);
  });

  it("product canonical forms fill absent fields the way each product did", () => {
    expect(JSON.parse(SCHEMES["play/emit-1"].canonical({ prev_hash: "" })).prev_hash).toBe("genesis");
    const snake = JSON.parse(SCHEMES["play/measure-session-1"].canonical({ study_id: "s", session_id: "q", sequence_number: 4 }));
    expect([snake.studyId, snake.sessionId, snake.sequenceNumber]).toEqual(["s", "q", 4]);
    expect(JSON.parse(SCHEMES["play/measure-session-1"].canonical({})).sequenceNumber).toBeNull();
    expect(SCHEMES["play/encounter-sha256-1"].applies({ schemaVersion: "clin-1.0" })).toBe(true);
    expect(SCHEMES["play/encounter-fnv64-1"].applies({ schemaVersion: "clin-1.0" })).toBe(true);
    expect(SCHEMES["tpc/dse-journal-1"].canonical({ seq: 1, eventType: "x", data: 1 })).toBe('{"seq":1,"eventType":"x","data":1}');
    expect(JSON.parse(SCHEMES["tpc/rehearsal-stage-1"].canonical({ stage: "s", passed: true, timestamp: "t" }))[3]).toBe("genesis");
    // dp/ledger-v3 hashes an extra stored key, but never the four it excludes.
    const base = { eventId: "a", tenantId: "t", sessionId: "s", eventType: "x", eventSeq: 1 };
    expect(SCHEMES["dp/ledger-v3"].canonical({ ...base, extra: 1 })).toContain('"extra":1');
    expect(SCHEMES["dp/ledger-v3"].canonical({ ...base, receivedAt: "r" })).toBe(SCHEMES["dp/ledger-v3"].canonical(base));
  });

  it("the RFC 8785 form writes undefined as null and refuses non-finite numbers and functions", () => {
    expect(canonicalizeRfc8785(undefined)).toBe("null");
    expect(canonicalizeRfc8785({ a: undefined, b: [true, 1.5, "x", null] })).toBe('{"a":null,"b":[true,1.5,"x",null]}');
    expect(() => canonicalizeRfc8785(Infinity)).toThrow("Non-finite number in canonical event");
    expect(() => canonicalizeRfc8785(() => 1)).toThrow("Unserializable type: function");
  });

  it("yardstick/depth-1 checks each kind's own fields", () => {
    const v = SCHEMES["yardstick/depth-1"].validate;
    const common = { seq: 1, learner: "l", construct: "c", event: "e", at: "2026-10-10T00:00:00.000000Z" };
    const evidence = { ...common, kind: "evidence", scaffold: "s", directiveness: 0, is_probe: false };
    expect(v(evidence)).toEqual([]);
    expect(v({ ...evidence, item: 3, session: 4 })).toEqual(["invalid item", "invalid session"]);
    expect(v({ ...evidence, params: null })).toEqual(["invalid params"]);
    expect(v({ ...evidence, params: [1] })).toEqual(["invalid params"]);
    expect(v({ ...evidence, params: { guess: "x", slip: 0.1 } })).toEqual(["invalid params"]);
    expect(v({ ...evidence, params: { guess: 0.2, slip: 0.1 } })).toEqual([]);
    const verification = { ...common, kind: "verification", check: "c", answered: common.at, fired: common.at, source: "need", outcome: "pass", helped: false, decision_hash: "h" };
    expect(v(verification)).toEqual([]);
    expect(v({ ...verification, decision_hash: "" })).toEqual(["invalid decision_hash"]);
  });
});
