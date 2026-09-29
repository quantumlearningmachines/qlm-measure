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

/** Same as index.ts sortKeysDeep (this module imports only types from there). */
function sortKeysDeep(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    return sorted;
  }
  return value;
}

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
// 0.7.0: a record that carries commit_schema is never this scheme's, so a
// version 2 commit's added fields are always covered (version 2, below), and
// a commit that carries those fields without commit_schema fails validation
// rather than verifying with them unhashed. Skip records stay here, and
// acted_without_commit joins the reasons (TPC-SPEC-002 E6). The canonical
// form is unchanged.
const isCommitType = (e: ChainEvent): boolean => e.type === "differential_commit" || e.type === "commit_skipped";
const COMMIT_SKIP_REASONS = ["skip", "timeout", "not_reached", "acted_without_commit"];
/** The fields version 2 appends to version 1's list, in hash order. */
const COMMIT_V2_FIELDS = ["concepts", "statuses", "confidence", "evidenceLinks", "discriminator", "planLinks", "trigger", "captureSnapshot", "supersedes"] as const;
const commitV1List = (e: ChainEvent): unknown[] =>
  ["differential_commit", e.learner, e.encounter, e.checkpoint, e.rankedDifferential, e.whyText, e.nextAction, e.discipline, e.prev_hash];
function commitValidate(e: ChainEvent): string[] {
  const errors: string[] = [];
  for (const f of ["learner", "encounter", "checkpoint"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
  if (e.type === "commit_skipped" && !COMMIT_SKIP_REASONS.includes(e.reason as string)) errors.push(`invalid reason: ${String(e.reason)}`);
  return errors;
}
/**
 * Version 1's checks. As the family's last scheme it also checks a commit
 * record no scheme applies to, so it says why: a commit_schema that is not
 * version 2's, or version 2's fields on a record without it.
 */
function commitV1Validate(e: ChainEvent): string[] {
  const errors = commitValidate(e);
  if (e.commit_schema !== undefined) {
    errors.push(e.type !== "differential_commit" ? `${String(e.type)} carries no commit_schema`
      : e.commit_schema === 2 ? "a commit with commit_schema 2 is tpc/differential-commit-2's"
      : `invalid commit_schema: ${String(e.commit_schema)}`);
  } else if (e.type === "differential_commit") {
    const added = COMMIT_V2_FIELDS.filter((f) => e[f] !== undefined);
    if (added.length > 0) errors.push(`fields without commit_schema 2: ${added.join(", ")}`);
  }
  return errors;
}
export const TPC_DIFFERENTIAL_COMMIT_1: ChainScheme = {
  id: "tpc/differential-commit-1", family: "tpc/clinical", since: "2026-09-14",
  hashField: "hash", prevField: "prev_hash", genesis: "genesis",
  applies: (e) => isCommitType(e) && e.commit_schema === undefined,
  canonical: (e) => JSON.stringify(e.type === "differential_commit"
    ? commitV1List(e)
    : ["commit_skipped", e.learner, e.encounter, e.checkpoint, e.reason, e.prev_hash]),
  validate: commitV1Validate,
  coexists: ["tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3", "tpc/clinical-v4", "tpc/differential-commit-2"],
};

// ── tpc/differential-commit-2 — TPC-SPEC-002 E4, the commit model ─────────
// A commit that carries commit_schema: 2. Version 1's list is hashed as it
// was, then commit_schema and the E4 fields append in this fixed order, each
// with its keys sorted at every depth (stored rows may reorder keys):
//   [...version 1's list, commit_schema, concepts, statuses, confidence,
//    evidenceLinks, discriminator, planLinks, trigger, captureSnapshot, supersedes]
// Missing fields hash as null and fail validation: every field is written,
// null where empty. The objects inside take only their named keys, so every
// valid record hashes the same in JavaScript and Python. Records sealed under
// version 1 keep verifying under it, and the two coexist in one chain. Its
// definition; there is no older sealer.
const COMMIT_CHECKPOINTS = ["pre_brief", "post_history", "on_evidence", "pre_close"];
const COMMIT_DISCIPLINES = ["OD", "RN", "GM"];
const COMMIT_STATUSES = ["leading", "active", "ruled_out"];
const DISCRIMINATOR_KINDS = ["question", "test", "finding", "time"];
const MAX_RANKED = 5;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const nonEmpty = (v: unknown): v is string => typeof v === "string" && v !== "";
/** An object with no key but these (each still checked on its own). */
const onlyKeys = (o: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(o).every((k) => keys.includes(k));
/** A 1-based position in rankedDifferential. */
const isRank = (v: unknown, n: number): boolean => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= n;

function commitV2Validate(e: ChainEvent): string[] {
  const errors = commitValidate(e);
  if (e.commit_schema !== 2) errors.push(`invalid commit_schema: ${String(e.commit_schema)}`);
  if (nonEmpty(e.checkpoint) && !COMMIT_CHECKPOINTS.includes(e.checkpoint)) errors.push(`invalid checkpoint: ${e.checkpoint}`);
  const ranked = e.rankedDifferential;
  const n = Array.isArray(ranked) ? ranked.length : 0;
  if (!Array.isArray(ranked) || n < 1 || n > MAX_RANKED || !ranked.every(nonEmpty)) errors.push(`rankedDifferential must be 1 to ${MAX_RANKED} non-empty strings`);
  if (typeof e.whyText !== "string") errors.push("whyText must be a string");
  if (e.nextAction !== null && typeof e.nextAction !== "string") errors.push("nextAction must be a string or null");
  if (!COMMIT_DISCIPLINES.includes(e.discipline as string)) errors.push(`invalid discipline: ${String(e.discipline)}`);
  const perEntry = (f: string, what: string, ok: (v: unknown) => boolean): void => {
    const a = e[f];
    if (!Array.isArray(a) || a.length !== n || !a.every(ok)) errors.push(`${f} must hold one ${what} per ranked entry`);
  };
  perEntry("concepts", "concept id or null", (c) => c === null || nonEmpty(c));
  perEntry("statuses", "of leading, active, ruled_out", (s) => COMMIT_STATUSES.includes(s as string));
  perEntry("confidence", "number 0 to 100 or null", (c) => c === null || (typeof c === "number" && c >= 0 && c <= 100));
  const snapshot = Array.isArray(e.captureSnapshot) && e.captureSnapshot.every(nonEmpty) ? (e.captureSnapshot as string[]) : null;
  if (!snapshot) errors.push("captureSnapshot must be an array of non-empty strings");
  // E4: evidence links point only into the capture snapshot.
  if (!Array.isArray(e.evidenceLinks)) errors.push("evidenceLinks must be an array");
  else e.evidenceLinks.forEach((l: unknown, i: number) => {
    if (!isRecord(l) || !onlyKeys(l, ["rank", "ref", "direction"]) || !isRank(l.rank, n) || !nonEmpty(l.ref) || (l.direction !== "for" && l.direction !== "against")) {
      errors.push(`invalid evidenceLinks[${i}]`);
    } else if (snapshot && !snapshot.includes(l.ref)) errors.push(`evidenceLinks[${i}] ref not in captureSnapshot: ${l.ref}`);
  });
  const d = e.discriminator;
  if (d !== null && (!isRecord(d) || !onlyKeys(d, ["kind", "ref", "text"]) || !DISCRIMINATOR_KINDS.includes(d.kind as string)
    || (d.ref !== null && !nonEmpty(d.ref)) || typeof d.text !== "string")) {
    errors.push("invalid discriminator");
  }
  if (!Array.isArray(e.planLinks)) errors.push("planLinks must be an array");
  else e.planLinks.forEach((l: unknown, i: number) => {
    if (!isRecord(l) || !onlyKeys(l, ["rank", "ref"]) || !isRank(l.rank, n) || !nonEmpty(l.ref)) errors.push(`invalid planLinks[${i}]`);
  });
  if (e.trigger !== null && !nonEmpty(e.trigger)) errors.push("trigger must be a non-empty string or null");
  else if (e.checkpoint === "on_evidence" && e.trigger === null) errors.push("on_evidence needs a trigger");
  if (e.supersedes !== null && !nonEmpty(e.supersedes)) errors.push("supersedes must be a hash or null");
  return errors;
}

export const TPC_DIFFERENTIAL_COMMIT_2: ChainScheme = {
  id: "tpc/differential-commit-2", family: "tpc/clinical", since: "2026-09-28",
  hashField: "hash", prevField: "prev_hash", genesis: "genesis",
  applies: (e) => e.type === "differential_commit" && e.commit_schema === 2,
  canonical: (e) => JSON.stringify([...commitV1List(e), e.commit_schema, ...COMMIT_V2_FIELDS.map((f) => sortKeysDeep(e[f] ?? null))]),
  validate: commitV2Validate,
  coexists: ["tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3", "tpc/clinical-v4", "tpc/differential-commit-1"],
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

// ═══════════════════════════════════════════════════════════════════════════
// 0.6.0 — chains found by the 2026-09-27 audit (docs/PLATFORM.md §12). They
// were missed by the first inventory because it grepped for function names
// and the CI gate filtered by file name; both are now digest-based.
// ═══════════════════════════════════════════════════════════════════════════

// ── play/world-trace — qlm-games src/app/ecogenesis/worlds/components/*World.tsx
// Every LabPath world component sealed its own "world-trace/1" trace in the
// browser with a local djb2: hash = djb2(prevHash + JSON.stringify(array)),
// prevHash "00000000" on the first event, kept in localStorage and exported
// as <world>-evidence.json. Fifty files, three canonical arrays:
//   play/world-trace-1           [seq, type, payload]                          46 worlds
//   play/world-trace-tsim-1      [seq, type, payload, tSim]                    simpleforces, soundlab, statesofmatter
//   play/world-trace-identity-1  [seq, type, payload, {missionId, band, seed}] cybersim, schemaVersion "world-trace/2"
// djb2 is not collision resistant: a trace is order-evident, not tamper-evident.
const WORLD_TRACE_TSIM_WORLDS = new Set(["simpleforces", "soundlab", "statesofmatter"]);
function worldTraceValidate(e: ChainEvent): string[] {
  const errors: string[] = [];
  if (typeof e.seq !== "number") errors.push("missing seq");
  if (typeof e.type !== "string" || !e.type) errors.push("missing type");
  if (typeof e.prevHash !== "string") errors.push("missing prevHash");
  if (!e.payload || typeof e.payload !== "object" || Array.isArray(e.payload)) errors.push("payload must be an object");
  return errors;
}
const worldTraceCommon = { family: "play/world-trace", hashField: "hash", prevField: "prevHash", genesis: "00000000", digest: "djb2-32" as const, validate: worldTraceValidate };
const isWorldTrace2 = (e: ChainEvent): boolean => e.schemaVersion === "world-trace/2";
const isTsimWorld = (e: ChainEvent): boolean => WORLD_TRACE_TSIM_WORLDS.has(String(e.worldId));

export const PLAY_WORLD_TRACE_IDENTITY_1: ChainScheme = {
  ...worldTraceCommon, id: "play/world-trace-identity-1", since: "2026-09-24",
  applies: (e) => isWorldTrace2(e),
  // The sealer hashed its identity object literal {missionId, band, seed} in that key order.
  canonical: (e) => String(e.prevHash) + JSON.stringify([e.seq, e.type, e.payload, { missionId: e.missionId, band: e.band, seed: e.seed }]),
};
export const PLAY_WORLD_TRACE_TSIM_1: ChainScheme = {
  ...worldTraceCommon, id: "play/world-trace-tsim-1", since: "2026-09-24",
  applies: (e) => !isWorldTrace2(e) && isTsimWorld(e),
  canonical: (e) => String(e.prevHash) + JSON.stringify([e.seq, e.type, e.payload, e.tSim]),
};
export const PLAY_WORLD_TRACE_1: ChainScheme = {
  ...worldTraceCommon, id: "play/world-trace-1", since: "2026-09-24",
  applies: (e) => !isWorldTrace2(e) && !isTsimWorld(e),
  canonical: (e) => String(e.prevHash) + JSON.stringify([e.seq, e.type, e.payload]),
};

// ── tpc/yardstick-record — teachproof src/lib/yardstick/record-types.ts ──
// computeDigest(content): sha256 of JSON.stringify(content, Object.keys(content).sort())
// over {sequence, type, studyId, timestamp, payload, prevDigest}; fields
// digest / prevDigest ("0" × 64 on the first record). The records live in
// teachproof_studies.record_sequence.
//
// An array replacer is a property whitelist that JSON.stringify applies at
// EVERY depth, so `payload` serializes as `{}` unless a nested key happens
// to be named like a top-level one: version 1 does not cover the payload.
// It is kept verbatim so sealed sequences still verify; version 2 hashes
// the same six fields with keys sorted at every depth and covers the
// payload. The two coexist in one sequence (old records v1, new v2).
const YR_FIELDS = ["sequence", "type", "studyId", "timestamp", "payload", "prevDigest"] as const;
const YR_REPLACER = [...YR_FIELDS].sort();
function yrContent(e: ChainEvent): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const f of YR_FIELDS) c[f] = e[f];
  return c;
}
function yrValidate(e: ChainEvent): string[] {
  const errors: string[] = [];
  if (typeof e.sequence !== "number") errors.push("missing sequence");
  for (const f of ["type", "studyId", "timestamp"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
  if (!e.payload || typeof e.payload !== "object" || Array.isArray(e.payload)) errors.push("payload must be an object");
  return errors;
}
const yrCommon = { family: "tpc/yardstick-record", hashField: "digest", prevField: "prevDigest", genesis: "0".repeat(64), applies: () => true, validate: yrValidate };
export const TPC_YARDSTICK_RECORD_2: ChainScheme = {
  ...yrCommon, id: "tpc/yardstick-record-2", since: "2026-09-28",
  canonical: (e) => JSON.stringify(sortKeysDeep(yrContent(e))),
  coexists: ["tpc/yardstick-record-1"],
};
export const TPC_YARDSTICK_RECORD_1: ChainScheme = {
  ...yrCommon, id: "tpc/yardstick-record-1", since: "2026-09-21",
  canonical: (e) => JSON.stringify(yrContent(e), YR_REPLACER),
  coexists: ["tpc/yardstick-record-2"],
};

// ── tpc/intervention-1 — teachproof src/lib/clinical/longitudinal/programos/intervention-loop.ts
// recordAction: sha256 of JSON.stringify([type, provenance, flagId, actor,
// actionType, constructId, rationale, timestamp, prevHash]); fields hash /
// prevHash ("genesis" first). id, windowOpportunities and windowDays are not hashed.
export const TPC_INTERVENTION_1: ChainScheme = {
  id: "tpc/intervention-1", family: "tpc/intervention", since: "2026-09-21",
  hashField: "hash", prevField: "prevHash", genesis: "genesis",
  applies: () => true,
  canonical: (e) => JSON.stringify([e.type, e.provenance, e.flagId, e.actor, e.actionType, e.constructId, e.rationale, e.timestamp, e.prevHash]),
  validate: (e) => {
    const errors: string[] = [];
    for (const f of ["flagId", "actor", "actionType", "constructId", "timestamp"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    return errors;
  },
};

// ── tpc/rehearsal-stage-1 — teachproof src/lib/clinical/longitudinal/study/rehearsal-runner.ts
// recordStage: sha256 of JSON.stringify([stage, passed, timestamp, prevHash])
// where prevHash is the previous stage's hash ("genesis" first) and is not
// stored on the result: the link is implicit in order.
export const TPC_REHEARSAL_STAGE_1: ChainScheme = {
  id: "tpc/rehearsal-stage-1", family: "tpc/rehearsal-stage", since: "2026-09-21",
  hashField: "hash", prevField: null, genesis: "genesis", link: "implicit",
  applies: () => true,
  canonical: (e, prev) => JSON.stringify([e.stage, e.passed, e.timestamp, prev ?? "genesis"]),
  validate: (e) => {
    const errors: string[] = [];
    if (typeof e.stage !== "string" || !e.stage) errors.push("missing stage");
    if (typeof e.passed !== "boolean") errors.push("missing passed");
    if (typeof e.timestamp !== "string" || !e.timestamp) errors.push("missing timestamp");
    return errors;
  },
};

// ── yardstick/activity-1 — yardstick packages/engine/studies/activity.py ──
// _entry_hash(entry, prev): sha256 of prev + "\n" + json.dumps(body,
// sort_keys=True, separators=(",", ":"), ensure_ascii=False) where body is
// the entry minus `hash` (so `prev`, `scheme` and `seq` are hashed); fields
// hash / prev ("0" × 64 first). One activity.jsonl per study.
// The Python twin is the reference. This form equals Python's for strings,
// integers, booleans, null, lists and objects; a float would differ where
// Python and JavaScript print it differently (5.0 vs 5) and entries carry none.
export const YARDSTICK_ACTIVITY_1: ChainScheme = {
  id: "yardstick/activity-1", family: "yardstick/activity", since: "2026-09-26",
  hashField: "hash", prevField: "prev", genesis: "0".repeat(64),
  applies: () => true,
  canonical: (e) => {
    const { hash: _h, ...body } = e;
    void _h;
    return String(e.prev) + "\n" + JSON.stringify(sortKeysDeep(body));
  },
  validate: (e) => {
    const errors: string[] = [];
    if (typeof e.seq !== "number") errors.push("missing seq");
    for (const f of ["at", "who", "action"]) if (typeof e[f] !== "string" || !e[f]) errors.push(`missing ${f}`);
    return errors;
  },
};

export const PRODUCT_SCHEMES: ChainScheme[] = [
  PLAY_EMIT_1, PLAY_MEASURE_SESSION_1, PLAY_ENCOUNTER_FNV64_1, PLAY_RESEARCH_PROVENANCE_1,
  QCORE_QINVERSE_DJB2_1, STUDIO_LOOP_1, DP_LEDGER_V3, TPC_DSE_JOURNAL_1, YARDSTICK_SPINE_1, LABPATH_LEARNING_EVIDENCE_V1,
  TPC_TRANSCRIPT_1, TPC_DIFFERENTIAL_COMMIT_2, TPC_DIFFERENTIAL_COMMIT_1, TPC_RCT_INPUT_1,
  PLAY_WORLD_TRACE_IDENTITY_1, PLAY_WORLD_TRACE_TSIM_1, PLAY_WORLD_TRACE_1,
  TPC_YARDSTICK_RECORD_2, TPC_YARDSTICK_RECORD_1, TPC_INTERVENTION_1, TPC_REHEARSAL_STAGE_1, YARDSTICK_ACTIVITY_1,
];
