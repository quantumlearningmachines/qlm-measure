"""Schema plus bounded consistency checks; cannot authenticate cited evidence."""
import argparse
import json
import re
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from jsonschema import Draft202012Validator, FormatChecker

ROOT = Path(__file__).parent
SCHEMA = json.loads((ROOT / "assistance-capture.schema.json").read_text())
FORMATS = FormatChecker()


@FORMATS.checks("date-time", raises=(ValueError, TypeError))
def timestamp(value):
    # datetime.fromisoformat normalizes invalid offset components, e.g. +00:60.
    # Bound components lexically before parsing dates and timezone arithmetic.
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt](?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](\.[0-9]+)?([Zz]|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])", value):
        return False
    fraction = re.search(r"\.(\d+)(?:[Zz]|[+-]\d{2}:\d{2})$", value)
    if fraction and any(character != "0" for character in fraction.group(1)[6:]):
        return False  # Do not truncate precision when comparing source windows.
    try:
        return datetime.fromisoformat(value.upper().replace("Z", "+00:00")).tzinfo is not None
    except ValueError:
        return False


@FORMATS.checks("uri", raises=(ValueError, TypeError))
def absolute_reference(value):
    return isinstance(value, str) and bool(re.fullmatch(r"[A-Za-z][A-Za-z0-9+.-]*:\S+", value)) and bool(urlsplit(value).scheme)


VALIDATOR = Draft202012Validator(SCHEMA, format_checker=FORMATS)


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def validate(record):
    json.dumps(record, allow_nan=False)
    VALIDATOR.validate(record)
    identifiers = [item["evidence_id"] for item in record["evidence"]]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("Duplicate evidence_id")
    for node in walk(record):
        for key in ("evidence_refs", "searched_evidence_refs"):
            if key in node and not set(node[key]) <= set(identifiers):
                raise ValueError("Unresolved evidence reference")
    capture = record["capture"]
    window = capture["window"]
    stage = record["assistance"]["lifecycle"]
    if stage["state"] == "observed" and stage["value"] not in capture["boundary"]["event_classes"]:
        raise ValueError("Observed lifecycle is outside the declared capture boundary")
    if stage["state"] == "observed":
        capability = capture["capabilities"][stage["value"]]
        if capability["state"] == "not_collected" or (capability["state"] == "observed" and capability["value"] is False):
            raise ValueError("Observed lifecycle contradicts the instrument's declared absence of that capture hook")
    if all(window[k]["state"] == "observed" for k in ("start", "end")):
        start, end = [datetime.fromisoformat(window[k]["value"].upper().replace("Z", "+00:00")) for k in ("start", "end")]
        if start > end:
            raise ValueError("Observation window is reversed")
        event_time = record["assistance"]["event_time"]["utc"]
        if event_time["state"] == "observed" and not start <= datetime.fromisoformat(event_time["value"].upper().replace("Z", "+00:00")) <= end:
            raise ValueError("Observed native event time is outside the capture window")
    if capture["coverage"].get("value") == "complete_within_boundary":
        if any(window[k]["state"] != "observed" for k in ("start", "end")):
            raise ValueError("Complete coverage requires a known observation window")
        for stage in capture["boundary"]["event_classes"]:
            if capture["capabilities"][stage].get("value") is not True:
                raise ValueError("Complete coverage requires declared instrumentation for each bounded event class")
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("paths", nargs="+")
    args = parser.parse_args()
    for filename in args.paths:
        validate(json.loads(Path(filename).read_text()))
        print(f"VALID: {filename}")
