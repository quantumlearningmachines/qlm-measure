#!/usr/bin/env node
/**
 * Generates schema/vectors/chains/*.json from the ORIGINAL product hash
 * functions (copied verbatim below, with their source), so the SDK schemes
 * are proven byte-equal to what production has sealed. Re-run only to add
 * vectors; existing vectors must never change.
 */
import { createHash } from "crypto";
import { writeFileSync, mkdirSync, readFileSync } from "fs";

const sha = (s) => createHash("sha256").update(s).digest("hex");

// teachproof src/lib/clinical/longitudinal/events/evidence-schema.ts @ 2026-09-24 (verbatim)
function tpcComputeEventHash(event) {
  const canonical = JSON.stringify([
    event.type, event.learner, event.encounter, event.turn, event.construct,
    event.signal, event.scaffold, event.extractor, event.confidence, event.prev_hash,
    event.triage_class ?? null, event.engine_version ?? null,
    ...(event.mapping_version !== undefined ? [event.mapping_version] : []),
  ]);
  return sha(canonical);
}
// teachproof scripts/qlm-measure-verify.mjs hashV1 (chains sealed before 2026-09-10)
function tpcHashV1(e) {
  return sha(JSON.stringify([e.type, e.learner, e.encounter, e.turn, e.construct, e.signal, e.scaffold, e.extractor, e.confidence, e.prev_hash]));
}
// qlm-games src/lib/residency/clinical-event-schema.ts @ 2026-09-24 (verbatim)
function playCanonicalize(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(playCanonicalize);
  if (typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = playCanonicalize(value[key]);
    return sorted;
  }
  return value;
}
function playComputeEventHash(event) {
  const hashInput = playCanonicalize({
    eventId: event.eventId, ts: event.ts, encounterId: event.encounterId, actor: event.actor, source: event.source,
    type: event.type, payload: event.payload, consentRef: event.consentRef, schemaVersion: event.schemaVersion, prevHash: event.prevHash,
  });
  return sha(JSON.stringify(hashInput));
}

// teachproof vendor/qlm-measure-0.4.1.tgz dist/schemes/index.js (the code sealing
// production events on 2026-09-25) — tpcArray variant 4 + sortKeysDeep, verbatim.
function sortKeysDeep(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value === "object") { const sorted = {}; for (const key of Object.keys(value).sort()) sorted[key] = sortKeysDeep(value[key]); return sorted; }
  return value;
}
function tpcHashV4(event) {
  const arr = ["type", "learner", "encounter", "turn", "construct", "signal", "scaffold", "extractor", "confidence", "prev_hash"].map((f) => event[f]);
  arr.push(event.triage_class ?? null, event.engine_version ?? null);
  arr.push(event.mapping_version ?? null, event.event_kind, sortKeysDeep(event.payload ?? {}));
  return sha(JSON.stringify(arr));
}

// ── Vectors ──────────────────────────────────────────────────────────────
const tpcBase = (i, prev, extra = {}) => ({
  type: "clinical_evidence", learner: "L-7f3a", encounter: "RN-R4-01", turn: i, construct: ["review_of_systems", "medication_history", "escalation"][i % 3],
  signal: ["demonstrated", "partial", "missed_opportunity", "not_observable"][i % 4], scaffold: i % 4, extractor: i === 3 ? "session_resume" : "llm_extractor_v2",
  confidence: [0.85, 0.5, 1, 0.000001, 1e-7, 0.123456789012345][i % 6], prev_hash: prev, ...extra,
});
function chain(n, make, hashFn) {
  const out = []; let prev = "genesis";
  for (let i = 0; i < n; i++) { const e = make(i, prev); e.hash = hashFn(e); out.push(e); prev = e.hash; }
  return out;
}
const v1 = chain(6, (i, p) => tpcBase(i, p), tpcHashV1);
const v2 = chain(6, (i, p) => tpcBase(i, p, i % 2 ? { triage_class: "yellow", engine_version: "tpc-engine-1.4.2" } : {}), tpcComputeEventHash);
const v3 = chain(6, (i, p) => tpcBase(i, p, { triage_class: i % 2 ? "red" : null, engine_version: "tpc-engine-1.5.0", mapping_version: "cco-2026-09-14" }), tpcComputeEventHash);
// Play chain: genesis prevHash is "" and payloads are nested, key order deliberately unsorted
const playChain = []; { let prev = "";
  const payloads = [
    { caseId: "OD-CAP-02", role: "learner", station: 1 },
    { finding: { site: "right eye", value: 21.5, unit: "mmHg" }, method: "tonometry" },
    { hypothesis: "ocular hypertension", confidence: 0.6, differentials: ["glaucoma suspect", "normal"] },
    { plan: ["repeat IOP", "pachymetry"], rationale: "borderline reading \u2014 confirm" },
  ];
  for (let i = 0; i < 4; i++) {
    const e = { eventId: `evt-${i}`, ts: `2026-09-24T18:00:0${i}.000Z`, encounterId: "enc-optometry-9", actor: "learner", source: "world",
      type: ["encounter_start", "finding_recorded", "hypothesis_stated", "plan_proposed"][i], payload: payloads[i],
      consentRef: i === 0 ? "consent-42" : null, schemaVersion: "clin-1.0", prevHash: prev };
    e.hash = playComputeEventHash(e); playChain.push(e); prev = e.hash;
  }
}
const tampered = JSON.parse(JSON.stringify(v2)); tampered[2].confidence = 0.51;
// v4: schema 0.4 process events (event_kind + payload); mapping_version present on some, absent on others
const kinds = ["chart.view", "chart.item", "vitals.read", "chart.item", "checkpoint.answer", "chart.view"];
const v4payloads = [{ section: "history", ms: 1200 }, { item: "allergies", value: { list: ["penicillin"], verified: false } }, { hr: 112, bp: "138/86", spo2: 0.94 }, { item: "med_list", value: null }, { answer: "escalate", rationale: "d\u00e9saturation \u2014 call RRT" }, { section: "orders", ms: 300 }];
const v4 = chain(6, (i, p) => tpcBase(i, p, { triage_class: i % 3 ? "yellow" : null, engine_version: "tpc-engine-1.6.0", ...(i % 2 ? { mapping_version: "cco-2026-09-14" } : {}), event_kind: kinds[i], payload: v4payloads[i] }), tpcHashV4);
// v3 + v4 coexisting in one chain: evidence events (v3) interleaved with process events (v4)
const v3v4 = []; { let prev = "genesis";
  for (let i = 0; i < 6; i++) {
    const proc = i % 2 === 1;
    const e = tpcBase(i, prev, { triage_class: "green", engine_version: "tpc-engine-1.6.0", mapping_version: "cco-2026-09-14", ...(proc ? { event_kind: kinds[i], payload: v4payloads[i] } : {}) });
    e.hash = proc ? tpcHashV4(e) : tpcComputeEventHash(e); v3v4.push(e); prev = e.hash;
  }
}
const v4tampered = JSON.parse(JSON.stringify(v4)); v4tampered[1].payload.value.verified = true;

mkdirSync("schema/vectors/chains", { recursive: true });
const write = (name, obj) => writeFileSync(`schema/vectors/chains/${name}.json`, JSON.stringify(obj, null, 2) + "\n");
write("tpc-clinical-v1", { scheme: "tpc/clinical-v1", family: "tpc/clinical", source: "teachproof scripts/qlm-measure-verify.mjs hashV1", expect: { clean: true, hash_scheme: "tpc/clinical-v1" }, events: v1 });
write("tpc-clinical-v2", { scheme: "tpc/clinical-v2", family: "tpc/clinical", source: "teachproof evidence-schema.ts computeEventHash (12 fields, 2026-09-10)", expect: { clean: true, hash_scheme: "tpc/clinical-v2" }, events: v2 });
write("tpc-clinical-v3", { scheme: "tpc/clinical-v3", family: "tpc/clinical", source: "teachproof evidence-schema.ts computeEventHash (13 fields, 2026-09-14)", expect: { clean: true, hash_scheme: "tpc/clinical-v3" }, events: v3 });
write("tpc-clinical-v2-tampered", { scheme: "tpc/clinical-v2", family: "tpc/clinical", source: "v2 vector with confidence edited on event 2", expect: { clean: false, hash_scheme: "tpc/clinical-v2", tampered: 1, tampered_index: 2 }, events: tampered });
write("play-clinical-clin-1.0", { scheme: "play/clinical-clin-1.0", family: "play/clinical", source: "qlm-games src/lib/residency/clinical-event-schema.ts computeEventHash", expect: { clean: true, hash_scheme: "play/clinical-clin-1.0" }, events: playChain });
write("tpc-clinical-v4", { scheme: "tpc/clinical-v4", family: "tpc/clinical", source: "teachproof vendor/qlm-measure-0.4.1.tgz dist/schemes (production sealer, 2026-09-25), tpcArray variant 4", expect: { clean: true, hash_scheme: "tpc/clinical-v4" }, events: v4 });
write("tpc-clinical-v3-v4-coexist", { scheme: "tpc/clinical-v4", family: "tpc/clinical", source: "v3 evidence events interleaved with v4 process events; coexistence reports the newest scheme", expect: { clean: true, hash_scheme: "tpc/clinical-v4", schemes: { "tpc/clinical-v3": 3, "tpc/clinical-v4": 3 } }, events: v3v4 });
write("tpc-clinical-v4-tampered", { scheme: "tpc/clinical-v4", family: "tpc/clinical", source: "v4 vector with a nested payload field edited on event 1", expect: { clean: false, hash_scheme: "tpc/clinical-v4", tampered: 1, tampered_index: 1 }, events: v4tampered });

// ═══════════════════════════════════════════════════════════════════════════
// 0.5.0 — product envelopes. Each block is the product's ORIGINAL function,
// copied verbatim from the commit named, so the vector proves byte equality.
// ═══════════════════════════════════════════════════════════════════════════

// qlm-games src/app/api/evidence/emit/route.ts @ c1e6091 — computeChainHash
function emitComputeChainHash(event, prevHash) {
  const canonical = JSON.stringify({
    student_id: event.student_id, product: event.product, construct: event.construct, signal: event.signal, weight: event.weight,
    prev_hash: prevHash || "genesis",
  });
  return sha(canonical);
}
// qlm-games src/app/api/measure/session/route.ts @ c1e6091 — computeEventHash
function msComputeEventHash(studyId, sessionId, event) {
  const canonical = JSON.stringify({
    studyId, sessionId, studentId: event.studentId ?? 'unknown', timestamp: event.timestamp ?? '', correct: event.correct,
    domain: event.domain ?? '', responseTimeMs: event.responseTimeMs ?? null, sequenceNumber: event.sequenceNumber ?? null,
  });
  return sha(canonical).slice(0, 32);
}
// qlm-games src/lib/credentials/snapshot-commit.ts — hashSnapshotSync; platform/evidence-schema.ts — computeEventHash
function hashSnapshotSync(snapshot) {
  let h = BigInt("0xcbf29ce484222325"); const prime = BigInt("0x100000001b3");
  for (let i = 0; i < snapshot.length; i++) { h ^= BigInt(snapshot.charCodeAt(i)); h = BigInt.asUintN(64, h * prime); }
  return h.toString(16).padStart(16, "0");
}
function platformComputeEventHash(event) {
  return hashSnapshotSync(JSON.stringify({ eventId: event.eventId, ts: event.ts, encounterId: event.encounterId, actor: event.actor, source: event.source,
    type: event.type, payload: event.payload, consentRef: event.consentRef, prevHash: event.prevHash }));
}
// qlm-games src/lib/research/evidence-provenance-chain.ts — computeChainHash
function provenanceChainHash(chain) {
  const parts = [];
  parts.push(chain.designLayer.blueprintId); parts.push(JSON.stringify(chain.designLayer.auditResult.scores));
  parts.push(String(chain.runtimeLayer.worldId) + String(chain.runtimeLayer.eventCount) + String(chain.runtimeLayer.evidenceChainIntegrity));
  if (chain.proofLayer) parts.push(String(chain.proofLayer.protocolCommitmentHash) + String(chain.proofLayer.bridgeCertificateHash));
  if (chain.lineageLayer) parts.push(String(chain.lineageLayer.closureRate) + String(chain.lineageLayer.allLineagesClosed));
  return sha(parts.join(''));
}
// qlm-games src/lib/q-core/qinverse/evidence-chain.ts — hashString + computeEventHash (identical in crucible-teacher)
function qcoreHashString(str) { let hash = 5381; for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; return (hash >>> 0).toString(16).padStart(8, "0"); }
function qcoreComputeEventHash(event, prevHash) {
  return qcoreHashString(JSON.stringify({ eventId: event.eventId, type: event.type, data: event.data, prevHash, sequence: event.sequence, seed: event.seed }));
}
// qlm-studio src/lib/loop/evidence.ts — canonical + hashEvent
function studioCanonical(input) { const keys = Object.keys(input).sort(); return JSON.stringify(keys.map((k) => [k, input[k]])); }
function studioHashEvent(prevHash, event) { return sha(studioCanonical({ prevHash, ...event })); }
// art-of-kings src/lib/engine/v3/event-ledger.ts — canonicalize + computeEventHash
function dpCanonicalize(value) {
  if (value === undefined) return "null"; if (value === null) return "null";
  if (typeof value === "boolean") return value.toString();
  if (typeof value === "number") { if (!isFinite(value)) throw new Error("Non-finite"); return JSON.stringify(value); }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(dpCanonicalize).join(",") + "]";
  if (typeof value === "object" && value !== null) { const sorted = Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + dpCanonicalize(value[k])); return "{" + sorted.join(",") + "}"; }
  throw new Error(`Unserializable type: ${typeof value}`);
}
function dpComputeEventHash(event, previousEventHash) {
  const prev = previousEventHash ?? "";
  return createHash("sha256").update(prev).update(dpCanonicalize(event)).digest("hex");
}
// teachproof src/lib/tutor-lab/dse/journal.ts — computeEntryHash
function journalComputeEntryHash(prevHash, entry) {
  const content = JSON.stringify({ seq: entry.seq, eventType: entry.eventType, data: entry.data });
  return createHash("sha256").update(prevHash + content).digest("hex");
}

// ── Vectors ──────────────────────────────────────────────────────────────
{ // play/emit-1
  const events = []; let prev = null;
  const rows = [["S-1","labpath","fractions.equivalence","demonstrated",1],["S-1","labpath","fractions.equivalence","partial",0.5],["S-1","teachproof","escalation","missed_opportunity",0.25],["S-2","studio","unit.rates","demonstrated",1e-7]];
  for (const [student_id, product, construct, signal, weight] of rows) {
    const body = { student_id, product, construct, signal, weight, scaffold: "unaided" };
    const chain_hash = emitComputeChainHash(body, prev);
    events.push({ ...body, chain_hash, prev_hash: prev || "genesis" }); prev = chain_hash;
  }
  write("play-emit-1", { scheme: "play/emit-1", family: "play/emit", source: "qlm-games src/app/api/evidence/emit/route.ts computeChainHash @ c1e6091", expect: { clean: true, hash_scheme: "play/emit-1" }, events });
}
{ // play/measure-session-1 (content hash, no link)
  const studyId = "SDA-002", sessionId = "sess-7a";
  const ins = [{ studentId: "st-1", timestamp: "2026-09-26T10:00:00.000Z", correct: true, domain: "algebra", responseTimeMs: 4210, sequenceNumber: 0 },
    { studentId: "st-1", timestamp: "2026-09-26T10:00:07.500Z", correct: false, domain: "algebra", responseTimeMs: null, sequenceNumber: 1 },
    { correct: null, sequenceNumber: 2 }];
  const events = ins.map((e) => ({ studyId, sessionId, ...e, event_hash: msComputeEventHash(studyId, sessionId, e) }));
  write("play-measure-session-1", { scheme: "play/measure-session-1", family: "play/measure-session", source: "qlm-games src/app/api/measure/session/route.ts computeEventHash @ c1e6091 (sha256 truncated to 32)", expect: { clean: true, hash_scheme: "play/measure-session-1" }, events });
}
{ // play/encounter-fnv64-1
  const events = []; let prev = "";
  const types = ["encounter_start", "finding_recorded", "hypothesis_stated", "plan_proposed"];
  const payloads = [{ caseId: "OD-CAP-02" }, { finding: { site: "right eye", value: 21.5, unit: "mmHg" } }, { hypothesis: "ocular hypertension", confidence: 0.6 }, { plan: ["repeat IOP", "pachymetry"], note: "borderline — confirm é" }];
  for (let i = 0; i < 4; i++) {
    const e = { eventId: `evt-${i}`, ts: `2026-09-24T18:00:0${i}.000Z`, encounterId: "enc-optometry-9", actor: i === 3 ? "system" : "student", source: { system: "play", adapter: "native" }, type: types[i], payload: payloads[i], consentRef: "consent-42", schemaVersion: "clin-1.0", prevHash: prev };
    e.eventHash = platformComputeEventHash(e); events.push(e); prev = e.eventHash;
  }
  write("play-encounter-fnv64-1", { scheme: "play/encounter-fnv64-1", family: "play/encounter", source: "qlm-games src/lib/credentials/platform/evidence-schema.ts computeEventHash via snapshot-commit hashSnapshotSync (FNV-1a 64)", expect: { clean: true, hash_scheme: "play/encounter-fnv64-1" }, events });
}
{ // play/research-provenance-1 (one record, no link)
  const chain = { designLayer: { blueprintId: "bp-fractions-3", auditResult: { scores: { alignment: 0.92, coverage: 1, rigor: 0.875 } } }, runtimeLayer: { worldId: "fraction-forge", eventCount: 143, evidenceChainIntegrity: true }, proofLayer: { protocolCommitmentHash: "a1b2", bridgeCertificateHash: "c3d4" }, lineageLayer: { closureRate: 0.75, allLineagesClosed: false } };
  const chain2 = { designLayer: { blueprintId: "bp-quantum-1", auditResult: { scores: { alignment: 1 } } }, runtimeLayer: { worldId: "quantum-lab", eventCount: 0, evidenceChainIntegrity: false } };
  write("play-research-provenance-1", { scheme: "play/research-provenance-1", family: "play/research-provenance", source: "qlm-games src/lib/research/evidence-provenance-chain.ts computeChainHash", expect: { clean: true, hash_scheme: "play/research-provenance-1" }, events: [{ ...chain, chainHash: provenanceChainHash(chain) }, { ...chain2, chainHash: provenanceChainHash(chain2) }] });
}
{ // qcore/qinverse-djb2-1
  const events = []; let prev = "genesis";
  for (let i = 0; i < 5; i++) {
    const e = { eventId: `qe-${i}`, type: ["session_start", "teacher_turn", "student_turn", "teacher_turn", "session_close"][i], data: { text: i === 1 ? "What do you notice? ¿" : `d${i}`, moveClass: i % 2 ? "probe" : null }, sequence: i, seed: 424242, classifierVersion: "mc-1.2", prevHash: prev };
    const { prevHash: _p, ...rest } = e; e.hash = qcoreComputeEventHash(rest, prev); events.push(e); prev = e.hash;
  }
  write("qcore-qinverse-djb2-1", { scheme: "qcore/qinverse-djb2-1", family: "qcore/qinverse", source: "qlm-games src/lib/q-core/qinverse/evidence-chain.ts computeEventHash (djb2) — identical in crucible-teacher", expect: { clean: true, hash_scheme: "qcore/qinverse-djb2-1" }, events });
}
{ // studio/loop-1
  const events = []; let prev = "genesis";
  const kinds = ["stage_enter", "response", "reflection", "stage_exit"];
  for (let i = 0; i < 4; i++) {
    const next = { sessionId: "loop-3", participantId: "p-11", stage: "predict", event: kinds[i], at: `2026-09-26T09:0${i}:00.000Z`, payload: { z: i, a: { nested: [1, "two", null] } } };
    const hash = studioHashEvent(prev, next); events.push({ ...next, id: `ev-${i}`, prevHash: prev, hash }); prev = hash;
  }
  write("studio-loop-1", { scheme: "studio/loop-1", family: "studio/loop", source: "qlm-studio src/lib/loop/evidence.ts hashEvent (sorted-pairs canonical); stored id is not hashed", expect: { clean: true, hash_scheme: "studio/loop-1" }, events });
}
{ // dp/ledger-v3
  const events = []; let prev = undefined;
  for (let i = 0; i < 3; i++) {
    const hashable = { eventId: `00000000-0000-4000-8000-00000000000${i}`, tenantId: "mcu", sessionId: "s-9", learnerId: "l-4", actorUserId: "u-4", actorRole: "learner", eventSeq: i + 1, eventType: ["session_started", "decision_submitted", "session_closed"][i], occurredAt: `2026-09-26T12:0${i}:00.000Z`, requestId: `r-${i}`, idempotencyKey: `k-${i}`, scenarioId: "convoy-3", scenarioVersion: "1.4", turnId: i === 1 ? "t-2" : undefined, checkpointId: undefined, stateBeforeHash: "sb", stateAfterHash: "sa", knowledgeSnapshotId: undefined, payloadSchema: "dp.decision", payloadVersion: "3", payload: { choice: "hold", confidence: 0.7, tags: ["risk", "time"] }, previousEventHash: prev };
    const eventHash = dpComputeEventHash(hashable, prev);
    const stored = JSON.parse(JSON.stringify({ ...hashable, eventHash, receivedAt: "2026-09-26T12:05:00.000Z" })); // storage drops undefined keys
    events.push(stored); prev = eventHash;
  }
  write("dp-ledger-v3", { scheme: "dp/ledger-v3", family: "dp/ledger", source: "art-of-kings src/lib/engine/v3/event-ledger.ts computeEventHash (RFC 8785-style canonical, prev || canonical); rows as stored (undefined keys dropped, receivedAt present)", expect: { clean: true, hash_scheme: "dp/ledger-v3" }, events });
}
{ // tpc/dse-journal-1 (implicit link)
  const events = []; let prev = "";
  for (let i = 0; i < 5; i++) {
    const partial = { seq: i, timestamp: 1758880000000 + i * 1234, eventType: ["phase_transition", "llm_response", "tick", "signal_emitted", "interruption"][i], data: { phase: "assess", detail: i === 1 ? { text: "Patient says: \"it hurts\" — ok" } : null } };
    const hash = journalComputeEntryHash(prev, partial); events.push({ ...partial, hash }); prev = hash;
  }
  write("tpc-dse-journal-1", { scheme: "tpc/dse-journal-1", family: "tpc/dse-journal", source: "teachproof src/lib/tutor-lab/dse/journal.ts computeEntryHash (prevHash + content; link implicit; timestamp not hashed)", expect: { clean: true, hash_scheme: "tpc/dse-journal-1" }, events });
}
{ // tampered copies for two non-sha256 schemes
  const q = JSON.parse(readFileSync("schema/vectors/chains/qcore-qinverse-djb2-1.json", "utf-8")); q.events[2].data.text = "edited";
  write("qcore-qinverse-djb2-1-tampered", { ...q, source: "djb2 vector with data.text edited on event 2", expect: { clean: false, hash_scheme: "qcore/qinverse-djb2-1", tampered: 1, tampered_index: 2 } });
  const f = JSON.parse(readFileSync("schema/vectors/chains/play-encounter-fnv64-1.json", "utf-8")); f.events[1].payload.finding.value = 22;
  write("play-encounter-fnv64-1-tampered", { ...f, source: "FNV vector with payload.finding.value edited on event 1", expect: { clean: false, hash_scheme: "play/encounter-fnv64-1", tampered: 1, tampered_index: 1 } });
}

console.log("wrote 18 chain vectors");
