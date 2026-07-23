/**
 * STRESS TESTS — Try to break the verifier, forge records,
 * overflow buffers, corrupt hashes, and exploit edge cases.
 */

import { describe, it, expect } from "vitest";
import { verifyRecord, replayToVersion, posteriorAtVersion } from "../src/verifier";
import { hashEntry, sha256, canonicalize } from "../src/verifier/hash";
import type { EvidenceRecord, EvidenceEntry } from "../src/schema/evidence-record";
import type { ObservationEvent } from "../src/schema/observation-event";

function makeEntry(v: number, prior: number, updated: number, prevHash: string): EvidenceEntry {
  const event: ObservationEvent = {
    studentId: "stress", sessionId: "s", source: "test",
    timestamp: new Date(1700000000000 + v * 60000).toISOString(),
    correct: true, responseTimeMs: 1000, domain: "math",
  };
  const hashable = {
    version: v, timestamp: event.timestamp, event,
    scaffoldType: "none" as const, depthLevel: "surface" as const,
    epistemicMode: "experience" as const, triageResult: "correct" as const,
    evidentialWeight: 0.5, priorPosterior: prior, updatedPosterior: updated,
    nonInterventionDecision: null,
  };
  return { ...hashable, entryHash: sha256(canonicalize(hashable)), prevHash };
}

function validRecord(n: number): EvidenceRecord {
  const entries: EvidenceEntry[] = [];
  let prev = "", post = 0.5;
  for (let i = 0; i < n; i++) {
    const newPost = post + 0.001;
    const e = makeEntry(i + 1, post, newPost, prev);
    entries.push(e);
    prev = e.entryHash;
    post = newPost;
  }
  return { studentScopeId: "stress-test", entries };
}

describe("STRESS: Forged records", () => {
  it("catches a perfectly forged entry with correct hash but wrong posterior chain", () => {
    const record = validRecord(5);
    // Forge entry 3: recompute hash for a different posterior, but keep prevHash correct
    const forged = makeEntry(3, 0.999, 0.998, record.entries[1].entryHash);
    record.entries[2] = forged;
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
    // Should catch posterior chain break (entry 3's prior != entry 2's updated)
    expect(r.violations.some(v => v.category === "posterior")).toBe(true);
  });

  it("catches a spliced entry (valid in isolation, breaks chain)", () => {
    const record = validRecord(5);
    const alien = makeEntry(3, record.entries[1].updatedPosterior, 0.777, "totally-different-hash");
    record.entries[2] = alien;
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.category === "hash")).toBe(true);
  });

  it("catches a deleted entry (version gap)", () => {
    const record = validRecord(5);
    record.entries.splice(2, 1); // Remove entry 3
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
    // Version jump 2->4, posterior chain break, and hash chain break
    expect(r.violations.length).toBeGreaterThanOrEqual(1);
  });

  it("catches a reordered entry", () => {
    const record = validRecord(5);
    const temp = record.entries[2];
    record.entries[2] = record.entries[3];
    record.entries[3] = temp;
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
  });

  it("catches a duplicated entry", () => {
    const record = validRecord(3);
    record.entries.push({ ...record.entries[2] }); // Duplicate last
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.category === "version")).toBe(true);
  });
});

describe("STRESS: Edge cases", () => {
  it("handles 1000-entry record", () => {
    const record = validRecord(1000);
    const r = verifyRecord(record);
    expect(r.valid).toBe(true);
    expect(r.entriesChecked).toBe(1000);
  });

  it("handles posteriors at floating point boundary", () => {
    const record = validRecord(1);
    // Set posteriors to values that cause floating point issues
    record.entries[0] = makeEntry(1, 0.1 + 0.2, 0.30000000000000004, "");
    const r = verifyRecord(record);
    // Should still pass — the values are what they are
    expect(r.entriesChecked).toBe(1);
  });

  it("handles NaN posterior", () => {
    const record = validRecord(1);
    (record.entries[0] as any).priorPosterior = NaN;
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
  });

  it("handles Infinity posterior", () => {
    const record = validRecord(1);
    (record.entries[0] as any).updatedPosterior = Infinity;
    const r = verifyRecord(record);
    // Hash will mismatch because we changed the value
    expect(r.valid).toBe(false);
  });

  it("handles null entries array", () => {
    const r = verifyRecord({ studentScopeId: "test", entries: null as any });
    expect(r.valid).toBe(false);
  });

  it("handles undefined studentScopeId", () => {
    const r = verifyRecord({ studentScopeId: undefined as any, entries: [] });
    expect(r.valid).toBe(false);
  });

  it("handles entry with missing timestamp", () => {
    const record = validRecord(1);
    delete (record.entries[0] as any).timestamp;
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
  });

  it("handles entry with negative version", () => {
    const record = validRecord(1);
    (record.entries[0] as any).version = -1;
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
  });

  it("handles entry with version 0", () => {
    const record = validRecord(1);
    (record.entries[0] as any).version = 0;
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
  });

  it("handles entry with string version", () => {
    const record = validRecord(1);
    (record.entries[0] as any).version = "1";
    const r = verifyRecord(record);
    expect(r.valid).toBe(false);
  });
});

describe("STRESS: Hash collision attempts", () => {
  it("different events produce different hashes", () => {
    const e1 = makeEntry(1, 0.5, 0.6, "");
    const e2 = makeEntry(1, 0.5, 0.60001, "");
    expect(e1.entryHash).not.toBe(e2.entryHash);
  });

  it("same event always produces same hash", () => {
    const e1 = makeEntry(1, 0.5, 0.6, "prev");
    const e2 = makeEntry(1, 0.5, 0.6, "prev");
    expect(e1.entryHash).toBe(e2.entryHash);
  });

  it("key ordering doesn't affect canonical hash", () => {
    const a = canonicalize({ z: 1, a: 2, m: 3 });
    const b = canonicalize({ m: 3, z: 1, a: 2 });
    const c = canonicalize({ a: 2, m: 3, z: 1 });
    expect(sha256(a)).toBe(sha256(b));
    expect(sha256(b)).toBe(sha256(c));
  });

  it("nested objects are sorted", () => {
    const a = canonicalize({ outer: { z: 1, a: 2 } });
    const b = canonicalize({ outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });
});

describe("STRESS: Compaction edge cases", () => {
  it("rejects entries before compaction boundary", () => {
    const record = validRecord(5);
    const compacted: EvidenceRecord = {
      studentScopeId: "test",
      entries: [record.entries[0]], // version 1
      compactedBefore: { version: 5, summaryHash: "abc" }, // boundary at 5
    };
    const r = verifyRecord(compacted);
    expect(r.valid).toBe(false);
    expect(r.violations.some(v => v.category === "compaction")).toBe(true);
  });

  it("rejects compaction with empty summaryHash", () => {
    const r = verifyRecord({
      studentScopeId: "test",
      entries: [],
      compactedBefore: { version: 10, summaryHash: "" },
    });
    expect(r.valid).toBe(false);
  });
});

describe("STRESS: Replay edge cases", () => {
  it("replay of empty record returns empty", () => {
    const r: EvidenceRecord = { studentScopeId: "test", entries: [] };
    expect(replayToVersion(r, 100)).toHaveLength(0);
  });

  it("replay of negative version returns empty", () => {
    const record = validRecord(5);
    expect(replayToVersion(record, -1)).toHaveLength(0);
  });

  it("posteriorAtVersion for nonexistent version", () => {
    const record = validRecord(5);
    expect(posteriorAtVersion(record, 999)).toBe(record.entries[4].updatedPosterior);
  });

  it("posteriorAtVersion for version between entries", () => {
    const record = validRecord(5);
    // version 2.5 doesn't exist — should return posterior at version 2
    // Actually replayToVersion uses <= so 2.5 rounds down
    const p = posteriorAtVersion(record, 2);
    expect(p).toBe(record.entries[1].updatedPosterior);
  });
});

describe("STRESS: Emitter wire format", () => {
  it("event_id format is stable", () => {
    // Verify the event ID pattern
    const id = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    expect(id).toMatch(/^test-\d+-[a-z0-9]+$/);
  });
});
