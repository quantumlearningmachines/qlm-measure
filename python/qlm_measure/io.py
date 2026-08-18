"""
File loader for evidence records.

Supports:
  .json  — one EvidenceRecord object, or a JSON array of records
  .jsonl / .ndjson — one EvidenceRecord per line
  stdin  — detect by content, not extension

UTF-8, tolerates BOM. Parse errors report line number.
Empty input is a usage error (exit 2), not a pass.
Never logs record contents.
"""
from __future__ import annotations

import json
import sys
from typing import BinaryIO


class LoadError(Exception):
    """Raised on parse or format errors. Message is safe to print."""

    def __init__(self, message: str, line: int | None = None):
        self.line = line
        super().__init__(message)


def load_records(path: str) -> list[dict]:
    """Load evidence records from a file path or '-' for stdin."""
    if path == "-":
        return _load_stream(sys.stdin.buffer, "<stdin>")

    with open(path, "rb") as f:
        return _load_stream(f, path)


def _load_stream(stream: BinaryIO, label: str) -> list[dict]:
    raw = stream.read()
    if not raw or not raw.strip():
        raise LoadError(f"{label}: empty input")

    # Strip BOM
    if raw[:3] == b"\xef\xbb\xbf":
        raw = raw[3:]

    text = raw.decode("utf-8")

    # Detect format: if first non-whitespace is '[' or '{', try JSON
    stripped = text.lstrip()
    if not stripped:
        raise LoadError(f"{label}: empty input")

    if stripped[0] == "[":
        return _parse_json_array(text, label)
    elif stripped[0] == "{":
        # Could be single object or JSONL
        if "\n" in stripped and _looks_like_jsonl(stripped):
            return _parse_jsonl(text, label)
        return _parse_json_object(text, label)
    else:
        raise LoadError(f"{label}: unrecognized format (expected JSON object, array, or JSONL)")


def _looks_like_jsonl(text: str) -> bool:
    """Heuristic: if the second line also starts with '{', it's JSONL."""
    lines = text.strip().split("\n", 2)
    if len(lines) < 2:
        return False
    return lines[1].lstrip().startswith("{")


def _parse_json_object(text: str, label: str) -> list[dict]:
    try:
        obj = json.loads(text)
    except json.JSONDecodeError as e:
        raise LoadError(f"{label}: JSON parse error at line {e.lineno}: {e.msg}")
    if not isinstance(obj, dict):
        raise LoadError(f"{label}: expected a JSON object, got {type(obj).__name__}")
    # Schema 0.2: entries at top level. Schema 0.3: evidence.entries.
    if "entries" not in obj and "evidence" not in obj:
        raise LoadError(f"{label}: object has no 'entries' or 'evidence' field — not an EvidenceRecord")
    return [obj]


def _parse_json_array(text: str, label: str) -> list[dict]:
    try:
        arr = json.loads(text)
    except json.JSONDecodeError as e:
        raise LoadError(f"{label}: JSON parse error at line {e.lineno}: {e.msg}")
    if not isinstance(arr, list):
        raise LoadError(f"{label}: expected a JSON array")
    for i, item in enumerate(arr):
        if not isinstance(item, dict):
            raise LoadError(f"{label}: array element {i} is not an object")
        if "entries" not in item and "evidence" not in item:
            raise LoadError(f"{label}: array element {i} has no 'entries' field")
    return arr


def _parse_jsonl(text: str, label: str) -> list[dict]:
    records = []
    for lineno, line in enumerate(text.split("\n"), 1):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError as e:
            raise LoadError(f"{label}: JSONL parse error at line {lineno}: {e.msg}", line=lineno)
        if not isinstance(obj, dict):
            raise LoadError(f"{label}: line {lineno} is not a JSON object", line=lineno)
        if "entries" not in obj:
            raise LoadError(f"{label}: line {lineno} has no 'entries' field", line=lineno)
        records.append(obj)
    if not records:
        raise LoadError(f"{label}: no records found in JSONL")
    return records
