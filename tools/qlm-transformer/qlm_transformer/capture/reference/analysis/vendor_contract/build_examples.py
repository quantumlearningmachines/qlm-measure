"""Explicitly synthetic fixtures, never real product or learner records."""
import json
from pathlib import Path

ROOT = Path(__file__).parent
STAGES = ["requested", "generated", "transmitted", "displayed", "accepted"]


def missing(state, reason):
    item = {"state": state, "reason": reason, "evidence_refs": ["native"] if state in ["not_collected", "not_reported", "not_applicable"] else []}
    if state == "not_reported":
        item["review_scope"] = {"searched_evidence_refs": ["native"], "search_description": "Entire synthetic fixture declaration examined; no claim about material outside this fixture."}
    if state == "not_collected":
        item["capture_basis"] = "Synthetic fixture definition explicitly omits this instrumentation hook."
    return item


def observed(value, reason, evidence="native"):
    return {"state": "observed", "value": value, "reason": reason, "evidence_refs": [evidence]}


def example(stage):
    uri = f"urn:learnlog:synthetic:{stage}"
    return {
        "schema_version": "0.1.0-draft", "record_kind": "assistance_event_observation",
        "record_id": {"scope": uri, "local_id": "event-1"},
        "source": {"source_id": uri, "product_version": observed("synthetic-v1", "Fixture declares this version."), "model_version": missing("not_reported", "Fixture does not specify an AI model."), "source_revision": observed("1", "Fixture revision.")},
        "assistance": {"label": "hint", "lifecycle": observed(stage, f"Synthetic instrumentation explicitly emits {stage}; label alone is insufficient."), "event_time": {"original": observed("2026-01-01T12:00:00Z", "Synthetic source clock."), "utc": observed("2026-01-01T12:00:00Z", "Fixture uses UTC."), "clock_basis": observed("declared_utc", "Synthetic clock convention.")}},
        "capture": {"instrument_id": uri + ":instrument", "capabilities": {name: observed(True, "Synthetic instrument test exercises this hook.") if name == stage else missing("not_collected", "Fixture does not instrument this stage.") for name in STAGES}, "boundary": {"systems": ["SYNTHETIC fixture only"], "event_classes": [stage], "exclusions": ["Other lifecycle stages, external tools and learner cognition are outside capture."]}, "window": {"start": observed("2026-01-01T12:00:00Z", "Synthetic observation start."), "end": observed("2026-01-01T12:01:00Z", "Synthetic observation end.")}, "coverage": observed("partial", "Fixture does not establish complete capture.")},
        "context": {"activity_reference": missing("not_reported", "No task content is included."), "phase": missing("not_reported", "Fixture does not specify phase."), "permission": missing("not_reviewed", "Fixture includes no reviewed assistance policy.")},
        "provenance": {"native_record_reference": uri + ":raw", "mapping_reference": "urn:learnlog:synthetic:literal-stage-mapping:v1", "mapping_review": missing("not_reviewed", "Synthetic candidate mapping has no independent review.")},
        "evidence": [{"evidence_id": "native", "kind": "synthetic_fixture", "reference": uri + ":raw", "description": f"SYNTHETIC raw record: label='hint', emitted_stage='{stage}'; fixture assertions are not observations of a real product."}],
        "derived_labels": [],
    }


if __name__ == "__main__":
    for stage in ["requested", "generated", "displayed"]:
        (ROOT / "examples" / f"SYNTHETIC_hint_{stage}.json").write_text(json.dumps(example(stage), indent=2) + "\n")
    raw = {"status": "SYNTHETIC illustrative fixtures, not research data", "records": [{"source": stage, "label": "hint", "emitted_stage": stage, "event_id": "event-1", "timestamp": "2026-01-01T12:00:00Z"} for stage in ["requested", "generated", "displayed"]]}
    (ROOT / "examples" / "SYNTHETIC_raw_records.json").write_text(json.dumps(raw, indent=2) + "\n")
