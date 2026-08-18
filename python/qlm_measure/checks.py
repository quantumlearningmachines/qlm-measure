"""
Check catalog v1 — single source of truth for all verification checks.

Generated from schema/checks.json (when it exists). Until then, this is the
canonical definition. Fields per check:
  id, category, label, description, how_to_pass, scope, status, introduced_in
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class CheckDef:
    id: str
    category: str
    label: str
    description: str
    how_to_pass: str
    scope: Literal["record", "entry"]
    status: Literal["shipped", "planned"]
    introduced_in: str


CATALOG: list[CheckDef] = [
    # ── Schema ──────────────────────────────────────────────────────────
    CheckDef(
        id="SCHEMA.REQUIRED",
        category="Schema",
        label="Required fields present",
        description="Every entry must carry version, timestamp, evidentialWeight, priorPosterior, updatedPosterior, entryHash, and prevHash. The record must carry studentScopeId.",
        how_to_pass="Emit every required field on every entry.",
        scope="entry",
        status="shipped",
        introduced_in="0.1.0",
    ),
    CheckDef(
        id="SCHEMA.TYPES",
        category="Schema",
        label="Field types valid",
        description="version is a positive integer; evidentialWeight, priorPosterior, and updatedPosterior are numbers; timestamp and entryHash are strings.",
        how_to_pass="Validate against the JSON Schema before writing.",
        scope="entry",
        status="shipped",
        introduced_in="0.1.0",
    ),
    CheckDef(
        id="SCHEMA.TIMESTAMP_FORMAT",
        category="Schema",
        label="Timestamp is ISO 8601",
        description="Every timestamp parses as RFC 3339 with a timezone offset or Z.",
        how_to_pass="Write UTC timestamps with Z suffix: 2026-08-15T14:20:00.000Z",
        scope="entry",
        status="shipped",
        introduced_in="0.2.2",
    ),

    # ── Sequence ────────────────────────────────────────────────────────
    CheckDef(
        id="VERSION.MONOTONIC",
        category="Sequence",
        label="Versions strictly increase",
        description="Each entry's version must be strictly greater than the previous entry's version.",
        how_to_pass="Assign version from an append counter, never from wall clock.",
        scope="entry",
        status="shipped",
        introduced_in="0.1.0",
    ),
    CheckDef(
        id="TIMESTAMP.MONOTONIC",
        category="Sequence",
        label="Timestamps do not go backward",
        description="Each entry's timestamp must be >= the previous entry's timestamp minus the configured tolerance.",
        how_to_pass="Write timestamps at append time from one clock.",
        scope="entry",
        status="shipped",
        introduced_in="0.1.0",
    ),

    # ── Enums ───────────────────────────────────────────────────────────
    CheckDef(
        id="ENUM.VALID",
        category="Enums",
        label="Enum values permitted",
        description="scaffoldType, depthLevel, epistemicMode, and triageResult must be values from the published enum sets.",
        how_to_pass="Use the exported enums from the SDK.",
        scope="entry",
        status="shipped",
        introduced_in="0.1.0",
    ),

    # ── Hash chain ──────────────────────────────────────────────────────
    CheckDef(
        id="HASH.PREV_LINK",
        category="Hash chain",
        label="Chain link valid",
        description="Each entry's prevHash must equal the previous entry's entryHash (or the compaction summaryHash for the first entry after compaction).",
        how_to_pass="Never insert, delete, or reorder entries. Append only.",
        scope="entry",
        status="shipped",
        introduced_in="0.1.0",
    ),
    CheckDef(
        id="HASH.ENTRY_RECOMPUTE",
        category="Hash chain",
        label="Entry hash recomputes",
        description="SHA-256 of the canonical hashable subset must equal entryHash.",
        how_to_pass="Hash after all fields are final. Canonicalize per the SDK spec.",
        scope="entry",
        status="shipped",
        introduced_in="0.1.0",
    ),

    # ── Posterior chain ──────────────────────────────────────────────────
    CheckDef(
        id="POSTERIOR.CHAIN",
        category="Posterior chain",
        label="Posterior chain consistent",
        description="Each entry's priorPosterior must equal the previous entry's updatedPosterior within 1e-9.",
        how_to_pass="Carry the previous posterior forward unchanged.",
        scope="entry",
        status="shipped",
        introduced_in="0.1.0",
    ),

    # ── Compaction ──────────────────────────────────────────────────────
    CheckDef(
        id="COMPACTION.BOUNDARY",
        category="Compaction",
        label="Compaction boundary intact",
        description="The first entry after compaction links to summaryHash; version continues from the compacted version.",
        how_to_pass="Compact only via the SDK helper.",
        scope="record",
        status="shipped",
        introduced_in="0.1.0",
    ),

    # ── Planned ─────────────────────────────────────────────────────────
    CheckDef(
        id="ESTIMATE.REPRODUCE",
        category="Estimation",
        label="Update reproduces posterior",
        description="Given the published update rule and per-entry parameters (weight, slip, guess), the verifier reproduces updatedPosterior from priorPosterior.",
        how_to_pass="Include an estimator declaration in the record. Use the published update rule.",
        scope="entry",
        status="planned",
        introduced_in="0.3.0",
    ),
    CheckDef(
        id="TEMPORAL.T_DESIGN",
        category="Temporal",
        label="Item created before session",
        description="The item referenced in the event existed before the session started.",
        how_to_pass="Include item metadata creation timestamp in the record.",
        scope="entry",
        status="planned",
        introduced_in="0.3.0",
    ),
    CheckDef(
        id="TEMPORAL.T_RESULT",
        category="Temporal",
        label="Response within session window",
        description="The response timestamp falls within the session start/end bounds.",
        how_to_pass="Include session bounds in the record.",
        scope="entry",
        status="planned",
        introduced_in="0.3.0",
    ),
    CheckDef(
        id="CONSENT.SCOPE",
        category="Consent",
        label="Consent scope covers export",
        description="The learner's consent scope is sufficient for the requested export level.",
        how_to_pass="Include a consent block in the record.",
        scope="record",
        status="planned",
        introduced_in="0.3.0",
    ),
    CheckDef(
        id="CONSENT.WITHDRAWAL",
        category="Consent",
        label="No active withdrawal",
        description="No active withdrawal exists for this learner.",
        how_to_pass="Include withdrawal status in the consent block.",
        scope="record",
        status="planned",
        introduced_in="0.3.0",
    ),
]


# 0.3-specific checks (shipped when verifier_v03 runs them)
CATALOG_V03: list[CheckDef] = [
    CheckDef(id="SCHEMA.EVENT_UNION", category="Schema", label="Event is a known kind", description="Event must be Observation, Consent, or Redacted.", how_to_pass="Use one of the three event types.", scope="entry", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="VERSION.CONTIGUOUS", category="Sequence", label="Versions have no gaps", description="v == prev + 1, except after compaction.", how_to_pass="Use the Recorder's append counter.", scope="entry", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="EVENT.COMMITMENT", category="Hash chain", label="Event matches its hash", description="sha256(canonical(event)) == eventHash.", how_to_pass="Hash the event before writing.", scope="entry", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="ESTIMATE.DECLARED", category="Estimation", label="Estimator declared", description="Estimate chain has a well-formed estimator declaration.", how_to_pass="Declare name, version, and opaque/ruleId.", scope="record", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="ESTIMATE.LINKS_EVIDENCE", category="Estimation", label="Estimates reference evidence", description="Every estimate entry references an existing evidence entry.", how_to_pass="Set evidenceVersion and evidenceEntryHash.", scope="entry", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="ESTIMATE.ORDER", category="Estimation", label="Estimates follow evidence order", description="evidenceVersion strictly increasing.", how_to_pass="Append estimates in evidence order.", scope="entry", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="WEIGHT.RANGE", category="Estimation", label="Weight in [0,1]", description="evidentialWeight between 0 and 1.", how_to_pass="Clamp weights.", scope="entry", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="POSTERIOR.RANGE", category="Estimation", label="Posteriors in (0,1)", description="priorPosterior and updatedPosterior in open interval (0,1).", how_to_pass="Clamp posteriors.", scope="entry", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="CONSENT.SCOPE", category="Consent", label="Consent scope covers export", description="Export scope is covered by a granted consent.", how_to_pass="Include consent events before export.", scope="record", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="CONSENT.WITHDRAWAL", category="Consent", label="No active withdrawal", description="Export scope was not withdrawn.", how_to_pass="Re-grant before export.", scope="record", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="ATTEST.INTEGRITY", category="Attestation", label="Attestation hash valid", description="payloadHash matches payload.", how_to_pass="Hash payload before writing.", scope="record", status="shipped", introduced_in="0.3.0"),
    CheckDef(id="ATTEST.COVERS", category="Attestation", label="Attestation covers evidence", description="Referenced version or hash exists.", how_to_pass="Reference existing entries.", scope="record", status="shipped", introduced_in="0.3.0"),
]

ALL_CHECKS_V03 = CATALOG + CATALOG_V03
CATALOG_BY_ID = {c.id: c for c in ALL_CHECKS_V03}
SHIPPED_CHECKS = [c for c in CATALOG if c.status == "shipped"]
PLANNED_CHECKS = [c for c in CATALOG if c.status == "planned"]
SHIPPED_CHECKS_V03 = SHIPPED_CHECKS + CATALOG_V03
CATEGORIES = list(dict.fromkeys(c.category for c in SHIPPED_CHECKS))
CATEGORIES_V03 = list(dict.fromkeys(c.category for c in SHIPPED_CHECKS_V03))
