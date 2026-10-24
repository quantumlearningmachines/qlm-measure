// Type declarations for the vendored engine.mjs. Written for this package (not copied from qlm-measure);
// they describe only the parts of the engine this package calls.
export interface Profile {
  id: string;
  name: string;
  description: string;
  mode: "dialogue" | "summary" | "assistance_events";
  status: string;
  sampleName: string;
  metrics: Record<string, string>;
  source: {
    kind: string;
    url?: string;
    downloadUrl?: string;
    revision?: string;
    license?: string;
    licenseUrl?: string;
    citation?: string;
    selectionNote?: string;
    limitations: string[];
    sampleSha256?: string;
    fixtureSha256?: string;
    summary?: string;
  };
}
export interface TransformRun {
  profile: Profile;
  semanticContract: Record<string, unknown>;
  document: { file_schema: string; serialization_format: string; records: LearnlogRecord[] };
  records: LearnlogRecord[];
  checkpoint: Record<string, { seq: number; entry_hash: string }>;
  sourceName: string;
  sourceHash: string;
  mappingHash: string;
  sourceKind: "verified_public_sample" | "synthetic_fixture" | "unverified_user_input";
  sourceVerified: boolean;
  summary: {
    inputRowCount: number;
    rowCount: number;
    recordCount: number;
    eventCount: number;
    unit: string;
    eventTypes: Record<string, number>;
    missingMetricCount: number;
    assistanceUnknownCount: number;
  };
}
export interface LearnlogRecord {
  header: Record<string, unknown>;
  event_schemas: string[];
  entries: { seq: number; time: string; event_hash: string; prev_hash: string; entry_hash: string; event: { name: string; data: Record<string, unknown>; activity?: { id: string } } }[];
}
export const ALL_PROFILES: readonly Profile[];
export const ENGINE_VERSION: string;
export function getSample(id: string): string;
export function getSemanticContract(id: string): Record<string, unknown>;
export function parseStrictJSON(text: string): unknown;
export function transform(options: { profileId: string; text: string; tenant?: string; sourceName?: string }): Promise<TransformRun>;
export function verify(document: unknown, expectedHeads?: unknown): Promise<Record<string, { seq: number; entry_hash: string }>>;
