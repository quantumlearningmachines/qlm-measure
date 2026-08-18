/**
 * Evidence Record Verifier
 *
 * Verifies the bookkeeping integrity of an evidence record WITHOUT
 * containing any estimation mathematics.
 *
 * verify makes no network calls. Records never leave your machine.
 */

import type { EvidenceRecord, EvidenceEntry } from "../schema/evidence-record.js";
import type { ScaffoldType, DepthLevel, EpistemicMode, TriageResult } from "../schema/enums.js";
import { hashEntry } from "./hash.js";

export interface Violation {
  version: number;
  category: "schema" | "version" | "timestamp" | "hash" | "posterior" | "compaction" | "enum";
  message: string;
  checkId: string;
}

export interface VerificationResult {
  valid: boolean;
  violations: Violation[];
  entriesChecked: number;
}

const VALID_SCAFFOLD_TYPES: ScaffoldType[] = ["none", "socratic", "probing", "metacognitive", "scaffolding", "explain", "hint", "demonstrate"];
const VALID_DEPTH_LEVELS: DepthLevel[] = ["surface", "conceptual", "transfer", "integration"];
const VALID_EPISTEMIC_MODES: EpistemicMode[] = ["experience", "inference", "analogy", "testimony"];
const VALID_TRIAGE_RESULTS: TriageResult[] = ["correct", "slip", "misconception", "disengagement", "ambiguous"];

function isValidISO8601(ts: string): boolean {
  const d = new Date(ts);
  return !isNaN(d.getTime()) && ts.length > 0;
}

export function verifyRecord(
  record: EvidenceRecord,
  timestampToleranceMs: number = 1000,
): VerificationResult {
  const violations: Violation[] = [];

  if (!record.studentScopeId || typeof record.studentScopeId !== "string") {
    violations.push({ version: 0, category: "schema", message: "Missing or invalid studentScopeId", checkId: "SCHEMA.REQUIRED" });
  }
  if (!Array.isArray(record.entries)) {
    violations.push({ version: 0, category: "schema", message: "entries must be an array", checkId: "SCHEMA.REQUIRED" });
    return { valid: false, violations, entriesChecked: 0 };
  }

  // Compaction boundary
  if (record.compactedBefore) {
    if (typeof record.compactedBefore.version !== "number") {
      violations.push({ version: 0, category: "compaction", message: "compactedBefore.version must be a number", checkId: "COMPACTION.BOUNDARY" });
    }
    if (typeof record.compactedBefore.summaryHash !== "string" || !record.compactedBefore.summaryHash) {
      violations.push({ version: 0, category: "compaction", message: "compactedBefore.summaryHash must be a non-empty string", checkId: "COMPACTION.BOUNDARY" });
    }
    if (record.entries.length > 0 && record.entries[0].version <= record.compactedBefore.version) {
      violations.push({
        version: record.entries[0].version, category: "compaction",
        message: `First entry version (${record.entries[0].version}) must be > compaction boundary (${record.compactedBefore.version})`,
        checkId: "COMPACTION.BOUNDARY",
      });
    }
  }

  let prevVersion = record.compactedBefore?.version ?? 0;
  let prevTimestamp = "";
  let prevHash = record.compactedBefore?.summaryHash ?? "";
  let lastUpdatedPosterior: number | null = null;

  for (const entry of record.entries) {
    const v = entry.version ?? -1;

    // SCHEMA.REQUIRED
    if (typeof v !== "number" || v < 1) {
      violations.push({ version: v, category: "schema", message: "version must be a positive integer", checkId: "SCHEMA.REQUIRED" });
    }
    if (typeof entry.timestamp !== "string" || !entry.timestamp) {
      violations.push({ version: v, category: "schema", message: "timestamp is required", checkId: "SCHEMA.REQUIRED" });
    }

    // SCHEMA.TYPES
    if (typeof entry.evidentialWeight !== "number") {
      violations.push({ version: v, category: "schema", message: "evidentialWeight must be a number", checkId: "SCHEMA.TYPES" });
    }
    if (typeof entry.priorPosterior !== "number") {
      violations.push({ version: v, category: "schema", message: "priorPosterior must be a number", checkId: "SCHEMA.TYPES" });
    }
    if (typeof entry.updatedPosterior !== "number") {
      violations.push({ version: v, category: "schema", message: "updatedPosterior must be a number", checkId: "SCHEMA.TYPES" });
    }

    // SCHEMA.TIMESTAMP_FORMAT
    if (typeof entry.timestamp === "string" && entry.timestamp && !isValidISO8601(entry.timestamp)) {
      violations.push({ version: v, category: "timestamp", message: `Timestamp is not valid ISO 8601: "${entry.timestamp}"`, checkId: "SCHEMA.TIMESTAMP_FORMAT" });
    }

    // VERSION.MONOTONIC
    if (v <= prevVersion) {
      violations.push({ version: v, category: "version", message: `Version ${v} <= previous ${prevVersion}`, checkId: "VERSION.MONOTONIC" });
    }

    // TIMESTAMP.MONOTONIC
    if (prevTimestamp && entry.timestamp) {
      const prevMs = new Date(prevTimestamp).getTime();
      const currMs = new Date(entry.timestamp).getTime();
      if (!isNaN(prevMs) && !isNaN(currMs) && currMs < prevMs - timestampToleranceMs) {
        violations.push({ version: v, category: "timestamp", message: "Timestamp goes backward", checkId: "TIMESTAMP.MONOTONIC" });
      }
    }

    // ENUM.VALID
    if (entry.scaffoldType && !VALID_SCAFFOLD_TYPES.includes(entry.scaffoldType)) {
      violations.push({ version: v, category: "enum", message: `Invalid scaffoldType: ${entry.scaffoldType}`, checkId: "ENUM.VALID" });
    }
    if (entry.depthLevel && !VALID_DEPTH_LEVELS.includes(entry.depthLevel)) {
      violations.push({ version: v, category: "enum", message: `Invalid depthLevel: ${entry.depthLevel}`, checkId: "ENUM.VALID" });
    }
    if (entry.epistemicMode && !VALID_EPISTEMIC_MODES.includes(entry.epistemicMode)) {
      violations.push({ version: v, category: "enum", message: `Invalid epistemicMode: ${entry.epistemicMode}`, checkId: "ENUM.VALID" });
    }
    if (entry.triageResult && !VALID_TRIAGE_RESULTS.includes(entry.triageResult)) {
      violations.push({ version: v, category: "enum", message: `Invalid triageResult: ${entry.triageResult}`, checkId: "ENUM.VALID" });
    }

    // HASH.PREV_LINK
    if (entry.prevHash !== prevHash) {
      violations.push({ version: v, category: "hash", message: "prevHash mismatch", checkId: "HASH.PREV_LINK" });
    }

    // HASH.ENTRY_RECOMPUTE
    const computedHash = hashEntry(entry);
    if (entry.entryHash !== computedHash) {
      violations.push({ version: v, category: "hash", message: "entryHash mismatch", checkId: "HASH.ENTRY_RECOMPUTE" });
    }

    // POSTERIOR.CHAIN
    if (lastUpdatedPosterior !== null && typeof entry.priorPosterior === "number") {
      const diff = Math.abs(entry.priorPosterior - lastUpdatedPosterior);
      if (diff > 1e-9) {
        violations.push({
          version: v, category: "posterior",
          message: `priorPosterior (${entry.priorPosterior}) != previous updatedPosterior (${lastUpdatedPosterior})`,
          checkId: "POSTERIOR.CHAIN",
        });
      }
    }

    prevVersion = v;
    prevTimestamp = entry.timestamp;
    prevHash = entry.entryHash;
    if (typeof entry.updatedPosterior === "number") {
      lastUpdatedPosterior = entry.updatedPosterior;
    }
  }

  return { valid: violations.length === 0, violations, entriesChecked: record.entries.length };
}
