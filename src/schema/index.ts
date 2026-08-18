export type {
  ScaffoldType,
  EpistemicMode,
  DepthLevel,
  TriageResult,
  EventCategory,
} from "./enums.js";
export { toPublicEpistemicMode } from "./enums.js";

export type { ObservationEvent } from "./observation-event.js";
export type { MeasurementEvent } from "./measurement-event.js";
export type { EvidenceEntry, EvidenceRecord } from "./evidence-record.js";
export { COMPACTION_RETENTION } from "./evidence-record.js";
