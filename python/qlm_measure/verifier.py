"""
Evidence Record Verifier — Python mirror.

Checks bookkeeping integrity WITHOUT any estimation mathematics.
verify makes no network calls. Records never leave your machine.
"""

from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional

from .schema import EvidenceRecord, EvidenceEntry

VALID_SCAFFOLD_TYPES = {"none", "socratic", "probing", "metacognitive", "scaffolding", "explain", "hint", "demonstrate"}
VALID_DEPTH_LEVELS = {"surface", "conceptual", "transfer", "integration"}
VALID_EPISTEMIC_MODES = {"experience", "inference", "analogy", "testimony"}
VALID_TRIAGE_RESULTS = {"correct", "slip", "misconception", "disengagement", "ambiguous"}


@dataclass
class Violation:
    version: int
    category: str  # schema | version | timestamp | hash | posterior | compaction | enum
    message: str
    check_id: str = ""  # e.g. HASH.ENTRY_RECOMPUTE


@dataclass
class VerificationResult:
    valid: bool
    violations: list[Violation] = field(default_factory=list)
    entries_checked: int = 0


def _canonicalize(obj: object) -> str:
    """Canonical JSON: sorted keys, no whitespace."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _hash_entry(entry: EvidenceEntry) -> str:
    hashable = {
        "version": entry.get("version"),
        "timestamp": entry.get("timestamp"),
        "event": entry.get("event"),
        "scaffoldType": entry.get("scaffoldType"),
        "depthLevel": entry.get("depthLevel"),
        "epistemicMode": entry.get("epistemicMode"),
        "triageResult": entry.get("triageResult"),
        "evidentialWeight": entry.get("evidentialWeight"),
        "priorPosterior": entry.get("priorPosterior"),
        "updatedPosterior": entry.get("updatedPosterior"),
        "nonInterventionDecision": entry.get("nonInterventionDecision"),
    }
    return _sha256(_canonicalize(hashable))


def _parse_timestamp(ts_str: str) -> Optional[float]:
    """Parse ISO 8601 timestamp. Returns epoch ms or None on failure."""
    try:
        return datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp() * 1000
    except (ValueError, TypeError, AttributeError):
        return None


def verify_record(
    record: EvidenceRecord,
    timestamp_tolerance_ms: int = 1000,
) -> VerificationResult:
    """Verify bookkeeping integrity of an evidence record."""
    violations: list[Violation] = []

    scope_id = record.get("studentScopeId", "")
    if not scope_id:
        violations.append(Violation(0, "schema", "Missing or empty studentScopeId", "SCHEMA.REQUIRED"))

    entries = record.get("entries", [])
    if not isinstance(entries, list):
        violations.append(Violation(0, "schema", "entries must be a list", "SCHEMA.REQUIRED"))
        return VerificationResult(valid=False, violations=violations, entries_checked=0)

    compacted = record.get("compactedBefore")
    prev_version = compacted["version"] if compacted else 0
    prev_hash = compacted.get("summaryHash", "") if compacted else ""
    last_updated: Optional[float] = None

    prev_ts_str = ""
    for entry in entries:
        v = entry.get("version", -1)

        # SCHEMA.REQUIRED
        if not isinstance(v, int) or v < 1:
            violations.append(Violation(v, "schema", "version must be a positive integer", "SCHEMA.REQUIRED"))
        if not entry.get("timestamp"):
            violations.append(Violation(v, "schema", "timestamp is required", "SCHEMA.REQUIRED"))
        for req_field in ("evidentialWeight", "priorPosterior", "updatedPosterior"):
            if req_field not in entry:
                violations.append(Violation(v, "schema", f"{req_field} must be a number", "SCHEMA.REQUIRED"))
        if "entryHash" not in entry:
            violations.append(Violation(v, "schema", "entryHash is required", "SCHEMA.REQUIRED"))
        if "prevHash" not in entry:
            violations.append(Violation(v, "schema", "prevHash is required", "SCHEMA.REQUIRED"))

        # SCHEMA.TYPES — only when field exists but has wrong type
        if "evidentialWeight" in entry and not isinstance(entry["evidentialWeight"], (int, float)):
            violations.append(Violation(v, "schema", "evidentialWeight must be a number", "SCHEMA.TYPES"))
        if "priorPosterior" in entry and not isinstance(entry["priorPosterior"], (int, float)):
            violations.append(Violation(v, "schema", "priorPosterior must be a number", "SCHEMA.TYPES"))
        if "updatedPosterior" in entry and not isinstance(entry["updatedPosterior"], (int, float)):
            violations.append(Violation(v, "schema", "updatedPosterior must be a number", "SCHEMA.TYPES"))

        # SCHEMA.TIMESTAMP_FORMAT (fixes F7: no longer silently skipped)
        ts_str = entry.get("timestamp", "")
        ts_ms = _parse_timestamp(ts_str) if ts_str else None
        if ts_str and ts_ms is None:
            violations.append(Violation(v, "timestamp", f"Timestamp is not valid ISO 8601: {ts_str!r}", "SCHEMA.TIMESTAMP_FORMAT"))

        # VERSION.MONOTONIC
        if isinstance(v, int) and v <= prev_version:
            violations.append(Violation(v, "version", f"Version {v} <= previous {prev_version}", "VERSION.MONOTONIC"))

        # TIMESTAMP.MONOTONIC
        if prev_ts_str and ts_str and ts_ms is not None:
            prev_ms = _parse_timestamp(prev_ts_str)
            if prev_ms is not None and ts_ms < prev_ms - timestamp_tolerance_ms:
                violations.append(Violation(v, "timestamp", "Timestamp goes backward", "TIMESTAMP.MONOTONIC"))

        # ENUM.VALID
        st = entry.get("scaffoldType")
        if st and st not in VALID_SCAFFOLD_TYPES:
            violations.append(Violation(v, "enum", f"Invalid scaffoldType: {st}", "ENUM.VALID"))
        dl = entry.get("depthLevel")
        if dl and dl not in VALID_DEPTH_LEVELS:
            violations.append(Violation(v, "enum", f"Invalid depthLevel: {dl}", "ENUM.VALID"))
        em = entry.get("epistemicMode")
        if em and em not in VALID_EPISTEMIC_MODES:
            violations.append(Violation(v, "enum", f"Invalid epistemicMode: {em}", "ENUM.VALID"))
        tr = entry.get("triageResult")
        if tr and tr not in VALID_TRIAGE_RESULTS:
            violations.append(Violation(v, "enum", f"Invalid triageResult: {tr}", "ENUM.VALID"))

        # HASH.PREV_LINK
        if entry.get("prevHash") != prev_hash:
            violations.append(Violation(v, "hash", "prevHash mismatch", "HASH.PREV_LINK"))

        # HASH.ENTRY_RECOMPUTE
        computed = _hash_entry(entry)
        if entry.get("entryHash") != computed:
            violations.append(Violation(v, "hash", "entryHash mismatch", "HASH.ENTRY_RECOMPUTE"))

        # POSTERIOR.CHAIN
        if last_updated is not None:
            prior = entry.get("priorPosterior")
            if isinstance(prior, (int, float)) and abs(prior - last_updated) > 1e-9:
                violations.append(Violation(
                    v, "posterior",
                    f"priorPosterior ({prior}) != previous updatedPosterior ({last_updated})",
                    "POSTERIOR.CHAIN",
                ))

        prev_version = v if isinstance(v, int) else prev_version
        prev_ts_str = ts_str
        prev_hash = entry.get("entryHash", "")
        up = entry.get("updatedPosterior")
        if isinstance(up, (int, float)):
            last_updated = up

    return VerificationResult(
        valid=len(violations) == 0,
        violations=violations,
        entries_checked=len(entries),
    )


def replay_to_version(record: EvidenceRecord, target_version: int) -> list[EvidenceEntry]:
    """Return entries up to and including target_version."""
    return [e for e in record.get("entries", []) if e.get("version", 0) <= target_version]


def posterior_at_version(record: EvidenceRecord, target_version: int) -> Optional[float]:
    """Get the posterior at a specific version."""
    entries = replay_to_version(record, target_version)
    if not entries:
        return None
    return entries[-1].get("updatedPosterior")
