"""
CSV adapter — convert tabular data to ObservationEvents.

Usage:
  1. qlm-measure map export.csv → mapping.json (interactive or from flags)
  2. qlm-measure import --from csv --mapping mapping.json export.csv

The mapping specifies column names, constants, transforms, and which
columns to pseudonymize or drop.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
from datetime import datetime
from typing import Any, Optional

from .common import pseudonymize


def _parse_bool(val: str, true_vals: list[str], false_vals: list[str]) -> Optional[bool]:
    v = val.strip().lower()
    if v in [x.lower() for x in true_vals]:
        return True
    if v in [x.lower() for x in false_vals]:
        return False
    return None


def _parse_timestamp(val: str, fmt: Optional[str] = None, tz: Optional[str] = None) -> Optional[str]:
    """Parse a timestamp string to ISO 8601."""
    if not val or not val.strip():
        return None
    try:
        if fmt:
            dt = datetime.strptime(val.strip(), fmt)
        else:
            dt = datetime.fromisoformat(val.strip().replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    except (ValueError, TypeError):
        return None


def _parse_duration(val: str, unit: str = "ms") -> Optional[int]:
    """Parse a duration value to milliseconds."""
    try:
        n = float(val.strip())
        if unit == "s":
            return int(n * 1000)
        if unit == "m" or unit == "min":
            return int(n * 60000)
        return int(n)  # assume ms
    except (ValueError, TypeError):
        return None


def load_mapping(path: str) -> dict:
    """Load a column mapping from JSON."""
    with open(path) as f:
        return json.load(f)


def build_default_mapping(headers: list[str]) -> dict:
    """Build a best-guess mapping from CSV headers."""
    mapping = {
        "delimiter": ",",
        "encoding": "utf-8",
        "header": True,
        "columns": {},
        "constants": {},
        "transforms": {},
        "session": {"method": "gap", "gapMinutes": 30},
        "pseudonymize": [],
        "drop": [],
    }

    # Auto-detect common column names
    header_lower = {h.lower(): h for h in headers}
    guesses = {
        "studentId": ["student_id", "studentid", "student", "user_id", "userid", "learner_id", "learnerid"],
        "timestamp": ["timestamp", "ts", "time", "date", "datetime", "date_time"],
        "correct": ["correct", "is_correct", "iscorrect", "score", "result"],
        "skillId": ["skill_id", "skillid", "skill", "kc", "knowledge_component"],
        "domain": ["domain", "subject", "course"],
        "responseTimeMs": ["response_time", "responsetime", "latency", "duration", "time_ms"],
        "itemId": ["item_id", "itemid", "item", "question_id", "questionid"],
    }

    for field, candidates in guesses.items():
        for c in candidates:
            if c in header_lower:
                mapping["columns"][field] = header_lower[c]
                break

    if "studentId" in mapping["columns"]:
        mapping["pseudonymize"].append("studentId")

    return mapping


def csv_to_events(
    path: str,
    mapping: dict,
    salt: bytes,
) -> tuple[list[dict], dict]:
    """Convert CSV rows to ObservationEvents using a mapping.

    Returns:
        (events, skip_counts) where skip_counts maps reason → count
    """
    columns = mapping.get("columns", {})
    constants = mapping.get("constants", {})
    transforms = mapping.get("transforms", {})
    drop_cols = set(mapping.get("drop", []))
    pseudo_cols = set(mapping.get("pseudonymize", []))

    delimiter = mapping.get("delimiter", ",")
    encoding = mapping.get("encoding", "utf-8")

    events = []
    skipped = {"parse_error": 0, "missing_required": 0}

    with open(path, encoding=encoding, errors="replace", newline="") as f:
        # Handle BOM
        raw = f.read()
        if raw.startswith("\ufeff"):
            raw = raw[1:]

        reader = csv.DictReader(io.StringIO(raw), delimiter=delimiter)

        for row_num, row in enumerate(reader, 2):  # 2 because header is row 1
            try:
                event: dict[str, Any] = {"kind": "observation"}

                # Map columns
                for field, col_name in columns.items():
                    if col_name and col_name in row:
                        event[field] = row[col_name]

                # Apply constants
                for field, val in constants.items():
                    if field not in event:
                        event[field] = val

                # Apply transforms
                ts_transform = transforms.get("timestamp", {})
                if "timestamp" in event and ts_transform:
                    parsed = _parse_timestamp(
                        str(event["timestamp"]),
                        fmt=ts_transform.get("format"),
                        tz=ts_transform.get("tz"),
                    )
                    if parsed:
                        event["timestamp"] = parsed
                    else:
                        skipped["parse_error"] = skipped.get("parse_error", 0) + 1
                        continue

                correct_transform = transforms.get("correct", {})
                if "correct" in event and correct_transform:
                    val = str(event["correct"])
                    true_vals = correct_transform.get("true", ["1", "true", "yes", "correct"])
                    false_vals = correct_transform.get("false", ["0", "false", "no", "incorrect"])
                    parsed_bool = _parse_bool(val, true_vals, false_vals)
                    if parsed_bool is not None:
                        event["correct"] = parsed_bool
                    else:
                        skipped["parse_error"] = skipped.get("parse_error", 0) + 1
                        continue
                elif "correct" in event:
                    v = str(event["correct"]).strip().lower()
                    event["correct"] = v in ("1", "true", "yes", "correct")

                duration_transform = transforms.get("responseTimeMs", {})
                if "responseTimeMs" in event and duration_transform:
                    parsed_dur = _parse_duration(
                        str(event["responseTimeMs"]),
                        unit=duration_transform.get("unit", "ms"),
                    )
                    if parsed_dur is not None:
                        event["responseTimeMs"] = parsed_dur
                    else:
                        del event["responseTimeMs"]

                # Required fields check
                if "correct" not in event:
                    skipped["missing_required"] = skipped.get("missing_required", 0) + 1
                    continue

                # Pseudonymize
                for field in pseudo_cols:
                    if field in event and isinstance(event[field], str):
                        event[field] = pseudonymize(event[field], salt)

                # Source
                event.setdefault("source", constants.get("source", "csv-import"))

                # Drop PII columns from ext
                event.setdefault("ext", {})
                for col_name, val in row.items():
                    if col_name not in drop_cols and col_name not in [v for v in columns.values() if v]:
                        pass  # Don't include unmapped columns — they might contain PII

                events.append(event)

            except Exception:
                skipped["parse_error"] = skipped.get("parse_error", 0) + 1

    return events, skipped
