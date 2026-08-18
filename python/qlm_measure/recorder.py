"""
Recorder — produce verifiable evidence records without a server.

Usage:
    from qlm_measure.recorder import Recorder

    rec = Recorder(scope_id="syn-8f2c-0042")
    rec.append(observation_event)
    rec.append(consent_event)
    record = rec.export()          # plain dict, verifies clean at Level 1
    head = rec.chain_head()        # last entryHash
    rec2 = Recorder.from_record(record)  # resume an existing chain

Rules:
- No network. No engine. No dependencies beyond the SDK.
- Version comes from an internal append counter, never from the caller.
- Timestamp comes from event.timestamp if present, else the Recorder's clock.
- append() computes eventHash, prevHash, entryHash and validates before hashing.
- export() returns a record that passes verify at Level 1.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Optional

from .schema_v03 import (
    Record_v03, EvChain, EvidenceEntry, CompactionBoundary,
    ObservationEvent, ConsentEvent, RedactedEvent, Event,
)

# Valid event kinds
_VALID_SCAFFOLD_TYPES = {"none", "socratic", "probing", "metacognitive", "scaffolding", "explain", "hint", "demonstrate"}
_VALID_EPISTEMIC_MODES = {"experience", "inference", "analogy", "testimony"}
_VALID_CONSENT_ACTIONS = {"granted", "withdrawn"}
_VALID_CONSENT_SCOPES = {"instruction", "research", "export"}


def _canonicalize(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def _event_hash(event: dict) -> str:
    return _sha256(_canonicalize(event))


def _entry_hash(version: int, timestamp: str, event_hash: str, prev_hash: str) -> str:
    """Entry hash = SHA-256 of canonical({version, timestamp, eventHash, prevHash}).

    The event is committed by eventHash, not embedded in the entry hash.
    This is what makes redaction hash-preserving.
    """
    hashable = {
        "version": version,
        "timestamp": timestamp,
        "eventHash": event_hash,
        "prevHash": prev_hash,
    }
    return _sha256(_canonicalize(hashable))


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _validate_observation(event: dict) -> None:
    """Validate an observation event. Raises ValueError on invalid fields."""
    if "correct" not in event:
        raise ValueError("ObservationEvent must have 'correct' field")
    st = event.get("scaffoldType")
    if st and st not in _VALID_SCAFFOLD_TYPES:
        raise ValueError(f"Invalid scaffoldType: {st}")
    em = event.get("epistemicMode")
    if em and em not in _VALID_EPISTEMIC_MODES:
        raise ValueError(f"Invalid epistemicMode: {em}")


def _validate_consent(event: dict) -> None:
    """Validate a consent event."""
    action = event.get("action")
    if action not in _VALID_CONSENT_ACTIONS:
        raise ValueError(f"ConsentEvent action must be 'granted' or 'withdrawn', got '{action}'")
    scopes = event.get("scopes", [])
    if not scopes:
        raise ValueError("ConsentEvent must have at least one scope")
    for s in scopes:
        if s not in _VALID_CONSENT_SCOPES:
            raise ValueError(f"Invalid consent scope: {s}")


def _detect_kind(event: dict) -> str:
    if event.get("redacted"):
        return "redacted"
    if event.get("kind") == "consent" or event.get("action") in _VALID_CONSENT_ACTIONS:
        return "consent"
    return "observation"


class Recorder:
    """Append-only evidence chain recorder. Produces Level 1 records."""

    def __init__(
        self,
        scope_id: str,
        timestamp_tolerance_ms: int = 1000,
    ):
        if not scope_id:
            raise ValueError("scope_id is required")
        self._scope_id = scope_id
        self._entries: list[EvidenceEntry] = []
        self._version = 0
        self._prev_hash = ""
        self._last_ts: Optional[str] = None
        self._tolerance_ms = timestamp_tolerance_ms
        self._compacted_before: Optional[CompactionBoundary] = None

    @classmethod
    def from_record(cls, record: dict) -> "Recorder":
        """Resume an existing evidence chain."""
        scope_id = record.get("studentScopeId", "")
        rec = cls(scope_id)

        # Handle 0.3 records
        evidence = record.get("evidence", {})
        entries = evidence.get("entries", record.get("entries", []))
        compacted = evidence.get("compactedBefore", record.get("compactedBefore"))

        if compacted:
            rec._compacted_before = compacted
            rec._version = compacted["version"]
            rec._prev_hash = compacted.get("summaryHash", "")

        for entry in entries:
            rec._entries.append(entry)
            rec._version = entry["version"]
            rec._prev_hash = entry["entryHash"]
            rec._last_ts = entry.get("timestamp")

        return rec

    def append(self, event: dict) -> EvidenceEntry:
        """Append an event to the evidence chain.

        Args:
            event: An ObservationEvent, ConsentEvent, or dict with the right fields.

        Returns:
            The created EvidenceEntry with computed hashes.

        Raises:
            ValueError: If the event is invalid or timestamp goes backward.
        """
        kind = _detect_kind(event)

        # Validate
        if kind == "observation":
            _validate_observation(event)
        elif kind == "consent":
            _validate_consent(event)
        elif kind == "redacted":
            if "eventHash" not in event:
                raise ValueError("RedactedEvent must have 'eventHash'")

        # Timestamp
        ts = event.get("timestamp") or event.get("at") or _now_iso()

        # Check monotonicity
        if self._last_ts:
            try:
                prev_ms = datetime.fromisoformat(self._last_ts.replace("Z", "+00:00")).timestamp() * 1000
                curr_ms = datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp() * 1000
                if curr_ms < prev_ms - self._tolerance_ms:
                    raise ValueError(
                        f"Timestamp goes backward: {ts} < {self._last_ts} "
                        f"(tolerance: {self._tolerance_ms}ms)"
                    )
            except ValueError as e:
                if "Timestamp goes backward" in str(e):
                    raise

        # Compute hashes
        self._version += 1
        ev_hash = _event_hash(event)
        entry_hash = _entry_hash(self._version, ts, ev_hash, self._prev_hash)

        entry: EvidenceEntry = {
            "version": self._version,
            "timestamp": ts,
            "eventHash": ev_hash,
            "event": event,
            "prevHash": self._prev_hash,
            "entryHash": entry_hash,
        }

        self._entries.append(entry)
        self._prev_hash = entry_hash
        self._last_ts = ts

        return entry

    def redact(self, version: int) -> None:
        """Redact an event by version. Replaces the event with a RedactedEvent.

        The entry hash is preserved because it was computed from
        {version, timestamp, eventHash, prevHash} — the event itself is
        committed only via eventHash.
        """
        for entry in self._entries:
            if entry["version"] == version:
                if entry["event"].get("redacted"):
                    return  # already redacted
                entry["event"] = {"redacted": True, "eventHash": entry["eventHash"]}
                return
        raise ValueError(f"No entry with version {version}")

    def chain_head(self) -> str:
        """Return the last entryHash (the chain head)."""
        return self._prev_hash

    def export(self) -> Record_v03:
        """Export as a schema 0.3 record. Verifies clean at Level 1."""
        evidence: EvChain = {"entries": list(self._entries)}
        if self._compacted_before:
            evidence["compactedBefore"] = self._compacted_before

        record: Record_v03 = {
            "schemaVersion": "0.3",
            "studentScopeId": self._scope_id,
            "evidence": evidence,
        }
        return record

    @property
    def version(self) -> int:
        return self._version

    @property
    def entries(self) -> list[EvidenceEntry]:
        return list(self._entries)
