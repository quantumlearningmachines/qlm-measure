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

// Schema
export type {
  ScaffoldType,
  EpistemicMode,
  DepthLevel,
  TriageResult,
  EventCategory,
} from "./schema/enums.js";
export { toPublicEpistemicMode } from "./schema/enums.js";
export type { ObservationEvent } from "./schema/observation-event.js";
export type { MeasurementEvent } from "./schema/measurement-event.js";
export type { EvidenceEntry, EvidenceRecord } from "./schema/evidence-record.js";
export { COMPACTION_RETENTION } from "./schema/evidence-record.js";

// Emitter
export { MeasurementEmitter } from "./emitter/measurement-emitter.js";
export type { EmitterConfig } from "./emitter/measurement-emitter.js";

// Verifier
export { verifyRecord } from "./verifier/verify-record.js";
export type { VerificationResult, Violation } from "./verifier/verify-record.js";
export { replayToVersion, posteriorAtVersion, summarizeToVersion } from "./verifier/replay.js";
export { hashEntry, hashCanonical, canonicalize, sha256 } from "./verifier/hash.js";

// Check catalog
export { CATALOG, CATALOG_BY_ID, SHIPPED_CHECKS, PLANNED_CHECKS, CATEGORIES } from "./checks.js";
export type { CheckDef } from "./checks.js";

// Rules
export { reproduce, registerRule, getRule } from "./rules.js";

// Recorder (schema 0.3)
export { Recorder } from "./recorder.js";
export type { EvidenceEntry03 } from "./recorder.js";

// Verifier v0.3
export { verifyRecordV03 } from "./verifier-v03.js";
export type { VerificationResult03, Violation03 } from "./verifier-v03.js";

// Clients
export { OntologyClient } from "./clients/ontology-client.js";
export type { OntologyClientConfig, DatasetName } from "./clients/ontology-client.js";
export { EngineClient } from "./clients/engine-client.js";
export type { EngineClientConfig, ModelStateSummary } from "./clients/engine-client.js";
