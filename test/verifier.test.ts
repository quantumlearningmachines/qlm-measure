/**
 * Verifier unit tests — proves bookkeeping integrity checks work
 * WITHOUT any estimation mathematics.
 */

import { describe, it, expect } from "vitest";
import { verifyRecord, replayToVersion, posteriorAtVersion, summarizeToVersion } from "../src/verifier";
import { hashEntry, sha256, canonicalize } from "../src/verifier/hash";
import type { EvidenceRecord, EvidenceEntry } from "../src/schema/evidence-record";
import type { ObservationEvent } from "../src/schema/observation-event";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(correct: boolean, ts?: string): ObservationEvent {
  return {
    studentId: "test-student",
    sessionId: "test-session",
    source: "test",
    timestamp: ts ?? new Date().toISOString(),
    correct,
    responseTimeMs: 3000,
    domain: "math",
  };
}

function makeEntry(
  version: number,
  correct: boolean,
  prior: number,
  updated: number,
  prevHash: string,
  ts?: string,
): EvidenceEntry {
  const event = makeEvent(correct, ts ?? new Date(Date.now() + version * 60000).toISOString());
  const hashable = {
    version,
    timestamp: event.timestamp,
    event,
    scaffoldType: "none" as const,
    depthLevel: "conceptual" as const,
    epistemicMode: "experience" as const,
    triageResult: (correct ? "correct" : "misconception") as const,
    evidentialWeight: 0.9,
    priorPosterior: prior,
    updatedPosterior: updated,
    nonInterventionDecision: null,
  };
  return {
    ...hashable,
    entryHash: sha256(canonicalize(hashable)),
    prevHash,
  };
}

function buildValidRecord(n: number): EvidenceRecord {
  const entries: EvidenceEntry[] = [];
  let prevHash = "";
  let posterior = 0.5;
  for (let i = 0; i < n; i++) {
    const correct = i % 3 !== 2;
    const newPosterior = correct ? posterior + 0.07 : posterior - 0.04;
    const entry = makeEntry(i + 1, correct, posterior, newPosterior, prevHash);
    entries.push(entry);
    prevHash = entry.entryHash;
    posterior = newPosterior;
  }
  return { studentScopeId: "test-student", entries };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("verifyRecord — valid records", () => {
  it("accepts an empty record", () => {
    const result = verifyRecord({ studentScopeId: "s1", entries: [] });
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.entriesChecked).toBe(0);
  });

  it("accepts a single-entry record", () => {
    const record = buildValidRecord(1);
    const result = verifyRecord(record);
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(1);
  });

  it("accepts a 10-entry record", () => {
    const record = buildValidRecord(10);
    const result = verifyRecord(record);
    expect(result.valid).toBe(true);
    expect(result.entriesChecked).toBe(10);
  });

  it("accepts a record with compaction boundary", () => {
    const record = buildValidRecord(5);
    // Simulate compaction: remove first 2 entries, set boundary
    const compacted: EvidenceRecord = {
      studentScopeId: "test-student",
      entries: record.entries.slice(2),
      compactedBefore: {
        version: 2,
        summaryHash: record.entries[1].entryHash,
      },
    };
    const result = verifyRecord(compacted);
    expect(result.valid).toBe(true);
  });
});

describe("verifyRecord — hash-chain tampering", () => {
  it("detects modified updatedPosterior", () => {
    const record = buildValidRecord(5);
    record.entries[2] = { ...record.entries[2], updatedPosterior: 0.99 };
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.category === "hash")).toBe(true);
  });

  it("detects modified evidentialWeight", () => {
    const record = buildValidRecord(5);
    record.entries[1] = { ...record.entries[1], evidentialWeight: 999 };
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.category === "hash")).toBe(true);
  });

  it("detects broken prevHash link", () => {
    const record = buildValidRecord(5);
    record.entries[3] = { ...record.entries[3], prevHash: "tampered" };
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.category === "hash" && v.message.includes("prevHash"))).toBe(true);
  });
});

describe("verifyRecord — posterior-chain consistency", () => {
  it("detects posterior chain break", () => {
    const record = buildValidRecord(5);
    // Entry 4's priorPosterior should match entry 3's updatedPosterior
    // Tamper entry 3's updatedPosterior (which also breaks hash, but we're testing posterior check)
    const e3 = record.entries[2];
    const e4 = record.entries[3];
    // Create a valid-hash entry 4 but with wrong priorPosterior
    record.entries[3] = makeEntry(4, true, 0.999, e4.updatedPosterior, e3.entryHash);
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.category === "posterior")).toBe(true);
  });
});

describe("verifyRecord — version monotonicity", () => {
  it("detects duplicate version", () => {
    const record = buildValidRecord(3);
    record.entries[2] = { ...record.entries[2], version: 2 };
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.category === "version")).toBe(true);
  });

  it("detects out-of-order version", () => {
    const record = buildValidRecord(3);
    record.entries[1] = { ...record.entries[1], version: 5 };
    record.entries[2] = { ...record.entries[2], version: 3 };
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
  });
});

describe("verifyRecord — enum validation", () => {
  it("detects invalid scaffoldType", () => {
    const record = buildValidRecord(1);
    (record.entries[0] as any).scaffoldType = "invalid_type";
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.category === "enum")).toBe(true);
  });

  it("detects invalid depthLevel", () => {
    const record = buildValidRecord(1);
    (record.entries[0] as any).depthLevel = "deep";
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.category === "enum")).toBe(true);
  });

  it("detects invalid triageResult", () => {
    const record = buildValidRecord(1);
    (record.entries[0] as any).triageResult = "unknown";
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
  });
});

describe("verifyRecord — schema validation", () => {
  it("detects missing studentScopeId", () => {
    const result = verifyRecord({ studentScopeId: "", entries: [] });
    expect(result.valid).toBe(false);
    expect(result.violations.some(v => v.category === "schema")).toBe(true);
  });

  it("detects missing evidentialWeight", () => {
    const record = buildValidRecord(1);
    delete (record.entries[0] as any).evidentialWeight;
    const result = verifyRecord(record);
    expect(result.valid).toBe(false);
  });
});

describe("replayToVersion", () => {
  it("returns entries up to target version", () => {
    const record = buildValidRecord(5);
    const replayed = replayToVersion(record, 3);
    expect(replayed).toHaveLength(3);
    expect(replayed[2].version).toBe(3);
  });

  it("returns empty for version 0", () => {
    const record = buildValidRecord(5);
    expect(replayToVersion(record, 0)).toHaveLength(0);
  });

  it("returns all for version >= max", () => {
    const record = buildValidRecord(5);
    expect(replayToVersion(record, 100)).toHaveLength(5);
  });
});

describe("posteriorAtVersion", () => {
  it("returns updatedPosterior at target version", () => {
    const record = buildValidRecord(5);
    const posterior = posteriorAtVersion(record, 3);
    expect(posterior).toBe(record.entries[2].updatedPosterior);
  });

  it("returns null for missing version", () => {
    const record = buildValidRecord(5);
    expect(posteriorAtVersion(record, 0)).toBeNull();
  });
});

describe("summarizeToVersion", () => {
  it("produces correct summary", () => {
    const record = buildValidRecord(5);
    const summary = summarizeToVersion(record, 5);
    expect(summary.entriesIncluded).toBe(5);
    expect(summary.firstVersion).toBe(1);
    expect(summary.lastVersion).toBe(5);
    expect(summary.finalPosterior).toBeTypeOf("number");
    expect(Object.keys(summary.scaffoldDistribution).length).toBeGreaterThan(0);
    expect(Object.keys(summary.triageDistribution).length).toBeGreaterThan(0);
  });
});

describe("hash utilities", () => {
  it("canonicalize produces sorted keys", () => {
    const a = canonicalize({ z: 1, a: 2 });
    const b = canonicalize({ a: 2, z: 1 });
    expect(a).toBe(b);
  });

  it("sha256 produces consistent output", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("hashEntry is deterministic", () => {
    const record = buildValidRecord(1);
    const h1 = hashEntry(record.entries[0]);
    const h2 = hashEntry(record.entries[0]);
    expect(h1).toBe(h2);
  });
});
