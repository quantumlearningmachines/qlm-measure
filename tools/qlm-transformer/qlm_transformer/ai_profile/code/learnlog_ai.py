"""Illustrative Learnlog AI Use profile v0.1.0.

This is a profile/example validator, NOT a comprehensive Learnlog verifier.
Only contained, untruncated, unredacted, unsigned SHA-256 fixtures are supported.
Hashing follows draft-srivastava-learnlog-00 section 7.2. If rfc8785 is not
installed, canonicalization supports only ASCII strings and safe integers;
other inputs are rejected, not silently serialized as purported full JCS.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import sys
from datetime import datetime

try:
    import rfc8785
except ImportError:
    rfc8785 = None
try:
    import jsonschema
except ImportError:
    jsonschema = None

VERSION = "0.1.0"
PROFILE_ID = "https://example.org/learnlog/102026/ai-use/v0.1.0"
CONDITION_SET_ID = "https://example.org/learnlog/102026/ai-conditions/v0.1.0"
CONDITION_SET_VERSION = "0.1.0"
EVENT_SCHEMA = "https://example.org/learnlog/102026/example-learning/v0.1"
ASSIST_SCHEMA = "urn:ietf:params:learnlog:events:assist"
CONDITION_IDS = tuple(f"C{i:02d}" for i in range(1, 17))
CHANGED_CONDITIONS = {"C03", "C04", "C08", "C09", "C10", "C11", "C13", "C14", "C15"}
RESULTS = {"supported_present", "supported_absent", "indeterminate", "not_applicable"}
UNKNOWN_REASONS = {
    "outside_observation", "not_collected", "not_reported_after_review",
    "redacted", "truncated", "unavailable_source", "conflicting_evidence",
    "missing_comparator",
}
BASE = Path(__file__).resolve().parents[1]


class ValidationError(ValueError):
    """A profile fixture or sidecar failed structural/semantic checks."""


def require(condition, message):
    if not condition:
        raise ValidationError(message)


def _safe_fixture_value(value):
    if value is None or isinstance(value, bool):
        return
    if isinstance(value, int):
        require(abs(value) < 2**53, "fallback canonicalizer requires safe integers")
        return
    if isinstance(value, str):
        require(value.isascii(), "fallback canonicalizer rejects non-ASCII strings")
        return
    if isinstance(value, list):
        for item in value:
            _safe_fixture_value(item)
        return
    if isinstance(value, dict):
        for key, item in value.items():
            require(isinstance(key, str), "JSON object key must be a string")
            _safe_fixture_value(key)
            _safe_fixture_value(item)
        return
    raise ValidationError("fallback canonicalizer rejects floats and non-JSON values")


def canonical(value):
    if rfc8785 is not None:
        try:
            return rfc8785.dumps(value)
        except (ValueError, TypeError) as exc:
            raise ValidationError(f"JCS canonicalization failed: {exc}") from exc
    _safe_fixture_value(value)
    return json.dumps(value, sort_keys=True, ensure_ascii=False,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def hash_value(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def hash_bytes(value):
    return hashlib.sha256(value).hexdigest()


def _unique_object(pairs):
    value = {}
    for key, item in pairs:
        require(key not in value, f"duplicate JSON key: {key}")
        value[key] = item
    return value


def load_json(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"),
                          object_pairs_hook=_unique_object,
                          parse_constant=lambda x: (_ for _ in ()).throw(
                              ValidationError(f"non-JSON numeric constant: {x}")))
    except (json.JSONDecodeError, UnicodeError) as exc:
        raise ValidationError(f"invalid JSON: {exc}") from exc


def dump_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n",
                          encoding="utf-8")


def _is_type(value, type_name):
    return {
        "object": isinstance(value, dict), "array": isinstance(value, list),
        "string": isinstance(value, str), "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "boolean": isinstance(value, bool), "null": value is None,
    }[type_name]


def _resolve_local_ref(root, ref):
    require(ref.startswith("#/"), "fallback schema checker only resolves local refs")
    value = root
    for part in ref[2:].split("/"):
        value = value[part.replace("~1", "/").replace("~0", "~")]
    return value


def _schema_check(value, schema, root, location="$"):
    """Evaluate ONLY keywords used in the bundled schemas, fail closed otherwise.

    This is deliberately a small validator for these schema documents and is
    not a general JSON Schema implementation. Optional jsonschema takes priority.
    """
    allowed = {"$schema", "$id", "$defs", "$ref", "title", "description", "$comment",
               "type", "const", "enum", "required", "properties", "additionalProperties",
               "items", "minItems", "maxItems", "uniqueItems", "minLength", "pattern",
               "minimum", "maximum", "oneOf", "anyOf", "allOf", "not", "if", "then", "else"}
    require(not (set(schema) - allowed), f"unsupported schema keyword at {location}")
    if "$ref" in schema:
        _schema_check(value, _resolve_local_ref(root, schema["$ref"]), root, location)
    if "type" in schema:
        wanted = schema["type"]
        choices = wanted if isinstance(wanted, list) else [wanted]
        require(any(_is_type(value, t) for t in choices), f"{location}: wrong type")
    if "const" in schema:
        require(value == schema["const"], f"{location}: wrong constant")
    if "enum" in schema:
        require(value in schema["enum"], f"{location}: value not in enum")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            require(key in value, f"{location}: missing {key}")
        properties = schema.get("properties", {})
        for key, item in value.items():
            if key in properties:
                _schema_check(item, properties[key], root, f"{location}.{key}")
            elif schema.get("additionalProperties", True) is False:
                raise ValidationError(f"{location}: unexpected member {key}")
            elif isinstance(schema.get("additionalProperties"), dict):
                _schema_check(item, schema["additionalProperties"], root, f"{location}.{key}")
    if isinstance(value, list):
        require(len(value) >= schema.get("minItems", 0), f"{location}: too few items")
        require(len(value) <= schema.get("maxItems", len(value)), f"{location}: too many items")
        if schema.get("uniqueItems"):
            require(len({json.dumps(i, sort_keys=True) for i in value}) == len(value), f"{location}: duplicate item")
        if "items" in schema:
            for i, item in enumerate(value):
                _schema_check(item, schema["items"], root, f"{location}[{i}]")
    if isinstance(value, str):
        require(len(value) >= schema.get("minLength", 0), f"{location}: short string")
        if "pattern" in schema:
            require(re.search(schema["pattern"], value) is not None, f"{location}: pattern mismatch")
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if "minimum" in schema:
            require(value >= schema["minimum"], f"{location}: below minimum")
        if "maximum" in schema:
            require(value <= schema["maximum"], f"{location}: above maximum")
    def matches(branch):
        try:
            _schema_check(value, branch, root, location)
            return True
        except ValidationError:
            return False
    if "allOf" in schema:
        for branch in schema["allOf"]:
            _schema_check(value, branch, root, location)
    if "anyOf" in schema:
        require(any(matches(b) for b in schema["anyOf"]), f"{location}: no anyOf match")
    if "oneOf" in schema:
        require(sum(matches(b) for b in schema["oneOf"]) == 1, f"{location}: expected exactly one match")
    if "not" in schema:
        require(not matches(schema["not"]), f"{location}: forbidden shape")
    if "if" in schema:
        branch = schema.get("then") if matches(schema["if"]) else schema.get("else")
        if branch is not None:
            _schema_check(value, branch, root, location)


def validate_schema(value, filename):
    schema = load_json(BASE / "schemas" / filename)
    if jsonschema is not None:
        try:
            jsonschema.Draft202012Validator.check_schema(schema)
            jsonschema.Draft202012Validator(schema).validate(value)
        except jsonschema.exceptions.SchemaError as exc:
            raise ValidationError(f"invalid bundled schema: {exc.message}") from exc
        except jsonschema.exceptions.ValidationError as exc:
            raise ValidationError(f"JSON Schema validation: {exc.message}") from exc
    else:
        _schema_check(value, schema, schema)


def check_timestamp(value):
    require(isinstance(value, str) and re.fullmatch(
        r"[0-9]{4}(-[0-9]{2}){2}T[0-9]{2}(:[0-9]{2}){2}(\.[0-9]{1,6})?Z", value),
        "timestamp must be valid UTC (fixture subset allows <=6 fractional digits, no leap seconds)")
    try:
        datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ValidationError("invalid calendar timestamp") from exc


def verify_log(log):
    """Check the supported fixture envelope, hashes, profile context and links."""
    require(log.get("file_schema") == "urn:ietf:params:learnlog:file:contained", "only contained files supported")
    require(log.get("serialization_format") == "application/learnlog+json", "wrong serialization")
    require(isinstance(log.get("records"), list) and log["records"], "records missing")
    index = {}
    for record in log["records"]:
        require(not record.get("signed_heads"), "signed records unsupported by example validator")
        require("truncated" not in record, "truncation unsupported by example validator")
        header = record["header"]
        for key in ["record_id", "subject", "created"]:
            require(isinstance(header.get(key), str) and header[key], f"header missing {key}")
        require(header.get("hash_alg") == "sha-256", "only SHA-256 supported")
        check_timestamp(header["created"])
        context = header.get("ai_context")
        validate_schema(context, "ai-context-v0.1.0.schema.json")
        require(context["policy"]["phase"] == context["phase"], "policy phase mismatch")
        require(context["policy"]["scope"]["activity_id"] == context["activity"]["id"], "policy task scope mismatch")
        rh = hash_value(header)
        key = (header["record_id"], rh)
        require(key not in index, "duplicate record identity/hash")
        schemas = record.get("event_schemas", [])
        require(ASSIST_SCHEMA in schemas, "assist event schema hint missing")
        require(EVENT_SCHEMA in schemas, "illustrative custom event schema URI missing")
        require("urn:ietf:params:learnlog:events:example_learning" not in schemas,
                "unregistered custom namespace must not use IETF URN")
        require(isinstance(record.get("entries"), list) and record["entries"], "entries missing")
        previous = rh
        entries_by_seq = {}
        for expected_seq, entry in enumerate(record["entries"], 1):
            require(set(entry) == {"seq", "time", "event", "event_hash", "prev_hash", "entry_hash"},
                    "only full, unredacted fixture entries supported")
            require(entry["seq"] == expected_seq and not isinstance(entry["seq"], bool), "invalid entry order")
            check_timestamp(entry["time"])
            event = entry["event"]
            validate_schema(event, "example-event-v0.1.0.schema.json")
            require(entry["event_hash"] == hash_value(event), "event hash mismatch")
            require(entry["prev_hash"] == previous, "previous link mismatch")
            hashed = {k: entry[k] for k in ["seq", "time", "event_hash", "prev_hash"]}
            hashed["record_hash"] = rh
            require(entry["entry_hash"] == hash_value(hashed), "entry hash mismatch")
            previous = entry["entry_hash"]
            require(event["activity"]["id"] == context["activity"]["id"], "activity mismatch")
            require(event["activity"]["version"] == context["activity"]["version"], "activity version mismatch")
            ec = event["ai_context"]
            require(ec["context_id"] == context["context_id"], "event context reference mismatch")
            require(ec["stage"] == context["phase"], "event stage mismatch")
            require(ec["policy_id"] == context["policy"]["id"], "event policy reference mismatch")
            if event["actor"]["kind"] == "software":
                require(event["instrument"]["source"] in {"deterministic", "model"}, "software instrument mismatch")
                if event["instrument"]["source"] == "model":
                    require(event["instrument"].get("model") and event["instrument"].get("config_hash"),
                            "model provenance missing")
            if event["name"] == "assist:scaffold_provided":
                request = event["data"].get("request")
                if request is not None:
                    require(request < entry["seq"] and request in entries_by_seq, "request reference is not earlier")
                    target = entries_by_seq[request]["event"]
                    require(target["name"] == "assist:help_requested", "request must identify help request in fixture profile")
                    require(target["activity"] == event["activity"] and target["session"] == event["session"],
                            "request activity/session mismatch")
            entries_by_seq[entry["seq"]] = entry
        boundary = context["observation"]["scope"]
        require(1 <= boundary["first_seq"] <= boundary["last_seq"] <= max(entries_by_seq),
                "observation scope outside record bounds")
        require(all(entries_by_seq[i]["event"]["session"] == boundary["session"]
                    for i in range(boundary["first_seq"], boundary["last_seq"] + 1)),
                "observation scope session mismatch")
        index[key] = {"record": record, "context": context, "entries": entries_by_seq}
    return index


def _resolve_evidence(ref, index):
    key = (ref["record_id"], ref["record_hash"])
    require(key in index, "evidence record/hash does not resolve")
    item = index[key]
    if ref["kind"] == "entry":
        require(ref["seq"] in item["entries"], "evidence seq does not resolve")
        require(item["entries"][ref["seq"]]["entry_hash"] == ref["entry_hash"], "evidence entry hash mismatch")
    else:
        require(ref["context_id"] == item["context"]["context_id"], "evidence context does not resolve")
        require(ref["path"].startswith("/ai_context/"), "context evidence must name extension member")
        value = item["record"]["header"]
        try:
            for part in ref["path"][1:].split("/"):
                value = value[part.replace("~1", "/").replace("~0", "~")]
        except (KeyError, TypeError) as exc:
            raise ValidationError("context evidence path does not resolve") from exc
    return item


def verify_assessment(report, index):
    validate_schema(report, "condition-assessment-v0.1.0.schema.json")
    ids = [a["condition_id"] for a in report["assessments"]]
    require(sorted(ids) == list(CONDITION_IDS), "every C01-C16 must occur exactly once")
    for assessment in report["assessments"]:
        expected_assertion = "difference_from_comparator" if assessment["condition_id"] in CHANGED_CONDITIONS else "occurrence"
        require(assessment["assertion"] == expected_assertion, "assertion must match condition registry")
        scope = assessment["scope"]
        key = (scope["record_id"], scope["record_hash"])
        require(key in index, "scope record/hash does not resolve")
        item = index[key]
        context = item["context"]
        require(scope["activity_id"] == context["activity"]["id"], "scope activity mismatch")
        require(scope["first_seq"] <= scope["last_seq"], "reversed scope")
        require(1 <= scope["first_seq"] <= scope["last_seq"] <= max(item["entries"]),
                "scope exceeds available entry bounds")
        scoped_entries = [item["entries"].get(i) for i in range(scope["first_seq"], scope["last_seq"] + 1)]
        require(all(scoped_entries), "scope includes unavailable entries")
        require(all(e["event"]["session"] == scope["session"] for e in scoped_entries), "scope session mismatch")
        if assessment["review_status"] == "unreviewed":
            continue
        coverage = assessment["review_coverage"]
        reviewed = coverage["reviewed_seq"]
        require(all(scope["first_seq"] <= i <= scope["last_seq"] for i in reviewed), "review seq outside scope")
        for ref in assessment["evidence"]:
            _resolve_evidence(ref, index)
            if ref["kind"] == "entry" and (ref["record_id"], ref["record_hash"]) == key:
                require(scope["first_seq"] <= ref["seq"] <= scope["last_seq"], "local event evidence outside assessment scope")
        for ref in coverage["coverage_evidence"]:
            _resolve_evidence(ref, index)
        result = assessment["result"]
        for gap in assessment["unresolved_information"] + coverage["limitations"]:
            if gap["reason"] == "not_reported_after_review":
                require(gap.get("source_ref") and gap.get("reviewed_material"),
                        "not_reported_after_review needs located, actually reviewed material")
        if assessment["assertion"] == "difference_from_comparator" and result in {"supported_present", "supported_absent"}:
            comparator = assessment.get("comparator")
            require(comparator and comparator.get("definition") and comparator.get("source"), "changed-condition conclusion requires defined comparator")
        if result == "indeterminate":
            require(assessment.get("unresolved_information"), "indeterminate requires an information-gap reason")
        if result in {"supported_present", "supported_absent"}:
            require(assessment["evidence"], "supported conclusion requires evidence")
        if result == "supported_absent":
            require(scope["domain"] == "producer_activity_only", "outside assistance absence cannot be established by producer-only record")
            require(context["observation"]["capture_status"] == "declared_complete_within_scope", "absence requires declared bounded capture coverage")
            require(set(reviewed) == set(range(scope["first_seq"], scope["last_seq"] + 1)), "absence requires full available scope review")
            require("absence_basis" in assessment, "absence requires positive coverage/content basis")
            require(coverage["reviewed_content"] == "full_available_events", "absence requires full content review")
            require(coverage["coverage_evidence"], "absence needs supporting coverage evidence")
            boundary = context["observation"]["scope"]
            require(boundary["first_seq"] <= scope["first_seq"] <= scope["last_seq"] <= boundary["last_seq"]
                    and scope["session"] == boundary["session"], "absence outside declared capture boundary")
            if assessment["condition_id"] in {"C01", "C02"}:
                for e in scoped_entries:
                    if e["event"]["name"] == "assist:scaffold_provided":
                        require(isinstance(e["event"]["data"].get("content"), str),
                                "answer/explanation absence requires reviewed assistance text")
        if assessment["condition_id"] == "C16" and result == "supported_present":
            require(any(g["reason"] == "outside_observation" for g in assessment.get("unresolved_information", [])),
                    "C16 must distinguish exposure gap from actual external AI use")
    return {"assessment_count": len(ids), "reviewed_count": sum(a["review_status"] == "reviewed" for a in report["assessments"])}


def verify(log, report):
    index = verify_log(log)
    result = verify_assessment(report, index)
    result.update({"profile": PROFILE_ID, "version": VERSION, "record_count": len(index),
                   "integrity": "hash_consistent_unsigned", "authenticity": "not_established",
                   "canonicalizer": "rfc8785" if rfc8785 else "restricted_ascii_safe_integer_subset",
                   "schema_validator": "jsonschema_2020_12" if jsonschema else "bundled_schema_keyword_subset",
                   "conformance": "supported_profile_fixture_checks_only"})
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path)
    parser.add_argument("assessment", type=Path)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(verify(load_json(args.log), load_json(args.assessment)), indent=2))
    except (ValidationError, KeyError, TypeError) as exc:
        print(f"INVALID: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
