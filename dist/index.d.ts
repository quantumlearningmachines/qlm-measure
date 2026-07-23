/**
 * @qlm/measure — Open Measurement SDK for Education AI
 *
 * What it is:
 *   - A typed evidence-event vocabulary any tool can emit
 *   - Clients for QLM's open datasets and measurement service
 *   - An evidence-record format + replay verifier
 *
 * What it is NOT:
 *   - The estimation engine (that is QLM's hosted service)
 *   - A replacement for the measurement service
 *   - A standalone learning analytics system
 *
 * The verifier checks bookkeeping integrity, not estimation correctness.
 * That distinction is the design.
 *
 * @see https://play.quantumlearningmachines.com/developer
 * @license Apache-2.0
 */
export type { ScaffoldType, EpistemicMode, DepthLevel, TriageResult, EventCategory, } from "./schema/enums";
export { toPublicEpistemicMode } from "./schema/enums";
export type { ObservationEvent } from "./schema/observation-event";
export type { MeasurementEvent } from "./schema/measurement-event";
export type { EvidenceEntry, EvidenceRecord } from "./schema/evidence-record";
export { COMPACTION_RETENTION } from "./schema/evidence-record";
export { MeasurementEmitter } from "./emitter/measurement-emitter";
export type { EmitterConfig } from "./emitter/measurement-emitter";
export { verifyRecord } from "./verifier/verify-record";
export type { VerificationResult, Violation } from "./verifier/verify-record";
export { replayToVersion, posteriorAtVersion, summarizeToVersion } from "./verifier/replay";
export { hashEntry, hashCanonical, canonicalize, sha256 } from "./verifier/hash";
export { OntologyClient } from "./clients/ontology-client";
export type { OntologyClientConfig, DatasetName } from "./clients/ontology-client";
export { EngineClient } from "./clients/engine-client";
export type { EngineClientConfig, ModelStateSummary } from "./clients/engine-client";
//# sourceMappingURL=index.d.ts.map