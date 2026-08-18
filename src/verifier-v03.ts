/**
 * Verifier for schema 0.3 records — two-level verification.
 * Evidence chain + estimate chains + record-level consent/attestation checks.
 */

import { createHash } from "crypto";
import { reproduce } from "./rules.js";

function canonicalize(obj: unknown): string {
  return JSON.stringify(obj, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce<Record<string, unknown>>((s, k) => {
        s[k] = (v as Record<string, unknown>)[k]; return s;
      }, {});
    }
    return v;
  });
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export interface Violation03 {
  version: number;
  category: string;
  message: string;
  checkId: string;
  chain: string;
}

export interface VerificationResult03 {
  valid: boolean;
  level: number;
  violations: Violation03[];
  entriesChecked: number;
  estimators: Array<{ name: string; version: string; opaque: boolean }>;
}

const VALID_ST = new Set(["none", "socratic", "probing", "metacognitive", "scaffolding", "explain", "hint", "demonstrate"]);
const VALID_EM = new Set(["experience", "inference", "analogy", "testimony"]);
const VALID_CA = new Set(["granted", "withdrawn"]);
const VALID_CS = new Set(["instruction", "research", "export"]);
const VALID_TR = new Set(["correct", "slip", "misconception", "disengagement", "ambiguous"]);
const VALID_DL = new Set(["surface", "conceptual", "transfer", "integration"]);
const VALID_DT = new Set(["INSTRUCTIONAL", "REPORTING", "PLACEMENT", "CREDENTIAL"]);

export function verifyRecordV03(
  record: Record<string, any>,
  timestampToleranceMs = 1000,
  estimateTolerance = 1e-4,
): VerificationResult03 {
  const violations: Violation03[] = [];
  const V = (v: number, cat: string, msg: string, id: string, chain: string) =>
    violations.push({ version: v, category: cat, message: msg, checkId: id, chain });

  if (!record.studentScopeId) V(0, "schema", "Missing studentScopeId", "SCHEMA.REQUIRED", "record");

  const evidence = record.evidence || {};
  const evEntries: any[] = evidence.entries || [];
  const estimates: any[] = record.estimates || [];
  const attestations: any[] = record.attestations || [];
  const exportBlock = record.export;
  const level = estimates.length > 0 ? 2 : 1;

  // Evidence chain
  const evByVersion: Record<number, any> = {};
  const evByHash: Record<string, any> = {};
  const compacted = evidence.compactedBefore;
  let prevV = compacted?.version ?? 0;
  let prevH = compacted?.summaryHash ?? "";
  let prevTs = "";
  const consentState: Record<string, string> = {};

  for (const entry of evEntries) {
    const v = entry.version ?? -1;
    const ch = "evidence";

    for (const req of ["version", "timestamp", "eventHash", "event", "prevHash", "entryHash"]) {
      if (!(req in entry)) V(v, "schema", `${req} is required`, "SCHEMA.REQUIRED", ch);
    }

    const ts: string = entry.timestamp || "";
    const tsMs = ts ? new Date(ts).getTime() : NaN;
    if (ts && isNaN(tsMs)) V(v, "timestamp", `Not valid ISO 8601: ${ts}`, "SCHEMA.TIMESTAMP_FORMAT", ch);
    if (typeof v === "number" && v <= prevV) V(v, "version", `Version ${v} <= previous ${prevV}`, "VERSION.MONOTONIC", ch);

    if (prevTs && ts && !isNaN(tsMs)) {
      const pm = new Date(prevTs).getTime();
      if (!isNaN(pm) && tsMs < pm - timestampToleranceMs) V(v, "timestamp", "Timestamp goes backward", "TIMESTAMP.MONOTONIC", ch);
    }

    const event: any = entry.event || {};
    const kind = event.redacted ? "redacted" : (event.action && VALID_CA.has(event.action)) ? "consent" : "correct" in event ? "observation" : "unknown";
    if (kind === "unknown") V(v, "schema", "Event is not Observation, Consent, or Redacted", "SCHEMA.EVENT_UNION", ch);

    if (kind === "observation") {
      if (event.scaffoldType && !VALID_ST.has(event.scaffoldType)) V(v, "enum", `Invalid scaffoldType`, "ENUM.VALID", ch);
      if (event.epistemicMode && !VALID_EM.has(event.epistemicMode)) V(v, "enum", `Invalid epistemicMode`, "ENUM.VALID", ch);
    }
    if (kind === "consent") {
      if (!VALID_CA.has(event.action)) V(v, "enum", `Invalid consent action`, "ENUM.VALID", ch);
      for (const s of event.scopes || []) {
        if (!VALID_CS.has(s)) V(v, "enum", `Invalid consent scope: ${s}`, "ENUM.VALID", ch);
        consentState[s] = event.action;
      }
    }

    if (kind !== "redacted") {
      const computedEvHash = sha256(canonicalize(event));
      if (entry.eventHash !== computedEvHash) V(v, "hash", "eventHash mismatch", "EVENT.COMMITMENT", ch);
    }

    if (entry.prevHash !== prevH) V(v, "hash", "prevHash mismatch", "HASH.PREV_LINK", ch);

    const entryHashable = { version: entry.version, timestamp: entry.timestamp, eventHash: entry.eventHash, prevHash: entry.prevHash };
    const computedEntryHash = sha256(canonicalize(entryHashable));
    if (entry.entryHash !== computedEntryHash) V(v, "hash", "entryHash mismatch", "HASH.ENTRY_RECOMPUTE", ch);

    evByVersion[v] = entry;
    evByHash[entry.entryHash || ""] = entry;
    if (typeof v === "number") prevV = v;
    prevTs = ts;
    prevH = entry.entryHash || "";
  }

  // Estimate chains
  const estimatorSummaries: Array<{ name: string; version: string; opaque: boolean }> = [];

  for (let idx = 0; idx < estimates.length; idx++) {
    const estChain = estimates[idx];
    const chainLabel = `estimate:${idx}`;
    const estimator = estChain.estimator || {};
    if (!estimator.name) V(0, "schema", "Estimator name missing", "ESTIMATE.DECLARED", chainLabel);

    const isOpaque = estimator.opaque !== false;
    const ruleId = estimator.ruleId;
    const defaultParams = estimator.params || {};
    estimatorSummaries.push({ name: estimator.name || "unknown", version: estimator.version || "?", opaque: isOpaque });

    const estEntries: any[] = estChain.entries || [];
    let estPrevV = estChain.compactedBefore?.version ?? 0;
    let estPrevH = estChain.compactedBefore?.summaryHash ?? "";
    let lastUp: number | null = null;
    let lastEvV = 0;

    for (const entry of estEntries) {
      const v = entry.version ?? -1;

      if (typeof v === "number" && v <= estPrevV) V(v, "version", `Version ${v} <= previous ${estPrevV}`, "VERSION.MONOTONIC", chainLabel);
      if (entry.prevHash !== estPrevH) V(v, "hash", "prevHash mismatch", "HASH.PREV_LINK", chainLabel);

      const hashable = { ...entry }; delete hashable.entryHash;
      const computed = sha256(canonicalize(hashable));
      if (entry.entryHash !== computed) V(v, "hash", "entryHash mismatch", "HASH.ENTRY_RECOMPUTE", chainLabel);

      const evVer = entry.evidenceVersion;
      if (evVer != null && !(evVer in evByVersion)) V(v, "schema", `evidenceVersion ${evVer} not in evidence`, "ESTIMATE.LINKS_EVIDENCE", chainLabel);
      if (evVer != null && evVer <= lastEvV) V(v, "version", `evidenceVersion ${evVer} <= previous ${lastEvV}`, "ESTIMATE.ORDER", chainLabel);

      if (entry.triageResult && !VALID_TR.has(entry.triageResult)) V(v, "enum", `Invalid triageResult`, "ENUM.VALID", chainLabel);
      if (entry.depthLevel && !VALID_DL.has(entry.depthLevel)) V(v, "enum", `Invalid depthLevel`, "ENUM.VALID", chainLabel);
      if (entry.decisionTier && !VALID_DT.has(entry.decisionTier)) V(v, "enum", `Invalid decisionTier`, "ENUM.VALID", chainLabel);

      const w = entry.evidentialWeight;
      if (typeof w === "number" && (w < 0 || w > 1)) V(v, "schema", `Weight ${w} outside [0,1]`, "WEIGHT.RANGE", chainLabel);
      for (const f of ["priorPosterior", "updatedPosterior"]) {
        const pv = entry[f];
        if (typeof pv === "number" && (pv <= 0 || pv >= 1)) V(v, "schema", `${f} ${pv} outside (0,1)`, "POSTERIOR.RANGE", chainLabel);
      }

      if (lastUp !== null && typeof entry.priorPosterior === "number" && Math.abs(entry.priorPosterior - lastUp) > 1e-9) {
        V(v, "posterior", `priorPosterior (${entry.priorPosterior}) != previous updatedPosterior (${lastUp})`, "POSTERIOR.CHAIN", chainLabel);
      }

      if (!isOpaque && ruleId) {
        const params = entry.params || defaultParams;
        const evEntry = evByVersion[evVer] || {};
        const evEvent = evEntry.event || {};
        const correct = evEvent.correct;
        if (correct !== undefined && typeof entry.priorPosterior === "number" && typeof w === "number") {
          const reproduced = reproduce(ruleId, params, entry.priorPosterior, correct, w);
          if (reproduced !== null && Math.abs(reproduced - entry.updatedPosterior) > estimateTolerance) {
            V(v, "estimate", `Reproduced ${reproduced.toFixed(6)} != recorded ${entry.updatedPosterior.toFixed(6)}`, "ESTIMATE.REPRODUCE", chainLabel);
          }
        }
      }

      if (typeof v === "number") estPrevV = v;
      estPrevH = entry.entryHash || "";
      if (typeof entry.updatedPosterior === "number") lastUp = entry.updatedPosterior;
      if (evVer != null) lastEvV = evVer;
    }
  }

  // Record-level
  if (exportBlock) {
    const scope = exportBlock.scope;
    if (scope && consentState[scope] === "withdrawn") {
      V(0, "consent", `Scope '${scope}' was withdrawn`, "CONSENT.WITHDRAWAL", "record");
    } else if (scope && !(scope in consentState)) {
      V(0, "consent", `No consent for scope '${scope}'`, "CONSENT.SCOPE", "record");
    }
  }

  for (const att of attestations) {
    if (att.payload && att.payloadHash) {
      const computed = sha256(canonicalize(att.payload));
      if (computed !== att.payloadHash) V(0, "hash", "Attestation payloadHash mismatch", "ATTEST.INTEGRITY", "record");
    }
    const covers = att.covers || {};
    if (covers.throughEvidenceVersion != null && !(covers.throughEvidenceVersion in evByVersion)) {
      V(0, "schema", `Attestation covers version ${covers.throughEvidenceVersion} not in evidence`, "ATTEST.COVERS", "record");
    }
    if (covers.evidenceEntryHash && !(covers.evidenceEntryHash in evByHash)) {
      V(0, "hash", "Attestation covers hash not in evidence", "ATTEST.COVERS", "record");
    }
  }

  return {
    valid: violations.length === 0,
    level,
    violations,
    entriesChecked: evEntries.length + estimates.reduce((s: number, e: any) => s + (e.entries?.length || 0), 0),
    estimators: estimatorSummaries,
  };
}
