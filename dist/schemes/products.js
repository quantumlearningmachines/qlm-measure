const str = (v) => (v === undefined || v === null ? "" : String(v));
// ── play/emit-1 — qlm-games src/app/api/evidence/emit/route.ts ────────────
// computeChainHash(event, prevHash): sha256 of JSON.stringify({student_id,
// product, construct, signal, weight, prev_hash: prevHash || "genesis"}).
// Stored row: chain_hash / prev_hash ("genesis" on the first row).
export const PLAY_EMIT_1 = {
    id: "play/emit-1", family: "play/emit", since: "2026-09-01",
    hashField: "chain_hash", prevField: "prev_hash", genesis: "genesis",
    applies: () => true,
    canonical: (e) => JSON.stringify({
        student_id: e.student_id, product: e.product, construct: e.construct, signal: e.signal, weight: e.weight,
        prev_hash: e.prev_hash || "genesis",
    }),
    validate: (e) => {
        const errors = [];
        for (const f of ["student_id", "product", "construct", "signal"])
            if (typeof e[f] !== "string" || !e[f])
                errors.push(`missing ${f}`);
        return errors;
    },
};
// ── play/measure-session-1 — qlm-games src/app/api/measure/session/route.ts ─
// computeEventHash(studyId, sessionId, event): sha256 hex truncated to 32 of
// JSON.stringify({studyId, sessionId, studentId ?? 'unknown', timestamp ?? '',
// correct, domain ?? '', responseTimeMs ?? null, sequenceNumber ?? null}).
// A content hash used for idempotent replay; records carry no link.
// The stored row's study_id / session_id / student_id are the hash inputs.
export const PLAY_MEASURE_SESSION_1 = {
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
        const errors = [];
        if (!(e.studyId ?? e.study_id))
            errors.push("missing studyId");
        if (!(e.sessionId ?? e.session_id))
            errors.push("missing sessionId");
        return errors;
    },
};
// ── play/encounter-fnv64-1 — qlm-games src/lib/credentials/platform/evidence-schema.ts
// computeEventHash: hashSnapshotSync (FNV-1a 64 over UTF-16 units) of
// JSON.stringify({eventId, ts, encounterId, actor, source, type, payload,
// consentRef, prevHash}) in that insertion order. Fields: eventHash / prevHash
// ("" on the first event). It labels itself schemaVersion "clin-1.0", which is
// NOT the SHA-256 residency scheme play/clinical-clin-1.0.
export const PLAY_ENCOUNTER_FNV64_1 = {
    id: "play/encounter-fnv64-1", family: "play/encounter", since: "2026-08-16",
    hashField: "eventHash", prevField: "prevHash", genesis: "", digest: "fnv1a64",
    applies: (e) => e.eventHash !== undefined || e.schemaVersion === "clin-1.0",
    canonical: (e) => JSON.stringify({
        eventId: e.eventId, ts: e.ts, encounterId: e.encounterId, actor: e.actor, source: e.source,
        type: e.type, payload: e.payload, consentRef: e.consentRef, prevHash: e.prevHash,
    }),
    validate: (e) => {
        const errors = [];
        for (const f of ["eventId", "ts", "encounterId", "type"])
            if (typeof e[f] !== "string" || !e[f])
                errors.push(`missing ${f}`);
        return errors;
    },
};
// ── play/research-provenance-1 — qlm-games src/lib/research/evidence-provenance-chain.ts
// computeChainHash(chain): sha256 of the concatenation (no separators) of
// designLayer.blueprintId, JSON.stringify(designLayer.auditResult.scores),
// String(runtimeLayer.worldId)+String(eventCount)+String(evidenceChainIntegrity),
// then proofLayer.protocolCommitmentHash+bridgeCertificateHash if present, then
// lineageLayer.closureRate+allLineagesClosed if present. One record, no link.
export const PLAY_RESEARCH_PROVENANCE_1 = {
    id: "play/research-provenance-1", family: "play/research-provenance", since: "2026-08-25",
    hashField: "chainHash", prevField: null, genesis: null, link: "none",
    applies: (e) => typeof e.designLayer === "object" && e.designLayer !== null,
    canonical: (e) => {
        const d = e.designLayer;
        const r = e.runtimeLayer;
        const p = e.proofLayer;
        const l = e.lineageLayer;
        const parts = [];
        parts.push(str(d.blueprintId));
        parts.push(JSON.stringify(d.auditResult.scores));
        parts.push(String(r.worldId) + String(r.eventCount) + String(r.evidenceChainIntegrity));
        if (p)
            parts.push(String(p.protocolCommitmentHash) + String(p.bridgeCertificateHash));
        if (l)
            parts.push(String(l.closureRate) + String(l.allLineagesClosed));
        return parts.join("");
    },
    validate: (e) => {
        const errors = [];
        if (!e.designLayer)
            errors.push("missing designLayer");
        if (!e.runtimeLayer)
            errors.push("missing runtimeLayer");
        return errors;
    },
};
// ── qcore/qinverse-djb2-1 — qlm-games src/lib/q-core/qinverse/evidence-chain.ts
// (identical copy in crucible-teacher). computeEventHash: djb2 (32-bit) of
// JSON.stringify({eventId, type, data, prevHash, sequence, seed}); fields
// hash / prevHash ("genesis" first). djb2 is not collision resistant: the
// chain is order-evident, not tamper-evident. A SHA-256 successor scheme is
// the product's call; verification of what was sealed needs this one.
export const QCORE_QINVERSE_DJB2_1 = {
    id: "qcore/qinverse-djb2-1", family: "qcore/qinverse", since: "2026-08-10",
    hashField: "hash", prevField: "prevHash", genesis: "genesis", digest: "djb2-32",
    applies: () => true,
    canonical: (e) => JSON.stringify({ eventId: e.eventId, type: e.type, data: e.data, prevHash: e.prevHash, sequence: e.sequence, seed: e.seed }),
    validate: (e) => {
        const errors = [];
        if (typeof e.eventId !== "string" || !e.eventId)
            errors.push("missing eventId");
        if (typeof e.sequence !== "number")
            errors.push("missing sequence");
        return errors;
    },
};
// ── studio/loop-1 — qlm-studio src/lib/loop/evidence.ts ───────────────────
// hashEvent(prevHash, event): sha256 of canonical({prevHash, ...event}) where
// canonical = JSON.stringify(sortedKeys.map(k => [k, value])) over exactly
// {sessionId, participantId, stage, event, at, payload}; the stored `id` is
// not hashed. Fields hash / prevHash ("genesis" first).
const STUDIO_FIELDS = ["sessionId", "participantId", "stage", "event", "at", "payload"];
export const STUDIO_LOOP_1 = {
    id: "studio/loop-1", family: "studio/loop", since: "2026-09-05",
    hashField: "hash", prevField: "prevHash", genesis: "genesis",
    applies: () => true,
    canonical: (e) => {
        const input = { prevHash: e.prevHash };
        for (const f of STUDIO_FIELDS)
            input[f] = e[f];
        const keys = Object.keys(input).sort();
        return JSON.stringify(keys.map((k) => [k, input[k]]));
    },
    validate: (e) => {
        const errors = [];
        for (const f of ["sessionId", "participantId", "stage", "event", "at"])
            if (typeof e[f] !== "string" || !e[f])
                errors.push(`missing ${f}`);
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
export function canonicalizeRfc8785(value) {
    if (value === undefined)
        return "null";
    if (value === null)
        return "null";
    if (typeof value === "boolean")
        return value.toString();
    if (typeof value === "number") {
        if (!isFinite(value))
            throw new Error("Non-finite number in canonical event");
        return JSON.stringify(value);
    }
    if (typeof value === "string")
        return JSON.stringify(value);
    if (Array.isArray(value))
        return "[" + value.map(canonicalizeRfc8785).join(",") + "]";
    if (typeof value === "object") {
        const sorted = Object.keys(value).sort()
            .map((k) => JSON.stringify(k) + ":" + canonicalizeRfc8785(value[k]));
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
];
export const DP_LEDGER_V3 = {
    id: "dp/ledger-v3", family: "dp/ledger", since: "2026-08-28",
    hashField: "eventHash", prevField: "previousEventHash", genesis: null,
    applies: () => true,
    canonical: (e) => {
        // The sealer canonicalized every envelope key (absent optionals as null),
        // so a stored row that dropped them is canonicalized as the sealer saw it;
        // any extra stored key outside the excluded four is hashed too, as the
        // product's own verifier would.
        const rest = {};
        for (const k of DP_FIELDS)
            rest[k] = e[k] === undefined ? null : e[k];
        for (const k of Object.keys(e))
            if (!DP_EXCLUDED.has(k) && !(k in rest))
                rest[k] = e[k];
        return str(e.previousEventHash) + canonicalizeRfc8785(rest);
    },
    validate: (e) => {
        const errors = [];
        for (const f of ["eventId", "tenantId", "sessionId", "eventType"])
            if (typeof e[f] !== "string" || !e[f])
                errors.push(`missing ${f}`);
        if (typeof e.eventSeq !== "number")
            errors.push("missing eventSeq");
        return errors;
    },
};
// ── tpc/dse-journal-1 — teachproof src/lib/tutor-lab/dse/journal.ts ──────
// computeEntryHash(prevHash, entry): sha256 of prevHash + JSON.stringify({seq,
// eventType, data}). Entries store `hash` only; the link is implicit in order
// (the previous entry's hash, "" for the first). `timestamp` is not hashed.
export const TPC_DSE_JOURNAL_1 = {
    id: "tpc/dse-journal-1", family: "tpc/dse-journal", since: "2026-09-08",
    hashField: "hash", prevField: null, genesis: "", link: "implicit",
    applies: () => true,
    canonical: (e, prev) => (prev ?? "") + JSON.stringify({ seq: e.seq, eventType: e.eventType, data: e.data }),
    validate: (e) => {
        const errors = [];
        if (typeof e.seq !== "number")
            errors.push("missing seq");
        if (typeof e.eventType !== "string" || !e.eventType)
            errors.push("missing eventType");
        return errors;
    },
};
// ── yardstick/spine-1 — yardstick/project_spine/models.py ResponseRecord ──
// compute_chain_hash(previous_hash): sha256 of the UTF-8 bytes of
// f"{previous_hash}:{enrollment_id}:{item_id}:{response}:{correct}" with
// Python's str() forms: UUIDs as text, booleans as True/False.
export const YARDSTICK_SPINE_1 = {
    id: "yardstick/spine-1", family: "yardstick/spine", since: "2026-08-30",
    hashField: "chain_hash", prevField: "previous_hash", genesis: "",
    applies: () => true,
    canonical: (e) => {
        const py = (v) => (v === true ? "True" : v === false ? "False" : v === null || v === undefined ? "None" : String(v));
        return `${str(e.previous_hash)}:${py(e.enrollment_id)}:${py(e.item_id)}:${py(e.response)}:${py(e.correct)}`;
    },
    validate: (e) => {
        const errors = [];
        for (const f of ["enrollment_id", "item_id"])
            if (typeof e[f] !== "string" || !e[f])
                errors.push(`missing ${f}`);
        return errors;
    },
};
// ── labpath/learning-evidence-v1 — qlm-games src/lib/ecogenesis/labpath/learning-evidence-event.ts
// hashLearningEvidenceEvent(draft): sha256 of JSON.stringify(sortObject(draft))
// where draft is the whole event minus `hash` and sortObject orders keys at
// every depth with String.prototype.localeCompare. Fields hash / prev_hash
// (null on the first event).
export function sortObjectLocale(value) {
    if (Array.isArray(value))
        return value.map(sortObjectLocale);
    if (!value || typeof value !== "object")
        return value;
    return Object.fromEntries(Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, nested]) => [key, sortObjectLocale(nested)]));
}
export const LABPATH_LEARNING_EVIDENCE_V1 = {
    id: "labpath/learning-evidence-v1", family: "labpath/learning-evidence", since: "2026-09-12",
    hashField: "hash", prevField: "prev_hash", genesis: null,
    applies: (e) => typeof e.event_id === "string",
    canonical: (e) => {
        const { hash: _h, ...draft } = e;
        void _h;
        return JSON.stringify(sortObjectLocale(draft));
    },
    validate: (e) => {
        const errors = [];
        for (const f of ["event_id", "learner_id", "ts", "world_id", "session_id"])
            if (typeof e[f] !== "string" || !e[f])
                errors.push(`missing ${f}`);
        return errors;
    },
};
export const PRODUCT_SCHEMES = [
    PLAY_EMIT_1, PLAY_MEASURE_SESSION_1, PLAY_ENCOUNTER_FNV64_1, PLAY_RESEARCH_PROVENANCE_1,
    QCORE_QINVERSE_DJB2_1, STUDIO_LOOP_1, DP_LEDGER_V3, TPC_DSE_JOURNAL_1, YARDSTICK_SPINE_1, LABPATH_LEARNING_EVIDENCE_V1,
];
//# sourceMappingURL=products.js.map