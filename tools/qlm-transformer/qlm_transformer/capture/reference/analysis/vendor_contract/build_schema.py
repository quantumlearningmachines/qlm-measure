"""Build the proposed contract; not a change to the existing Learnlog wire format."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
STATES = ["observed", "not_collected", "not_reported", "not_reviewed", "unknown", "not_applicable"]
STAGES = ["requested", "generated", "transmitted", "displayed", "accepted"]
TEXT = {"type": "string", "minLength": 1}
URI = {**TEXT, "format": "uri", "pattern": "^[A-Za-z][A-Za-z0-9+.-]*:\\S+$"}
REFS = {"type": "array", "items": TEXT, "uniqueItems": True}


def obj(properties, required=None):
    return {"type": "object", "properties": properties, "required": list(properties) if required is None else required, "additionalProperties": False}


def known(value_schema):
    return {"allOf": [{"$ref": "#/$defs/knowledge"}, {"if": {"properties": {"state": {"const": "observed"}}}, "then": {"properties": {"value": value_schema}}}]}


knowledge = obj({"state": {"enum": STATES}, "reason": TEXT, "value": {"not": {"type": "null"}}, "evidence_refs": REFS, "review_scope": obj({"searched_evidence_refs": {**REFS, "minItems": 1}, "search_description": TEXT}), "capture_basis": TEXT}, ["state", "reason", "evidence_refs"])
knowledge["allOf"] = [{"if": {"properties": {"state": {"const": "observed"}}}, "then": {"required": ["value"], "properties": {"evidence_refs": {"minItems": 1}}}, "else": {"not": {"required": ["value"]}}}]
knowledge["allOf"].append({"if": {"properties": {"state": {"enum": ["not_collected", "not_reported", "not_applicable"]}}}, "then": {"properties": {"evidence_refs": {"minItems": 1}}}})
knowledge["allOf"].extend([
    {"if": {"properties": {"state": {"const": "not_reported"}}}, "then": {"required": ["review_scope"]}},
    {"if": {"properties": {"state": {"const": "not_collected"}}}, "then": {"required": ["capture_basis"]}},
])
scoped_id = obj({"scope": URI, "local_id": TEXT})
evidence = obj({"evidence_id": TEXT, "kind": {"enum": ["native_record", "source_documentation", "instrumentation_test", "synthetic_fixture"]}, "reference": URI, "description": TEXT})
schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "urn:learnlog:proposal:assistance-capture:0.1.0",
    "title": "Proposed Learnlog transport-neutral assistance capture contract",
    "description": "Experimental contract; syntactic validity is not evidence of truth, independent review, learning, or comparability.",
    **obj({
        "schema_version": {"const": "0.1.0-draft"},
        "record_id": {"$ref": "#/$defs/scoped_id"},
        "record_kind": {"const": "assistance_event_observation"},
        "source": obj({"source_id": URI, "product_version": known(TEXT), "model_version": known(TEXT), "source_revision": known(TEXT)}),
        "assistance": obj({"label": TEXT, "lifecycle": known({"enum": STAGES}), "event_time": obj({"original": known({"type": ["string", "number"]}), "utc": known({"type": "string", "format": "date-time"}), "clock_basis": known(TEXT)}), "assistance_id": {"$ref": "#/$defs/scoped_id"}}, ["label", "lifecycle", "event_time"]),
        "subject": {"$ref": "#/$defs/scoped_id"},
        "capture": obj({
            "instrument_id": URI,
            "capabilities": obj({stage: known({"type": "boolean"}) for stage in STAGES}),
            "boundary": obj({"systems": {"type": "array", "minItems": 1, "uniqueItems": True, "items": TEXT}, "event_classes": {"type": "array", "minItems": 1, "uniqueItems": True, "items": {"enum": STAGES}}, "exclusions": {"type": "array", "minItems": 1, "items": TEXT}}),
            "window": obj({"start": known({"type": "string", "format": "date-time"}), "end": known({"type": "string", "format": "date-time"})}),
            "coverage": known({"enum": ["complete_within_boundary", "partial"]}),
        }),
        "context": obj({"activity_reference": known(URI), "phase": known({"enum": ["practice", "assessment", "other"]}), "permission": known({"enum": ["permitted", "prohibited", "restricted"]})}),
        "provenance": obj({"native_record_reference": URI, "mapping_reference": URI, "mapping_review": known({"enum": ["author_reviewed", "independently_reviewed", "disputed"]})}),
        "evidence": {"type": "array", "minItems": 1, "items": {"$ref": "#/$defs/evidence"}},
        "derived_labels": {"type": "array", "items": obj({"label": TEXT, "value": {"not": {"type": "null"}}, "method_reference": URI, "evidence_refs": {**REFS, "minItems": 1}})},
    }, ["schema_version", "record_id", "record_kind", "source", "assistance", "capture", "context", "provenance", "evidence"]),
    "$defs": {"knowledge": knowledge, "scoped_id": scoped_id, "evidence": evidence},
}

if __name__ == "__main__":
    (ROOT / "assistance-capture.schema.json").write_text(json.dumps(schema, indent=2) + "\n")
