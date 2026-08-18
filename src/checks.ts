/**
 * Check catalog v1 — single source of truth for all verification checks.
 */

export interface CheckDef {
  id: string;
  category: string;
  label: string;
  description: string;
  howToPass: string;
  scope: "record" | "entry";
  status: "shipped" | "planned";
  introducedIn: string;
}

export const CATALOG: CheckDef[] = [
  { id: "SCHEMA.REQUIRED", category: "Schema", label: "Required fields present", description: "Every entry must carry version, timestamp, evidentialWeight, priorPosterior, updatedPosterior, entryHash, and prevHash. The record must carry studentScopeId.", howToPass: "Emit every required field on every entry.", scope: "entry", status: "shipped", introducedIn: "0.1.0" },
  { id: "SCHEMA.TYPES", category: "Schema", label: "Field types valid", description: "version is a positive integer; evidentialWeight, priorPosterior, and updatedPosterior are numbers.", howToPass: "Validate against the JSON Schema before writing.", scope: "entry", status: "shipped", introducedIn: "0.1.0" },
  { id: "SCHEMA.TIMESTAMP_FORMAT", category: "Schema", label: "Timestamp is ISO 8601", description: "Every timestamp parses as RFC 3339 with a timezone offset or Z.", howToPass: "Write UTC timestamps with Z suffix.", scope: "entry", status: "shipped", introducedIn: "0.2.2" },
  { id: "VERSION.MONOTONIC", category: "Sequence", label: "Versions strictly increase", description: "Each entry's version must be strictly greater than the previous.", howToPass: "Assign version from an append counter.", scope: "entry", status: "shipped", introducedIn: "0.1.0" },
  { id: "TIMESTAMP.MONOTONIC", category: "Sequence", label: "Timestamps do not go backward", description: "Each entry's timestamp must be >= the previous minus tolerance.", howToPass: "Write timestamps at append time from one clock.", scope: "entry", status: "shipped", introducedIn: "0.1.0" },
  { id: "ENUM.VALID", category: "Enums", label: "Enum values permitted", description: "scaffoldType, depthLevel, epistemicMode, and triageResult must be from the published sets.", howToPass: "Use the exported enums from the SDK.", scope: "entry", status: "shipped", introducedIn: "0.1.0" },
  { id: "HASH.PREV_LINK", category: "Hash chain", label: "Chain link valid", description: "Each entry's prevHash must equal the previous entry's entryHash.", howToPass: "Never insert, delete, or reorder entries. Append only.", scope: "entry", status: "shipped", introducedIn: "0.1.0" },
  { id: "HASH.ENTRY_RECOMPUTE", category: "Hash chain", label: "Entry hash recomputes", description: "SHA-256 of the canonical hashable subset must equal entryHash.", howToPass: "Hash after all fields are final. Canonicalize per the SDK spec.", scope: "entry", status: "shipped", introducedIn: "0.1.0" },
  { id: "POSTERIOR.CHAIN", category: "Posterior chain", label: "Posterior chain consistent", description: "Each entry's priorPosterior must equal the previous updatedPosterior within 1e-9.", howToPass: "Carry the previous posterior forward unchanged.", scope: "entry", status: "shipped", introducedIn: "0.1.0" },
  { id: "COMPACTION.BOUNDARY", category: "Compaction", label: "Compaction boundary intact", description: "First entry after compaction links to summaryHash; version continues.", howToPass: "Compact only via the SDK helper.", scope: "record", status: "shipped", introducedIn: "0.1.0" },
  { id: "ESTIMATE.REPRODUCE", category: "Estimation", label: "Update reproduces posterior", description: "Given the published update rule, the verifier reproduces updatedPosterior.", howToPass: "Include an estimator declaration. Use the published update rule.", scope: "entry", status: "planned", introducedIn: "0.3.0" },
  { id: "TEMPORAL.T_DESIGN", category: "Temporal", label: "Item created before session", description: "The item existed before the session started.", howToPass: "Include item metadata creation timestamp.", scope: "entry", status: "planned", introducedIn: "0.3.0" },
  { id: "TEMPORAL.T_RESULT", category: "Temporal", label: "Response within session window", description: "The response timestamp falls within session bounds.", howToPass: "Include session bounds.", scope: "entry", status: "planned", introducedIn: "0.3.0" },
  { id: "CONSENT.SCOPE", category: "Consent", label: "Consent scope covers export", description: "The learner's consent scope covers the export level.", howToPass: "Include a consent block.", scope: "record", status: "planned", introducedIn: "0.3.0" },
  { id: "CONSENT.WITHDRAWAL", category: "Consent", label: "No active withdrawal", description: "No active withdrawal for this learner.", howToPass: "Include withdrawal status.", scope: "record", status: "planned", introducedIn: "0.3.0" },
];

// 0.3-specific checks (shipped when verifier_v03 runs them)
export const CATALOG_V03: CheckDef[] = [
  { id: "SCHEMA.EVENT_UNION", category: "Schema", label: "Event is a known kind", description: "Event must be Observation, Consent, or Redacted.", howToPass: "Use one of the three event types.", scope: "entry", status: "shipped", introducedIn: "0.3.0" },
  { id: "VERSION.CONTIGUOUS", category: "Sequence", label: "Versions have no gaps", description: "v == prev + 1, except after compaction.", howToPass: "Use the Recorder's append counter.", scope: "entry", status: "shipped", introducedIn: "0.3.0" },
  { id: "EVENT.COMMITMENT", category: "Hash chain", label: "Event matches its hash", description: "sha256(canonical(event)) == eventHash.", howToPass: "Hash the event before writing.", scope: "entry", status: "shipped", introducedIn: "0.3.0" },
  { id: "ESTIMATE.DECLARED", category: "Estimation", label: "Estimator declared", description: "Estimate chain has a well-formed estimator declaration.", howToPass: "Declare name, version, and opaque/ruleId.", scope: "record", status: "shipped", introducedIn: "0.3.0" },
  { id: "ESTIMATE.LINKS_EVIDENCE", category: "Estimation", label: "Estimates reference evidence", description: "Every estimate references an existing evidence entry.", howToPass: "Set evidenceVersion and evidenceEntryHash.", scope: "entry", status: "shipped", introducedIn: "0.3.0" },
  { id: "ESTIMATE.ORDER", category: "Estimation", label: "Estimates follow evidence order", description: "evidenceVersion strictly increasing.", howToPass: "Append estimates in evidence order.", scope: "entry", status: "shipped", introducedIn: "0.3.0" },
  { id: "WEIGHT.RANGE", category: "Estimation", label: "Weight in [0,1]", description: "evidentialWeight between 0 and 1.", howToPass: "Clamp weights.", scope: "entry", status: "shipped", introducedIn: "0.3.0" },
  { id: "POSTERIOR.RANGE", category: "Estimation", label: "Posteriors in (0,1)", description: "priorPosterior and updatedPosterior in open interval.", howToPass: "Clamp posteriors.", scope: "entry", status: "shipped", introducedIn: "0.3.0" },
  { id: "CONSENT.SCOPE", category: "Consent", label: "Consent scope covers export", description: "Export scope covered by granted consent.", howToPass: "Include consent events before export.", scope: "record", status: "shipped", introducedIn: "0.3.0" },
  { id: "CONSENT.WITHDRAWAL", category: "Consent", label: "No active withdrawal", description: "Export scope was not withdrawn.", howToPass: "Re-grant before export.", scope: "record", status: "shipped", introducedIn: "0.3.0" },
  { id: "ATTEST.INTEGRITY", category: "Attestation", label: "Attestation hash valid", description: "payloadHash matches payload.", howToPass: "Hash payload before writing.", scope: "record", status: "shipped", introducedIn: "0.3.0" },
  { id: "ATTEST.COVERS", category: "Attestation", label: "Attestation covers evidence", description: "Referenced version or hash exists.", howToPass: "Reference existing entries.", scope: "record", status: "shipped", introducedIn: "0.3.0" },
];

export const CATALOG_BY_ID = Object.fromEntries([...CATALOG, ...CATALOG_V03].map(c => [c.id, c]));
export const SHIPPED_CHECKS = CATALOG.filter(c => c.status === "shipped");
export const PLANNED_CHECKS = CATALOG.filter(c => c.status === "planned");
export const SHIPPED_CHECKS_V03 = [...SHIPPED_CHECKS, ...CATALOG_V03];
export const CATEGORIES = [...new Set(SHIPPED_CHECKS.map(c => c.category))];
export const CATEGORIES_V03 = [...new Set(SHIPPED_CHECKS_V03.map(c => c.category))];
