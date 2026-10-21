"""Source-specific research adapters around the unchanged QLM writer/verifier.

The two schemas here are not claimed to be supported upstream vendor exports.
New event data is the QLM research-import extension, not standard assistance
vocabulary. Published-source provenance is attached only on an exact sample-byte
match. Source metadata is not an independent verification of underlying events.
"""
from copy import deepcopy
import hashlib
import math
import re

from qlm_transformer.core import digest, subject_id, transform, verify
from qlm_transformer.core import timestamp
from .semantics import IMPORT_SCHEMA as IMPORT_EVENT_SCHEMA, LIFECYCLE_SCHEMA, PROFILE, apply_semantic_header, normalize_context, resource, binding, mapping_contract
from jsonschema import Draft202012Validator, FormatChecker

ADAPTER_VERSION = "0.4.0-research-adapters"
IMPORT_SCHEMA = IMPORT_EVENT_SCHEMA["$id"]
SOURCES = ("tutormoments", "oatutor", "explicit-assistance-events")
TURN_FIELDS = ("turn_number", "start_seconds", "end_seconds", "role", "text")
SUMMARY_FIELDS = ("lesson", "condition", "preTest", "postTest", "sessionTime", "totalUniqueSteps", "learningGain")
SOURCE_KEYS = ("kind", "url", "downloadUrl", "revision", "license", "licenseUrl", "citation",
               "selectionNote", "limitations", "sampleSha256", "sourceSha256", "sourceRows", "summary")
PUBLIC_SOURCE_BINDINGS = resource("public-source-bindings-v1.json")


def verify_import_document(document, checkpoint=None):
    """Verify chains plus this adapter's profile/schema interpretation bindings."""
    result = verify(document, checkpoint)
    for record in document["records"]:
        header = record["header"]
        platform = header.get("source_platform")
        schema = LIFECYCLE_SCHEMA if platform == "explicit-assistance-events" else IMPORT_EVENT_SCHEMA
        if header.get("semantic_profile_binding") != binding(PROFILE) or header.get("semantic_mapping") != mapping_contract(platform):
            raise ValueError("semantic profile or mapping binding mismatch")
        if header.get("event_schema_bindings") != [binding(schema)] or record.get("event_schemas") != [schema["$id"]]:
            raise ValueError("event schema interpretation binding mismatch")
        validator = Draft202012Validator(schema, format_checker=FormatChecker())
        for entry in record["entries"]:
            event, data = entry["event"], entry["event"]["data"]
            try:
                validator.validate(event)
            except Exception as error:
                raise ValueError("source import event does not satisfy its bound schema") from error
            if normalize_context(data["assistance_context"]) != data["assistance_context"]:
                raise ValueError("assistance context is not normalized")
            provenance = data["provenance"]
            if not isinstance(provenance, dict) or provenance.get("platform") != platform or provenance.get("source_kind") != header.get("source_kind"):
                raise ValueError("event source identity differs from its record header")
            for field in ("source_sha256", "mapping_sha256"):
                if not isinstance(provenance.get(field), str) or not re.fullmatch("[0-9a-f]{64}", provenance[field]) or provenance[field] != header.get(field):
                    raise ValueError("event provenance digest differs from its record header")
            if provenance.get("source_kind") not in ("verified_public_sample", "unverified_user_input", "synthetic_fixture"):
                raise ValueError("unsupported source provenance kind")
            if timestamp(provenance.get("imported_at")) != timestamp(entry["time"]):
                raise ValueError("event imported_at differs from entry time")
            if platform == "explicit-assistance-events":
                lifecycle = data["lifecycle"]
                if data["assistance"] != lifecycle["event_type"] or data["original_source_timestamp"] != lifecycle["source_timestamp"]:
                    raise ValueError("lifecycle state or source time binding mismatch")
                if lifecycle["request_origin"] == "unsolicited" and lifecycle["request_event_id"] is not None:
                    raise ValueError("unsolicited origin conflicts with request link")
                if header.get("source_namespace") != lifecycle["source_id"] or data["provenance"].get("native_identity_sha256") != digest([platform, lifecycle["source_id"], lifecycle["event_id"]]):
                    raise ValueError("native event identity binding mismatch")
                if type(provenance.get("source_revision")) is not int or provenance["source_revision"] != lifecycle["source_revision"]:
                    raise ValueError("native event revision binding mismatch")
            elif data["original_source_timestamp"] is not None:
                raise ValueError("research source has no reported absolute event timestamp")
    return result


def _path(value, name):
    for part in name.split("."):
        if not isinstance(value, dict) or part not in value:
            raise ValueError("source is missing a required mapped field")
        value = value[part]
    return value


def source_status(raw, profile):
    pinned = PUBLIC_SOURCE_BINDINGS.get(profile.get("id"))
    matched = pinned is not None and hashlib.sha256(raw).hexdigest() == pinned["sampleSha256"] and digest(profile.get("source")) == digest(pinned)
    fixture = hashlib.sha256(raw).hexdigest() == profile.get("source", {}).get("fixtureSha256")
    if fixture:
        return {"sourceKind": "synthetic_fixture", "sourceVerified": False}
    return {"sourceKind": "verified_public_sample" if matched else "unverified_user_input",
            "sourceVerified": matched}


def _checked_profile(profile):
    if not isinstance(profile, dict) or profile.get("id") not in SOURCES:
        raise ValueError("use an explicit supported source adapter")
    mapping = profile.get("mapping")
    expected_mode = {"tutormoments": "dialogue", "oatutor": "summary", "explicit-assistance-events": "assistance_events"}[profile["id"]]
    if not isinstance(mapping, dict) or mapping.get("platform") != profile["id"] or mapping.get("mode") != expected_mode:
        raise ValueError("research profile mode/platform mismatch")
    fields = mapping.get("fields", {})
    if not all(isinstance(fields.get(name), str) and fields[name] for name in ("subject_id", "activity_id")):
        raise ValueError("explicit subject/activity source paths are required")
    return mapping


def _validate_turns(row):
    turns = row.get("turns")
    if not isinstance(turns, list) or not turns or len(turns) > 5000:
        raise ValueError("a transcript requires 1–5000 source turns")
    seen = set()
    for turn in turns:
        if not isinstance(turn, dict) or turn.get("role") not in ("Tutor", "Student") or not isinstance(turn.get("text"), str):
            raise ValueError("turns require explicit Tutor/Student attribution and text")
        number = turn.get("turn_number")
        if type(number) is not int or number < 1 or number in seen:
            raise ValueError("turn numbers must be positive and unique within a transcript")
        seen.add(number)
        start, end = turn.get("start_seconds"), turn.get("end_seconds")
        if any(type(v) not in (int, float) or not math.isfinite(v) or v < 0 for v in (start, end)) or end < start:
            raise ValueError("source offsets must be finite nonnegative seconds with end >= start")
    return turns


def expected_subjects(rows, profile, tenant, key):
    mapping = _checked_profile(profile)
    if profile["id"] == "explicit-assistance-events":
        _validate_assistance_rows(rows)
        return [subject_id(profile["id"] + ":" + row["source_id"], tenant, row["subject_id"], key) for row in rows]
    return [subject_id(profile["id"], tenant, _path(row, mapping["fields"]["subject_id"]), key) for row in rows]


def adapt(rows, raw, profile, key, tenant, imported_at):
    mapping = _checked_profile(profile)
    if profile["id"] == "explicit-assistance-events":
        return _adapt_assistance(rows, raw, profile, key, tenant, imported_at)
    platform = profile["id"]
    status = source_status(raw, profile)
    source_hash = hashlib.sha256(raw).hexdigest()
    mapping_hash = digest(mapping)
    combined = {"file_schema": "urn:ietf:params:learnlog:file:contained",
                "serialization_format": "application/learnlog+json", "records": []}
    if mapping["mode"] == "dialogue" and sum(len(_validate_turns(row)) for row in rows) > 5000:
        raise ValueError("a research import is limited to 5000 source turns")
    for row_index, row in enumerate(rows):
        raw_subject = _path(row, mapping["fields"]["subject_id"])
        activity = _path(row, mapping["fields"]["activity_id"])
        if not isinstance(activity, str) or not activity:
            raise ValueError("source activity identifier must be nonempty text")
        turns = _validate_turns(row) if mapping["mode"] == "dialogue" else [None]
        if mapping["mode"] == "summary" and row.get("condition") not in ("ChatGPT", "Human tutor", "No-hint control"):
            raise ValueError("participant summary requires a supported original assigned condition")
        # The unmodified upstream writer creates each contained record and salts.
        # Its internal summary observation is then replaced by this explicitly
        # new research-source event extension, and the chain is recalculated.
        seed_rows = [{"_subject": raw_subject, "_activity": activity} for _ in turns]
        seed_profile = {"platform": platform, "mode": "summary",
                        "fields": {"subject_id": "_subject", "activity_id": "_activity"}, "metrics": {}}
        document = transform(seed_rows, platform, seed_profile, key, tenant, imported_at, source_hash,
                             custom_platforms=SOURCES)
        record = document["records"][0]
        header = record["header"]
        header.update({"producer": {"name": "QLM-transformer research adapters", "version": ADAPTER_VERSION},
                       "upstream_writer": {"name": "QLM-transformer", "version": "0.2.1",
                                           "scope": "contained writer and verifier; source events added by research adapter"},
                       "mapping_sha256": mapping_hash, "import_mode": mapping["mode"],
                       "source_kind": status["sourceKind"],
                       "record_scope": profile.get("recordScope", mapping["source_unit"]),
                       "subject_scope": profile.get("subjectScope", "source-scoped pseudonym; no cross-source identity linkage"),
                       "assistance_coverage": ("source_dialogue_only_no_validated_help_classification" if mapping["mode"] == "dialogue" else "actual_help_use_not_reported_in_participant_table") if status["sourceVerified"] else "actual_help_use_not_established_by_this_adapter",
                       "event_order_basis": "source_turn_array_order" if mapping["mode"] == "dialogue" else "input_row_order_not_independently_verified"})
        if status["sourceVerified"]:
            header["source_provenance"] = {name: deepcopy(profile["source"][name]) for name in SOURCE_KEYS if name in profile["source"]}
        apply_semantic_header(header, platform, IMPORT_EVENT_SCHEMA)
        record["event_schemas"] = [IMPORT_SCHEMA]
        for turn_index, (entry, turn) in enumerate(zip(record["entries"], turns)):
            provenance = {"platform": platform, "source_sha256": source_hash, "source_row": row_index + 1,
                          "source_record_sha256": digest(row), "imported_at": imported_at, "mapping_sha256": mapping_hash,
                          "source_kind": status["sourceKind"]}
            if status["sourceVerified"]:
                provenance["source_file_sha256"] = profile["source"]["sourceSha256"]
                provenance["source_file_row"] = profile["source"]["sourceRows"][row_index]
            metrics = {label: _path(row, column) for label, column in mapping.get("metrics", {}).items()
                       if row.get(column) not in (None, "")}
            missing = [label for label, column in mapping.get("metrics", {}).items() if row.get(column) in (None, "")]
            data = {"provenance": provenance, "reported_metrics": metrics, "missing_metrics": missing, "time_basis": "import_time",
                    "original_source_timestamp": None, "assistance_context": normalize_context()}
            event = entry["event"]
            # This event records an importer's observation of historical data.
            # Historical speaker attribution remains in data.dialogue.role.
            event["actor"] = {"role": "system", "kind": "software", "id": "QLM-transformer"}
            if turn is not None:
                provenance["source_field_path"] = "turns[" + str(turn_index) + "]"
                original_turn = {name: deepcopy(turn[name]) for name in TURN_FIELDS}
                data.update({"dialogue": deepcopy(original_turn), "source_time_basis": "relative_offsets_seconds",
                             "assistance": "tutor_utterance_recorded" if turn["role"] == "Tutor" else "student_utterance_recorded",
                             "raw_source_fields": {"turn": deepcopy(original_turn), **{name: deepcopy(row[name]) for name in ("source", "batch", "has_video") if name in row},
                                                   "session": {name: deepcopy(row.get("session", {})[name]) for name in ("transcription_by", "primary_language", "prior_session_count") if name in row.get("session", {})}}})
                event["name"] = "qlm_import:dialogue_turn_observed"
            else:
                data.update({"assistance": "assigned_condition_only", "raw_source_fields": {name: deepcopy(row[name]) for name in SUMMARY_FIELDS if name in row},
                             "help_evidence": {"condition": row["condition"], "actual_help_use": "not_reported_in_participant_table" if status["sourceVerified"] else "not_established_by_this_adapter"}})
                event["name"] = "qlm_import:participant_summary_observed"
            event["data"] = data
        _rechain(record)
        combined["records"].append(record)
    verify(combined)
    return combined, status


def _native_text(value, label, nullable=False):
    if nullable and value is None:
        return None
    if not isinstance(value, str) or not value.strip() or len(value) > 512:
        raise ValueError(label + " must be nonempty text of at most 512 characters")
    return value


def _scoped_native_subject(row):
    # A structured namespace prevents one product's learner ID from linking to
    # another product's coincidentally equal ID.
    import json
    return json.dumps([row["source_id"], row["subject_id"]], separators=(",", ":"), ensure_ascii=False)


def _validate_assistance_rows(rows):
    seen = {}
    for row in rows:
        for field in ("source_id", "event_id", "subject_id", "activity_id"):
            _native_text(row.get(field), field)
        revision = row.get("source_revision")
        if type(revision) is not int or revision < 0:
            raise ValueError("source_revision must be a nonnegative non-boolean integer")
        if row.get("event_type") not in PROFILE["event_types"]:
            raise ValueError("unsupported explicit assistance event_type")
        for field in ("assistance_id", "request_event_id"):
            _native_text(row.get(field), field, nullable=True)
        if row.get("source_timestamp") is not None:
            if not isinstance(row["source_timestamp"], str) or not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,3})?Z", row["source_timestamp"]):
                raise ValueError("explicit source timestamps use UTC Z with at most three fractional digits; preserve other source clocks in a reviewed adapter")
            timestamp(row["source_timestamp"])
        if "content" in row and not isinstance(row["content"], str):
            raise ValueError("content must be text when supplied")
        if "context" in row and not isinstance(row["context"], dict):
            raise ValueError("source context must be an object when supplied")
        normalize_context(row.get("context", {}))
        if row.get("request_origin", "unknown") not in ("requested", "unsolicited", "unknown"):
            raise ValueError("unsupported request_origin")
        if row.get("request_origin") == "unsolicited" and row.get("request_event_id"):
            raise ValueError("unsolicited origin conflicts with a request link")
        depth = row.get("native_hint_depth")
        if depth is not None and not (isinstance(depth, str) and depth.strip()) and not (type(depth) is int and depth >= 0):
            raise ValueError("native_hint_depth must be null, text or a nonnegative integer")
        order = row.get("delivery_order")
        if order is not None and not (type(order) is int and order >= 1):
            raise ValueError("delivery_order must be null or a positive integer")
        pair = row["source_id"], row["event_id"], revision
        if pair in seen and digest(seen[pair]) != digest(row):
            raise ValueError("conflicting source event revision inside input")
        if pair in seen:
            raise ValueError("repeated source event revision inside input; reconcile batches through the ledger")
        seen[pair] = row
    if len({row["source_id"] for row in rows}) != 1:
        raise ValueError("use one source_id per input to preserve source-specific mapping review and strata")
    for row in rows:
        reference = row.get("request_event_id")
        if reference is None:
            continue
        candidates = [item for item in rows if item["source_id"] == row["source_id"] and item["event_id"] == reference]
        if candidates and any(item["event_type"] != "help_requested" or item["subject_id"] != row["subject_id"] or item["activity_id"] != row["activity_id"] for item in candidates):
            raise ValueError("request reference conflicts with source identity, learner, activity or request type")


def _adapt_assistance(rows, raw, profile, key, tenant, imported_at):
    _validate_assistance_rows(rows)
    platform = profile["id"]
    status = source_status(raw, profile)
    source_hash, mapping_hash = hashlib.sha256(raw).hexdigest(), digest(profile["mapping"])
    document = {"file_schema": "urn:ietf:params:learnlog:file:contained",
                "serialization_format": "application/learnlog+json", "records": []}
    for index, row in enumerate(rows):
        seed = {"_subject": _scoped_native_subject(row), "_activity": row["activity_id"]}
        seed_profile = {"platform": platform, "mode": "summary", "fields": {"subject_id": "_subject", "activity_id": "_activity"}, "metrics": {}}
        record = transform([seed], platform, seed_profile, key, tenant, imported_at, source_hash, custom_platforms=SOURCES)["records"][0]
        header = record["header"]
        header["subject"] = subject_id(platform + ":" + row["source_id"], tenant, row["subject_id"], key)
        header.update({"producer": {"name": "QLM-transformer research adapters", "version": ADAPTER_VERSION},
                       "upstream_writer": {"name": "QLM-transformer", "version": "0.2.1", "scope": "contained writer and verifier; explicit source events added by adapter"},
                       "mapping_sha256": mapping_hash, "import_mode": "assistance_events", "source_kind": status["sourceKind"], "source_namespace": row["source_id"],
                       "record_scope": "source_event", "subject_scope": "tenant + adapter + source_id + key; no cross-source learner linkage",
                       "assistance_coverage": "explicit_source_lifecycle_assertions_only", "event_order_basis": "input_row_order_not_independently_verified"})
        apply_semantic_header(header, platform, LIFECYCLE_SCHEMA)
        record["event_schemas"] = [LIFECYCLE_SCHEMA["$id"]]
        lifecycle = {name: deepcopy(row.get(name)) for name in ("source_id", "event_id", "source_revision", "event_type", "source_timestamp", "assistance_id", "request_event_id")}
        lifecycle.update({"request_origin": row.get("request_origin", "unknown"), "native_hint_depth": row.get("native_hint_depth"), "delivery_order": row.get("delivery_order")})
        if "content" in row:
            lifecycle["content"] = row["content"]
        context = normalize_context(row.get("context", {}))
        event = record["entries"][0]["event"]
        event.update({"name": "qlm_import:assistance_lifecycle_observed", "actor": {"role": "system", "kind": "software", "id": "QLM-transformer"},
                      "data": {"provenance": {"platform": platform, "source_sha256": source_hash, "source_row": index + 1,
                                              "source_record_sha256": digest(row), "imported_at": imported_at, "mapping_sha256": mapping_hash,
                                              "native_identity_sha256": digest([platform, row["source_id"], row["event_id"]]), "source_revision": row["source_revision"],
                                              "source_kind": status["sourceKind"]},
                               "time_basis": "import_time", "original_source_timestamp": row.get("source_timestamp"),
                               "reported_metrics": {}, "missing_metrics": [], "assistance": row["event_type"],
                               "lifecycle": lifecycle, "assistance_context": context,
                               "raw_source_fields": {**deepcopy(lifecycle), "context": deepcopy(row.get("context", {}))}}})
        _rechain(record)
        document["records"].append(record)
    verify(document)
    return document, status


def _rechain(record):
    record_hash = digest(record["header"])
    previous = record_hash
    for entry in record["entries"]:
        entry["event_hash"] = digest(entry["event"])
        entry["prev_hash"] = previous
        entry["entry_hash"] = digest({"record_hash": record_hash, **{name: entry[name] for name in ("seq", "time", "event_hash", "prev_hash")}})
        previous = entry["entry_hash"]
