"""
Migrate 0.2 records to 0.3 format.

Splits inline entries into an evidence chain and one estimate chain
(estimator = unknown, opaque). Rehashes under 0.3 entry-hash scheme.
Sets derivedFrom = {schemaVersion: "0.2", lastEntryHash}.

Migrated records are new records; the old record remains valid under 0.2.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any


def _canonicalize(obj: Any) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()


def migrate_0_2_to_0_3(record: dict) -> dict:
    """Convert a schema 0.2 record to schema 0.3.

    Returns a new record dict. Does not modify the input.
    """
    if record.get("schemaVersion") == "0.3":
        return record  # already 0.3

    scope_id = record.get("studentScopeId", "")
    old_entries = record.get("entries", [])
    old_compacted = record.get("compactedBefore")

    # Build evidence entries and estimate entries
    ev_entries = []
    est_entries = []
    ev_prev_hash = old_compacted.get("summaryHash", "") if old_compacted else ""
    est_prev_hash = ""

    last_entry_hash = ""

    for old in old_entries:
        # Extract the event (the observation data)
        event = old.get("event", {})
        ts = old.get("timestamp", "")
        version = old.get("version", 0)

        # Evidence entry: hash from {version, timestamp, eventHash, prevHash}
        event_hash = _sha256(_canonicalize(event))
        ev_entry_hash = _sha256(_canonicalize({
            "version": version,
            "timestamp": ts,
            "eventHash": event_hash,
            "prevHash": ev_prev_hash,
        }))

        ev_entries.append({
            "version": version,
            "timestamp": ts,
            "eventHash": event_hash,
            "event": event,
            "prevHash": ev_prev_hash,
            "entryHash": ev_entry_hash,
        })

        # Estimate entry: carries the inline estimate fields
        est_entry = {
            "version": version,
            "evidenceVersion": version,
            "evidenceEntryHash": ev_entry_hash,
            "evidentialWeight": old.get("evidentialWeight"),
            "priorPosterior": old.get("priorPosterior"),
            "updatedPosterior": old.get("updatedPosterior"),
            "prevHash": est_prev_hash,
        }
        for opt_field in ("scaffoldType", "depthLevel", "epistemicMode",
                          "triageResult", "nonInterventionDecision"):
            val = old.get(opt_field)
            if val is not None:
                est_entry[opt_field] = val

        est_entry["entryHash"] = _sha256(_canonicalize(
            {k: v for k, v in est_entry.items() if k != "entryHash"}
        ))

        est_entries.append(est_entry)

        ev_prev_hash = ev_entry_hash
        est_prev_hash = est_entry["entryHash"]
        last_entry_hash = old.get("entryHash", "")

    result = {
        "schemaVersion": "0.3",
        "studentScopeId": scope_id,
        "evidence": {"entries": ev_entries},
        "estimates": [{
            "estimator": {"name": "unknown", "opaque": True},
            "entries": est_entries,
        }],
        "derivedFrom": {
            "schemaVersion": "0.2",
            "lastEntryHash": last_entry_hash,
        },
    }

    if old_compacted:
        result["evidence"]["compactedBefore"] = old_compacted

    return result
