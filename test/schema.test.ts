/**
 * Schema validation tests — ensures public types are correctly shaped.
 */

import { describe, it, expect } from "vitest";
import { toPublicEpistemicMode, COMPACTION_RETENTION } from "../src/schema";
import type { ObservationEvent, MeasurementEvent, EvidenceEntry, EvidenceRecord } from "../src/schema";

describe("ObservationEvent shape", () => {
  it("requires mandatory fields", () => {
    const event: ObservationEvent = {
      studentId: "s1",
      sessionId: "sess1",
      source: "test",
      timestamp: new Date().toISOString(),
      correct: true,
      responseTimeMs: 1500,
      domain: "math",
    };
    expect(event.studentId).toBe("s1");
    expect(event.correct).toBe(true);
  });

  it("accepts optional fields", () => {
    const event: ObservationEvent = {
      studentId: "s1",
      sessionId: "sess1",
      source: "test",
      timestamp: new Date().toISOString(),
      correct: false,
      responseTimeMs: 5000,
      domain: "science",
      scaffoldType: "socratic",
      misconceptionId: "phys-mech-force-velocity",
      classifierConfidence: 0.72,
      epistemicMode: "inference",
      isTransferProblem: true,
      ext: { customField: "value" },
    };
    expect(event.scaffoldType).toBe("socratic");
    expect(event.ext?.customField).toBe("value");
  });

  it("ext namespace accepts arbitrary data", () => {
    const event: ObservationEvent = {
      studentId: "s1",
      sessionId: "sess1",
      source: "test",
      timestamp: new Date().toISOString(),
      correct: true,
      responseTimeMs: 2000,
      domain: "history",
      ext: {
        customDimension: { a1: 0.03 },
        flagExample: true,
        myToolSpecificField: [1, 2, 3],
      },
    };
    expect(event.ext?.customDimension).toEqual({ a1: 0.03 });
  });
});

describe("MeasurementEvent shape", () => {
  it("requires eventType and eventCategory", () => {
    const event: MeasurementEvent = {
      eventType: "answer_submitted",
      eventCategory: "learning",
    };
    expect(event.eventType).toBe("answer_submitted");
    expect(event.eventCategory).toBe("learning");
  });

  it("accepts all optional fields", () => {
    const event: MeasurementEvent = {
      eventType: "session_start",
      eventCategory: "system",
      sessionId: "sess1",
      classroomId: "class1",
      domain: "math",
      topic: "fractions",
      mode: "practice",
      difficulty: 0.6,
      payload: { questionCount: 10 },
      qualitySignal: 0.85,
      confidence: 0.9,
      durationMs: 45000,
      parentEventId: "parent-1",
    };
    expect(event.durationMs).toBe(45000);
  });
});

describe("toPublicEpistemicMode", () => {
  it("maps public values to themselves", () => {
    expect(toPublicEpistemicMode("experience")).toBe("experience");
    expect(toPublicEpistemicMode("inference")).toBe("inference");
    expect(toPublicEpistemicMode("analogy")).toBe("analogy");
    expect(toPublicEpistemicMode("testimony")).toBe("testimony");
  });

  it("maps internal shorthand values", () => {
    expect(toPublicEpistemicMode("direct")).toBe("experience");
    expect(toPublicEpistemicMode("reason")).toBe("inference");
    expect(toPublicEpistemicMode("compare")).toBe("analogy");
    expect(toPublicEpistemicMode("told")).toBe("testimony");
  });

  it("defaults unknown values to testimony", () => {
    expect(toPublicEpistemicMode("unknown")).toBe("testimony");
    expect(toPublicEpistemicMode("")).toBe("testimony");
  });
});

describe("COMPACTION_RETENTION", () => {
  it("is 500", () => {
    expect(COMPACTION_RETENTION).toBe(500);
  });
});

describe("EvidenceRecord shape", () => {
  it("requires studentScopeId and entries", () => {
    const record: EvidenceRecord = {
      studentScopeId: "student-1",
      entries: [],
    };
    expect(record.studentScopeId).toBe("student-1");
    expect(record.entries).toHaveLength(0);
  });

  it("accepts compactedBefore", () => {
    const record: EvidenceRecord = {
      studentScopeId: "student-1",
      entries: [],
      compactedBefore: { version: 100, summaryHash: "abc123" },
    };
    expect(record.compactedBefore?.version).toBe(100);
  });
});
