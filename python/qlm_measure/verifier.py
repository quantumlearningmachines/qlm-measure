"""
Evidence Record Verifier — Python mirror.

Checks bookkeeping integrity WITHOUT any estimation mathematics.
"""

from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
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


def verify_record(
    record: EvidenceRecord,
    timestamp_tolerance_ms: int = 1000,
) -> VerificationResult:
    """Verify bookkeeping integrity of an evidence record."""
    violations: list[Violation] = []

    scope_id = record.get("studentScopeId", "")
    if not scope_id:
        violations.append(Violation(0, "schema", "Missing or empty studentScopeId"))

    entries = record.get("entries", [])
    if not isinstance(entries, list):
        violations.append(Violation(0, "schema", "entries must be a list"))
        return VerificationResult(valid=False, violations=violations, entries_checked=0)

    compacted = record.get("compactedBefore")
    prev_version = compacted["version"] if compacted else 0
    prev_hash = compacted.get("summaryHash", "") if compacted else ""
    last_updated: Optional[float] = None

    from datetime import datetime

    prev_ts_str = ""
    for entry in entries:
        v = entry.get("version", -1)

        # Schema
        if not isinstance(v, int) or v < 1:
            violations.append(Violation(v, "schema", "version must be a positive integer"))
        if not entry.get("timestamp"):
            violations.append(Violation(v, "schema", "timestamp is required"))
        if not isinstance(entry.get("evidentialWeight"), (int, float)):
            violations.append(Violation(v, "schema", "evidentialWeight must be a number"))
        if not isinstance(entry.get("priorPosterior"), (int, float)):
            violations.append(Violation(v, "schema", "priorPosterior must be a number"))
        if not isinstance(entry.get("updatedPosterior"), (int, float)):
            violations.append(Violation(v, "schema", "updatedPosterior must be a number"))

        # Monotonic version
        if v <= prev_version:
            violations.append(Violation(v, "version", f"Version {v} <= previous {prev_version}"))

        # Timestamp monotonicity
        ts_str = entry.get("timestamp", "")
        if prev_ts_str and ts_str:
            try:
                prev_ms = datetime.fromisoformat(prev_ts_str.replace("Z", "+00:00")).timestamp() * 1000
                curr_ms = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp() * 1000
                if curr_ms < prev_ms - timestamp_tolerance_ms:
                    violations.append(Violation(v, "timestamp", f"Timestamp goes backward"))
            except (ValueError, TypeError):
                pass

        # Enum validation
        st = entry.get("scaffoldType")
        if st and st not in VALID_SCAFFOLD_TYPES:
            violations.append(Violation(v, "enum", f"Invalid scaffoldType: {st}"))
        dl = entry.get("depthLevel")
        if dl and dl not in VALID_DEPTH_LEVELS:
            violations.append(Violation(v, "enum", f"Invalid depthLevel: {dl}"))
        em = entry.get("epistemicMode")
        if em and em not in VALID_EPISTEMIC_MODES:
            violations.append(Violation(v, "enum", f"Invalid epistemicMode: {em}"))
        tr = entry.get("triageResult")
        if tr and tr not in VALID_TRIAGE_RESULTS:
            violations.append(Violation(v, "enum", f"Invalid triageResult: {tr}"))

        # Hash chain
        if entry.get("prevHash") != prev_hash:
            violations.append(Violation(v, "hash", f"prevHash mismatch"))
        computed = _hash_entry(entry)
        if entry.get("entryHash") != computed:
            violations.append(Violation(v, "hash", f"entryHash mismatch"))

        # Posterior chain
        if last_updated is not None:
            prior = entry.get("priorPosterior")
            if isinstance(prior, (int, float)) and abs(prior - last_updated) > 1e-9:
                violations.append(Violation(v, "posterior", f"priorPosterior ({prior}) != previous updatedPosterior ({last_updated})"))

        prev_version = v
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
