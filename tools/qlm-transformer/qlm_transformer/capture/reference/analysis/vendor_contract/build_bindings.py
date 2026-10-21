"""Build draft profile and complete synthetic-source carrier demonstrations.

Host timestamps record this execution, not the illustrative source event time.
Reserved example.org identifiers are unpublished draft/local software names.
"""
from copy import deepcopy
from datetime import datetime, timezone
import json
from pathlib import Path

from build_examples import example
from carrier_bindings import (PROFILE, PROFILE_VERSION, TEMPLATE, ACTIVITY_TYPE,
    IMPORT, CREATE, CALIPER_CONTEXT, KEY, BINDING_VERSION, xapi_statement,
    caliper_event, caliper_envelope)
from validate_contract import SCHEMA

ROOT = Path(__file__).parent
IMPORTER_ID = "https://example.org/learnlog/unpublished-local-tools/build-bindings"
SENSOR_ID = "https://example.org/learnlog/unpublished-local-tools/build-bindings/sensor"
ACCOUNT_HOMEPAGE = "https://example.org/learnlog/synthetic-account-system"
ACCOUNT_NAME = "synthetic-assistance-importer"


def draft7_schema(value):
    """Exact keyword translation for this schema's common draft7/2020 subset."""
    if isinstance(value, list):
        return [draft7_schema(item) for item in value]
    if isinstance(value, dict):
        return {("definitions" if key == "$defs" else key):
                (child.replace("#/$defs/", "#/definitions/") if key == "$ref" else draft7_schema(child))
                for key, child in value.items()}
    return value


def profile(created_at):
    capture_schema = draft7_schema(deepcopy(SCHEMA))
    capture_schema["$schema"] = "http://json-schema.org/draft-07/schema#"
    metadata_schema = {"$schema": "http://json-schema.org/draft-07/schema#", "type": "object",
        "properties": {"binding_version": {"const": BINDING_VERSION}, "mode": {"const": "importer_created_observation"},
            "importer_id": {"type": "string", "format": "uri"}, "created_at": {"type": "string", "format": "date-time"},
            "capture_sha256": {"type": "string", "pattern": "^[a-f0-9]{64}$"},
            "importer_account": {"type": "object", "properties": {"homePage": {"type": "string", "format": "uri", "pattern": "^https?://[^/\\s]+"}, "name": {"type": "string", "minLength": 1}}, "required": ["homePage", "name"], "additionalProperties": False},
            "source_record_id": {"type": "object", "properties": {"scope": {"type": "string", "format": "uri"}, "local_id": {"type": "string", "minLength": 1}},
                "required": ["scope", "local_id"], "additionalProperties": False}},
        "required": ["binding_version", "mode", "importer_id", "created_at", "capture_sha256", "source_record_id"], "additionalProperties": False}
    common = {"inScheme": PROFILE_VERSION}
    return {"@context": "https://w3id.org/xapi/profiles/context", "id": PROFILE, "type": "Profile",
        "conformsTo": "https://w3id.org/xapi/profiles#1.0",
        "prefLabel": {"en": "Learnlog assistance capture profile (unpublished draft)"},
        "definition": {"en": "An unpublished draft assistance capture agreement carried in xAPI. This binding records importer software creating an assistance-observation record. The host statement is not a learner assistance event. Preserve the full contract, source uncertainty and importer metadata; apply the accompanying bounded consistency validator. No interoperability or certification claim."},
        "author": {"type": "Organization", "name": "Quantum Learning Machines", "url": "https://quantumlearningmachines.com"},
        "versions": [{"id": PROFILE_VERSION, "generatedAtTime": created_at}],
        "concepts": [
            {"id": ACTIVITY_TYPE, "type": "ActivityType", **common, "prefLabel": {"en": "Assistance capture observation record"},
                "definition": {"en": "A digital record that preserves a source-bounded assistance lifecycle observation, capture declarations, typed unavailable information and mapping provenance. It is not the underlying hint, learner, task or observed learning event."}},
            {"id": KEY, "type": "ContextExtension", **common, "prefLabel": {"en": "Assistance capture agreement"},
                "definition": {"en": "The complete assistance-capture0.1.0-draft payload, without flattening unknown states. A syntactically valid assertion does not authenticate evidence or establish capture completeness. Additional consistency validation is required."},
                "inlineSchema": json.dumps(capture_schema, separators=(",", ":"))},
            {"id": IMPORT, "type": "ContextExtension", **common, "prefLabel": {"en": "Importer-created observation metadata"},
                "definition": {"en": "Binding metadata that identifies the importer software and actual creation time of the new observation record, links its source scoped identity and checks payload agreement using an implementation-defined JSON digest. This is not source-event time or authenticated provenance."},
                "inlineSchema": json.dumps(metadata_schema, separators=(",", ":"))}],
        "templates": [{"id": TEMPLATE, "type": "StatementTemplate", **common,
            "prefLabel": {"en": "Importer created an assistance observation record"},
            "definition": {"en": "The importer software account creates a digital observation record at the caller-supplied importer creation time. Neither actor nor timestamp asserts a learner action. Reuses ActivityStreams create, rather than minting a synonymous assistance verb. Available scoped subject information and source-time knowledge remain in the capture payload; absent source identity is not inferred. Full profile rules include inline schemas and bounded consistency checks."},
            "objectActivityType": ACTIVITY_TYPE,
            "rules": [
                {"location": "$.verb.id", "presence": "included", "any": [CREATE]},
                {"location": "$.actor.objectType", "presence": "included", "any": ["Agent"]},
                {"location": "$.actor.account.homePage", "presence": "included"},
                {"location": "$.actor.account.name", "presence": "included"},
                {"location": "$.timestamp", "presence": "included"},
                {"location": "$.context.contextActivities.category[*].id", "presence": "included", "any": [PROFILE_VERSION]},
                {"location": "$.context.extensions['" + KEY + "']", "presence": "included"},
                {"location": "$.context.extensions['" + IMPORT + "']", "presence": "included"},
                {"location": "$.context.extensions['" + IMPORT + "'].importer_account", "presence": "included"},
                {"location": "$.context.extensions['" + IMPORT + "'].mode", "presence": "included", "any": ["importer_created_observation"]}]}]}


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False, allow_nan=False) + "\n")


def carrier_example(stage):
    capture = example(stage)
    if stage == "generated":
        scope = "urn:learnlog:synthetic:binding-source:generated:unknown-time"
        capture["record_id"]["scope"] = scope
        capture["source"]["source_id"] = scope
        capture["capture"]["instrument_id"] = scope + ":instrument"
        capture["provenance"]["native_record_reference"] = scope + ":raw"
        capture["evidence"][0]["reference"] = scope + ":raw"
        capture["evidence"][0]["description"] = "SYNTHETIC source declaration in SYNTHETIC_carrier_source_declarations.json: label=hint, emitted_stage=generated; source event timestamp deliberately unavailable. No real product or learner."
        capture["assistance"]["event_time"] = {key: {"state": "unknown", "reason": "This distinct synthetic carrier source deliberately supplies no native event clock; importer creation time is not a replacement.", "evidence_refs": []} for key in ["original", "utc", "clock_basis"]}
    return capture


def main():
    generated_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    target = ROOT / "examples" / "carriers"
    target.mkdir(parents=True, exist_ok=True)
    current_profile = profile(generated_at)
    write(ROOT / "learnlog-xapi-profile.json", current_profile)
    for concept in current_profile["concepts"]:
        if "inlineSchema" in concept:
            name = "assistance-capture.draft7.schema.json" if concept["id"] == KEY else "importer-observation.schema.json"
            write(ROOT / name, json.loads(concept["inlineSchema"]))
    demonstration = {"provenance": {"generated_at": generated_at,
        "source_status": "SYNTHETIC fixtures; no real learner or product observations",
        "host_semantics": "Actual execution of build_bindings.py creating records of synthetic-source observations; host actor is this importer software, host time is this execution, not historical source time.",
        "importer_id": IMPORTER_ID, "sensor_id": SENSOR_ID,
        "identifier_status": "example.org identifiers are reserved unpublished draft identifiers; no hosted registry is claimed",
        "profile_ids": {"xapi": PROFILE_VERSION, "xapi_template": TEMPLATE, "caliper": "GeneralProfile", "caliper_context": CALIPER_CONTEXT},
        "certification": "Not performed; local checks and separately documented upstream validator checks do not establish receiver interoperability."}, "examples": {}}
    for stage in ["requested", "generated", "displayed"]:
        capture = carrier_example(stage)
        statement = xapi_statement(capture, IMPORTER_ID, generated_at, account_homepage=ACCOUNT_HOMEPAGE, account_name=ACCOUNT_NAME)
        event = caliper_event(capture, IMPORTER_ID, generated_at)
        envelope = caliper_envelope([event], SENSOR_ID, generated_at)
        demonstration["examples"][stage] = {"assistance_capture": capture, "xapi_statement": statement, "caliper_event": event, "caliper_envelope": envelope}
        for name, value in [("xapi_statement", statement), ("caliper_event", event), ("caliper_envelope", envelope)]:
            write(target / f"SYNTHETIC_{stage}_{name}.json", value)
    write(target / "demo-bindings.json", demonstration)
    write(target / "SYNTHETIC_carrier_source_declarations.json", {"status": "Explicitly synthetic declarations, not real product records", "records": [{"source_id": carrier_example(stage)["source"]["source_id"], "label": "hint", "emitted_stage": stage, **({"timestamp": "2026-01-01T12:00:00Z"} if stage != "generated" else {})} for stage in ["requested", "generated", "displayed"]]})
    print(f"Built 1 draft xAPI profile and 9 complete synthetic-source carrier fixtures at {generated_at}")


if __name__ == "__main__":
    main()
