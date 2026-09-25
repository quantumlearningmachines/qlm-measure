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
console.log("wrote 8 chain vectors");
