/**
 * Product envelope schemes — the per-record hashes QLM products seal besides
 * the clinical chains in ./index.ts. Each is a verbatim, named definition of
 * what the product's own code hashed on the date given; the vectors in
 * schema/vectors/chains were generated from the original functions.
 *
 * This file imports only types from ./index.ts so the two modules do not form
 * a runtime cycle. Python twin: python/qlm_measure/schemes.py.
 */
import type { ChainEvent, ChainScheme } from "./index.js";

const str = (v: unknown): string => (v === undefined || v === null ? "" : String(v));

// ── play/emit-1 — qlm-games src/app/api/evidence/emit/route.ts ────────────
// computeChainHash(event, prevHash): sha256 of JSON.stringify({student_id,
// product, construct, signal, weight, prev_hash: prevHash || "genesis"}).
// Stored row: chain_hash / prev_hash ("genesis" on the first row).
export const PLAY_EMIT_1: ChainScheme = {
  id: "play/emit-1", family: "play/emit", since: "2026-09-01",
  hashField: "chain_hash", prevField: "prev_hash", genesis: "genesis",
  applies: () => true,
  canonical: (e) => JSON.stringify({
    student_id: e.student_id, product: e.product, construct: e.construct, signal: e.signal, weight: e.weight,
    prev_hash: (e.prev_hash as string) || "genesis",
  }),
  validate: (e) => {
    const errors: string[] = [];
    for (const f of ["student_id", "product", "construct", "signal"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    return errors;
  },
};

// ── play/measure-session-1 — qlm-games src/app/api/measure/session/route.ts ─
// computeEventHash(studyId, sessionId, event): sha256 hex truncated to 32 of
// JSON.stringify({studyId, sessionId, studentId ?? 'unknown', timestamp ?? '',
// correct, domain ?? '', responseTimeMs ?? null, sequenceNumber ?? null}).
// A content hash used for idempotent replay; records carry no link.
// The stored row's study_id / session_id / student_id are the hash inputs.
export const PLAY_MEASURE_SESSION_1: ChainScheme = {
  id: "play/measure-session-1", family: "play/measure-session", since: "2026-08-20",
  hashField: "event_hash", prevField: null, genesis: null, link: "none", truncate: 32,
  applies: () => true,
  canonical: (e) => JSON.stringify({
    studyId: e.studyId ?? e.study_id, sessionId: e.sessionId ?? e.session_id,
    studentId: e.studentId ?? e.student_id ?? "unknown", timestamp: e.timestamp ?? "",
    correct: e.correct, domain: e.domain ?? "", responseTimeMs: e.responseTimeMs ?? e.response_time_ms ?? null,
    sequenceNumber: e.sequenceNumber ?? e.sequence_number ?? null,
  }),
  validate: (e) => {
    const errors: string[] = [];
    if (!(e.studyId ?? e.study_id)) errors.push("missing studyId");
    if (!(e.sessionId ?? e.session_id)) errors.push("missing sessionId");
    return errors;
  },
};

// ── play/encounter-fnv64-1 — qlm-games src/lib/credentials/platform/evidence-schema.ts
// computeEventHash: hashSnapshotSync (FNV-1a 64 over UTF-16 units) of
// JSON.stringify({eventId, ts, encounterId, actor, source, type, payload,
// consentRef, prevHash}) in that insertion order. Fields: eventHash / prevHash
// ("" on the first event). It labels itself schemaVersion "clin-1.0", which is
// NOT the SHA-256 residency scheme play/clinical-clin-1.0.
export const PLAY_ENCOUNTER_FNV64_1: ChainScheme = {
  id: "play/encounter-fnv64-1", family: "play/encounter", since: "2026-08-16",
  hashField: "eventHash", prevField: "prevHash", genesis: "", digest: "fnv1a64",
  applies: (e) => e.eventHash !== undefined || e.schemaVersion === "clin-1.0",
  canonical: (e) => JSON.stringify({
    eventId: e.eventId, ts: e.ts, encounterId: e.encounterId, actor: e.actor, source: e.source,
    type: e.type, payload: e.payload, consentRef: e.consentRef, prevHash: e.prevHash,
  }),
  validate: (e) => {
    const errors: string[] = [];
    for (const f of ["eventId", "ts", "encounterId", "type"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    return errors;
  },
};

// ── play/research-provenance-1 — qlm-games src/lib/research/evidence-provenance-chain.ts
// computeChainHash(chain): sha256 of the concatenation (no separators) of
// designLayer.blueprintId, JSON.stringify(designLayer.auditResult.scores),
// String(runtimeLayer.worldId)+String(eventCount)+String(evidenceChainIntegrity),
// then proofLayer.protocolCommitmentHash+bridgeCertificateHash if present, then
// lineageLayer.closureRate+allLineagesClosed if present. One record, no link.
export const PLAY_RESEARCH_PROVENANCE_1: ChainScheme = {
  id: "play/research-provenance-1", family: "play/research-provenance", since: "2026-08-25",
  hashField: "chainHash", prevField: null, genesis: null, link: "none",
  applies: (e) => typeof e.designLayer === "object" && e.designLayer !== null,
  canonical: (e) => {
    const d = e.designLayer as Record<string, unknown>; const r = e.runtimeLayer as Record<string, unknown>;
    const p = e.proofLayer as Record<string, unknown> | undefined; const l = e.lineageLayer as Record<string, unknown> | undefined;
    const parts: string[] = [];
    parts.push(str(d.blueprintId));
    parts.push(JSON.stringify((d.auditResult as Record<string, unknown>).scores));
    parts.push(String(r.worldId) + String(r.eventCount) + String(r.evidenceChainIntegrity));
    if (p) parts.push(String(p.protocolCommitmentHash) + String(p.bridgeCertificateHash));
    if (l) parts.push(String(l.closureRate) + String(l.allLineagesClosed));
    return parts.join("");
  },
  validate: (e) => {
    const errors: string[] = [];
    if (!e.designLayer) errors.push("missing designLayer");
    if (!e.runtimeLayer) errors.push("missing runtimeLayer");
    return errors;
  },
};

// ── qcore/qinverse-djb2-1 — qlm-games src/lib/q-core/qinverse/evidence-chain.ts
// (identical copy in crucible-teacher). computeEventHash: djb2 (32-bit) of
// JSON.stringify({eventId, type, data, prevHash, sequence, seed}); fields
// hash / prevHash ("genesis" first). djb2 is not collision resistant: the
// chain is order-evident, not tamper-evident. A SHA-256 successor scheme is
// the product's call; verification of what was sealed needs this one.
export const QCORE_QINVERSE_DJB2_1: ChainScheme = {
  id: "qcore/qinverse-djb2-1", family: "qcore/qinverse", since: "2026-08-10",
  hashField: "hash", prevField: "prevHash", genesis: "genesis", digest: "djb2-32",
  applies: () => true,
  canonical: (e) => JSON.stringify({ eventId: e.eventId, type: e.type, data: e.data, prevHash: e.prevHash, sequence: e.sequence, seed: e.seed }),
  validate: (e) => {
    const errors: string[] = [];
    if (typeof e.eventId !== "string" || !e.eventId) errors.push("missing eventId");
    if (typeof e.sequence !== "number") errors.push("missing sequence");
    return errors;
  },
};

// ── studio/loop-1 — qlm-studio src/lib/loop/evidence.ts ───────────────────
// hashEvent(prevHash, event): sha256 of canonical({prevHash, ...event}) where
// canonical = JSON.stringify(sortedKeys.map(k => [k, value])) over exactly
// {sessionId, participantId, stage, event, at, payload}; the stored `id` is
// not hashed. Fields hash / prevHash ("genesis" first).
const STUDIO_FIELDS = ["sessionId", "participantId", "stage", "event", "at", "payload"] as const;
export const STUDIO_LOOP_1: ChainScheme = {
  id: "studio/loop-1", family: "studio/loop", since: "2026-09-05",
  hashField: "hash", prevField: "prevHash", genesis: "genesis",
  applies: () => true,
  canonical: (e) => {
    const input: Record<string, unknown> = { prevHash: e.prevHash };
    for (const f of STUDIO_FIELDS) input[f] = e[f];
    const keys = Object.keys(input).sort();
    return JSON.stringify(keys.map((k) => [k, input[k]]));
  },
  validate: (e) => {
    const errors: string[] = [];
    for (const f of ["sessionId", "participantId", "stage", "event", "at"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    return errors;
  },
};

// ── dp/ledger-v3 — art-of-kings src/lib/engine/v3/event-ledger.ts ────────
// computeEventHash(event, previousEventHash): sha256 over
// (previousEventHash ?? "") followed by canonicalize(event), where the event
// excludes eventHash, eventSignature, signatureKeyVersion and receivedAt, and
// canonicalize is the RFC 8785-style form below (sorted keys, JSON scalars,
// undefined → null). previousEventHash is absent on the first event.
// eventSignature (HMAC over the hash) is a tenant signature, not the chain
// link, and is outside this scheme.
export function canonicalizeRfc8785(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null) return "null";
  if (typeof value === "boolean") return value.toString();
  if (typeof value === "number") {
    if (!isFinite(value)) throw new Error("Non-finite number in canonical event");
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalizeRfc8785).join(",") + "]";
  if (typeof value === "object") {
    const sorted = Object.keys(value as Record<string, unknown>).sort()
      .map((k) => JSON.stringify(k) + ":" + canonicalizeRfc8785((value as Record<string, unknown>)[k]));
    return "{" + sorted.join(",") + "}";
  }
  throw new Error(`Unserializable type: ${typeof value}`);
}
const DP_EXCLUDED = new Set(["eventHash", "eventSignature", "signatureKeyVersion", "receivedAt"]);
/** The envelope keys buildEvent always sets (undefined optionals canonicalize to null). */
const DP_FIELDS = [
  "eventId", "tenantId", "sessionId", "learnerId", "actorUserId", "actorRole", "eventSeq", "eventType", "occurredAt",
  "requestId", "idempotencyKey", "scenarioId", "scenarioVersion", "turnId", "checkpointId", "stateBeforeHash", "stateAfterHash",
  "knowledgeSnapshotId", "payloadSchema", "payloadVersion", "payload", "previousEventHash",
] as const;
export const DP_LEDGER_V3: ChainScheme = {
  id: "dp/ledger-v3", family: "dp/ledger", since: "2026-08-28",
  hashField: "eventHash", prevField: "previousEventHash", genesis: null,
  applies: () => true,
  canonical: (e) => {
    // The sealer canonicalized every envelope key (absent optionals as null),
    // so a stored row that dropped them is canonicalized as the sealer saw it;
    // any extra stored key outside the excluded four is hashed too, as the
    // product's own verifier would.
    const rest: Record<string, unknown> = {};
    for (const k of DP_FIELDS) rest[k] = e[k] === undefined ? null : e[k];
    for (const k of Object.keys(e)) if (!DP_EXCLUDED.has(k) && !(k in rest)) rest[k] = e[k];
    return str(e.previousEventHash) + canonicalizeRfc8785(rest);
  },
  validate: (e) => {
    const errors: string[] = [];
    for (const f of ["eventId", "tenantId", "sessionId", "eventType"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    if (typeof e.eventSeq !== "number") errors.push("missing eventSeq");
    return errors;
  },
};

// ── tpc/dse-journal-1 — teachproof src/lib/tutor-lab/dse/journal.ts ──────
// computeEntryHash(prevHash, entry): sha256 of prevHash + JSON.stringify({seq,
// eventType, data}). Entries store `hash` only; the link is implicit in order
// (the previous entry's hash, "" for the first). `timestamp` is not hashed.
export const TPC_DSE_JOURNAL_1: ChainScheme = {
  id: "tpc/dse-journal-1", family: "tpc/dse-journal", since: "2026-09-08",
  hashField: "hash", prevField: null, genesis: "", link: "implicit",
  applies: () => true,
  canonical: (e, prev) => (prev ?? "") + JSON.stringify({ seq: e.seq, eventType: e.eventType, data: e.data }),
  validate: (e) => {
    const errors: string[] = [];
    if (typeof e.seq !== "number") errors.push("missing seq");
    if (typeof e.eventType !== "string" || !e.eventType) errors.push("missing eventType");
    return errors;
  },
};

// ── yardstick/spine-1 — yardstick/project_spine/models.py ResponseRecord ──
// compute_chain_hash(previous_hash): sha256 of the UTF-8 bytes of
// f"{previous_hash}:{enrollment_id}:{item_id}:{response}:{correct}" with
// Python's str() forms: UUIDs as text, booleans as True/False.
export const YARDSTICK_SPINE_1: ChainScheme = {
  id: "yardstick/spine-1", family: "yardstick/spine", since: "2026-08-30",
  hashField: "chain_hash", prevField: "previous_hash", genesis: "",
  applies: () => true,
  canonical: (e) => {
    // Python's f-string forms: True/False for booleans, None for a missing value — including previous_hash.
    const py = (v: unknown): string => (v === true ? "True" : v === false ? "False" : v === null || v === undefined ? "None" : String(v));
    return `${py(e.previous_hash)}:${py(e.enrollment_id)}:${py(e.item_id)}:${py(e.response)}:${py(e.correct)}`;
  },
  validate: (e) => {
    const errors: string[] = [];
    for (const f of ["enrollment_id", "item_id"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    return errors;
  },
};

// ── labpath/learning-evidence-v1 — qlm-games src/lib/ecogenesis/labpath/learning-evidence-event.ts
// hashLearningEvidenceEvent(draft): sha256 of JSON.stringify(sortObject(draft))
// where draft is the whole event minus `hash` and sortObject orders keys at
// every depth with String.prototype.localeCompare. Fields hash / prev_hash
// (null on the first event).
export function sortObjectLocale(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectLocale);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, sortObjectLocale(nested)]),
  );
}
export const LABPATH_LEARNING_EVIDENCE_V1: ChainScheme = {
  id: "labpath/learning-evidence-v1", family: "labpath/learning-evidence", since: "2026-09-12",
  hashField: "hash", prevField: "prev_hash", genesis: null,
  applies: (e) => typeof e.event_id === "string",
  canonical: (e) => {
    const { hash: _h, ...draft } = e;
    void _h;
    return JSON.stringify(sortObjectLocale(draft));
  },
  validate: (e) => {
    const errors: string[] = [];
    for (const f of ["event_id", "learner_id", "ts", "world_id", "session_id"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    return errors;
  },
};

// ── tpc/transcript-1 — teachproof src/app/api/clinical/evidence/process/route.ts
// Stage 3 seals an evidence item: sha256 of JSON.stringify({text, turns,
// sourceType, duration}) — the item's transcript column — and stores the
// previous item's hash as prev_hash (null on the learner's first item). The
// link is stored, not hashed; the verifier checks it separately.
export const TPC_TRANSCRIPT_1: ChainScheme = {
  id: "tpc/transcript-1", family: "tpc/transcript", since: "2026-08-20",
  hashField: "hash", prevField: "prev_hash", genesis: null,
  applies: (e) => typeof e.transcript === "object" && e.transcript !== null,
  canonical: (e) => {
    const t = e.transcript as Record<string, unknown>;
    return JSON.stringify({ text: t.text, turns: t.turns, sourceType: t.sourceType, duration: t.duration });
  },
  validate: (e) => (typeof e.transcript === "object" && e.transcript !== null ? [] : ["missing transcript"]),
};

// ── tpc/differential-commit-1 — teachproof src/lib/clinical/longitudinal/events/differential-commit.ts
// Commit and skip events are appended to the clinical evidence chain (same
// hash/prev_hash fields, so they coexist with tpc/clinical-v*). hashCommit:
// sha256 of JSON.stringify(canonical) where canonical is
//   ["differential_commit", learner, encounter, checkpoint, rankedDifferential, whyText, nextAction, discipline, prev_hash]
// or ["commit_skipped", learner, encounter, checkpoint, reason, prev_hash]. `turn` is not hashed.
export const TPC_DIFFERENTIAL_COMMIT_1: ChainScheme = {
  id: "tpc/differential-commit-1", family: "tpc/clinical", since: "2026-09-14",
  hashField: "hash", prevField: "prev_hash", genesis: "genesis",
  applies: (e) => e.type === "differential_commit" || e.type === "commit_skipped",
  canonical: (e) => JSON.stringify(e.type === "differential_commit"
    ? ["differential_commit", e.learner, e.encounter, e.checkpoint, e.rankedDifferential, e.whyText, e.nextAction, e.discipline, e.prev_hash]
    : ["commit_skipped", e.learner, e.encounter, e.checkpoint, e.reason, e.prev_hash]),
  validate: (e) => {
    const errors: string[] = [];
    for (const f of ["learner", "encounter", "checkpoint"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    if (e.type === "commit_skipped" && !["skip", "timeout", "not_reached"].includes(e.reason as string)) errors.push(`invalid reason: ${String(e.reason)}`);
    return errors;
  },
  coexists: ["tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3", "tpc/clinical-v4"],
};

// ── tpc/rct-input-1 — teachproof src/lib/rct/result-ledger.ts ────────────
// ledgerFromAnalysis fingerprints the analysis inputs: sha256 of
// JSON.stringify({studyId, nTreatment, nControl, totalOutcomeEvents,
// sourcePipes, dimensions: [{dimension, treatmentN, controlN, treatmentMean,
// controlMean}]}); every ledger entry carries it as inputHash. Unlinked.
export const TPC_RCT_INPUT_1: ChainScheme = {
  id: "tpc/rct-input-1", family: "tpc/rct-input", since: "2026-09-22",
  hashField: "inputHash", prevField: null, genesis: null, link: "none",
  applies: (e) => Array.isArray(e.dimensions),
  canonical: (e) => JSON.stringify({
    studyId: e.studyId, nTreatment: e.nTreatment, nControl: e.nControl, totalOutcomeEvents: e.totalOutcomeEvents, sourcePipes: e.sourcePipes,
    dimensions: (e.dimensions as Array<Record<string, unknown>>).map((d) => ({ dimension: d.dimension, treatmentN: d.treatmentN, controlN: d.controlN, treatmentMean: d.treatmentMean, controlMean: d.controlMean })),
  }),
  validate: (e) => (typeof e.studyId === "string" && e.studyId ? [] : ["missing studyId"]),
};

export const PRODUCT_SCHEMES: ChainScheme[] = [
  PLAY_EMIT_1, PLAY_MEASURE_SESSION_1, PLAY_ENCOUNTER_FNV64_1, PLAY_RESEARCH_PROVENANCE_1,
  QCORE_QINVERSE_DJB2_1, STUDIO_LOOP_1, DP_LEDGER_V3, TPC_DSE_JOURNAL_1, YARDSTICK_SPINE_1, LABPATH_LEARNING_EVIDENCE_V1,
  TPC_TRANSCRIPT_1, TPC_DIFFERENTIAL_COMMIT_1, TPC_RCT_INPUT_1,
];
