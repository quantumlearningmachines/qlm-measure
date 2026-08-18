"""
Common adapter framework.

Shared pseudonymization, session inference, and import report logic.
"""
from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional, Any


def pseudonymize(actor_id: str, salt: bytes) -> str:
    """HMAC-SHA256 pseudonymization. Salt is required and never stored in records."""
    if not salt:
        raise ValueError("Salt is required for pseudonymization. Plain SHA-256 is not acceptable.")
    digest = hmac.new(salt, actor_id.encode(), hashlib.sha256).hexdigest()
    return f"imp-{digest[:24]}"


def salt_fingerprint(salt: bytes) -> str:
    """SHA-256 of the salt itself — stored in the import block so linkability is detectable."""
    return hashlib.sha256(salt).hexdigest()[:16]


def infer_sessions(
    events: list[dict],
    method: str = "gap",
    gap_minutes: int = 30,
    column: Optional[str] = None,
) -> list[dict]:
    """Assign session IDs to events based on the chosen method.

    Methods:
        gap: New session when time gap > gap_minutes
        column: Use a named field from the event
        registration: Use xAPI context.registration
    """
    if method == "column" and column:
        for e in events:
            e.setdefault("sessionId", e.get(column, "unknown"))
        return events

    if method == "registration":
        for e in events:
            e.setdefault("sessionId", e.get("_registration", "unknown"))
        return events

    # Gap method
    events_sorted = sorted(events, key=lambda e: e.get("timestamp", ""))
    session_id = 1
    last_ts = None

    for e in events_sorted:
        ts_str = e.get("timestamp", "")
        try:
            ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            ts = None

        if last_ts and ts:
            gap = (ts - last_ts).total_seconds() / 60
            if gap > gap_minutes:
                session_id += 1

        e.setdefault("sessionId", f"session-{session_id}")
        if ts:
            last_ts = ts

    return events_sorted


@dataclass
class ImportReport:
    """Structured import report."""
    adapter: str
    adapter_version: str = "0.2.2"
    sources: list[dict] = field(default_factory=list)
    mapped: int = 0
    skipped: dict = field(default_factory=dict)
    records: int = 0
    verified_clean: int = 0
    sessions: dict = field(default_factory=dict)
    dropped_fields: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    salt_fingerprint: str = ""
    mapping_hash: str = ""
    imported_at: str = ""

    def to_dict(self) -> dict:
        return {
            "adapter": self.adapter,
            "adapterVersion": self.adapter_version,
            "sources": self.sources,
            "mapped": self.mapped,
            "skipped": self.skipped,
            "records": self.records,
            "verified_clean": self.verified_clean,
            "sessions": self.sessions,
            "dropped_fields": self.dropped_fields,
            "warnings": self.warnings,
            "saltFingerprint": self.salt_fingerprint,
            "mappingHash": self.mapping_hash,
            "importedAt": self.imported_at,
        }

    def validate_counts(self, total_items: int) -> bool:
        """mapped + sum(skipped) must equal total_items."""
        skipped_total = sum(self.skipped.values())
        return self.mapped + skipped_total == total_items
