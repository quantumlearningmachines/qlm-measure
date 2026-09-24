#!/usr/bin/env node
/**
 * Generates schema/vectors/chains/*.json from the ORIGINAL product hash
 * functions (copied verbatim below, with their source), so the SDK schemes
 * are proven byte-equal to what production has sealed. Re-run only to add
 * vectors; existing vectors must never change.
 */
import { createHash } from "crypto";
import { writeFileSync, mkdirSync } from "fs";

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

mkdirSync("schema/vectors/chains", { recursive: true });
const write = (name, obj) => writeFileSync(`schema/vectors/chains/${name}.json`, JSON.stringify(obj, null, 2) + "\n");
write("tpc-clinical-v1", { scheme: "tpc/clinical-v1", family: "tpc/clinical", source: "teachproof scripts/qlm-measure-verify.mjs hashV1", expect: { clean: true, hash_scheme: "tpc/clinical-v1" }, events: v1 });
write("tpc-clinical-v2", { scheme: "tpc/clinical-v2", family: "tpc/clinical", source: "teachproof evidence-schema.ts computeEventHash (12 fields, 2026-09-10)", expect: { clean: true, hash_scheme: "tpc/clinical-v2" }, events: v2 });
write("tpc-clinical-v3", { scheme: "tpc/clinical-v3", family: "tpc/clinical", source: "teachproof evidence-schema.ts computeEventHash (13 fields, 2026-09-14)", expect: { clean: true, hash_scheme: "tpc/clinical-v3" }, events: v3 });
write("tpc-clinical-v2-tampered", { scheme: "tpc/clinical-v2", family: "tpc/clinical", source: "v2 vector with confidence edited on event 2", expect: { clean: false, hash_scheme: "tpc/clinical-v2", tampered: 1, tampered_index: 2 }, events: tampered });
write("play-clinical-clin-1.0", { scheme: "play/clinical-clin-1.0", family: "play/clinical", source: "qlm-games src/lib/residency/clinical-event-schema.ts computeEventHash", expect: { clean: true, hash_scheme: "play/clinical-clin-1.0" }, events: playChain });
console.log("wrote 5 chain vectors");
