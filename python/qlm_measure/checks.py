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

CATALOG_BY_ID = {c.id: c for c in CATALOG}
SHIPPED_CHECKS = [c for c in CATALOG if c.status == "shipped"]
PLANNED_CHECKS = [c for c in CATALOG if c.status == "planned"]
CATEGORIES = list(dict.fromkeys(c.category for c in SHIPPED_CHECKS))
