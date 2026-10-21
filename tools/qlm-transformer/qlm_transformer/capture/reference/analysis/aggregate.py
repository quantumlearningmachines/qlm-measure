#!/usr/bin/env python3
"""Reproducible release-observation aggregation; no population or efficacy claim.

Native rows stay in caller-supplied private caches. Only aggregate counts and
checksums are written to public outputs. JSON embedded in HTML is parsed, never
executed. Full carrier records describe the importer creating an observation,
not a learner acting at the importer's current time.
"""
from __future__ import annotations

import argparse
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import importlib
import json
from pathlib import Path
import random
import re
import sys
import zipfile

STAGES = ("requested", "generated", "transmitted", "displayed", "accepted")
METRIC_ID = "recorded_help_request_observations"
# Reference-package assignment in QLM software account namespace; not authentication.
XAPI_ACCOUNT_HOMEPAGE = "https://quantumlearningmachines.com/"
XAPI_ACCOUNT_NAME = "qlm-transformer-recorded-request-aggregation-v1"
ZENODO_SHA = "5527127f0a3c939601b17ef207ef8b34df7cad9159c9617f879efbf4e989d499"
TUTORTRACE_SHA = "09972201c16a9f6def7d1e25a9b9e6827994601d720a37696afb0927168befc8"
TUTORTRACE_COMMIT = "bc7990370da18a611a122255ebc3e475bd8a3fc6"


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def sha_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def check_pin(path, expected):
    actual = sha_file(path)
    if actual != expected:
        raise ValueError("Source bytes differ from pinned release: " + str(path))
    return actual


def unknown(reason):
    return {"state": "unknown", "reason": reason, "evidence_refs": []}


def unreviewed(reason):
    return {"state": "not_reviewed", "reason": reason, "evidence_refs": []}


def observed(value, reason, refs=("native",)):
    return {"state": "observed", "value": value, "reason": reason, "evidence_refs": list(refs)}


def normalize_time(value):
    """Never turn source offsets, missing clocks or timezone-free strings into UTC."""
    if value is None:
        return unknown("The selected native record supplies no source timestamp."), unknown("Native clock has no reviewed absolute time."), unknown("Native clock basis is unresolved.")
    original = observed(value, "Exact native timestamp value; not importer creation time.")
    try:
        validator, _ = load_contract(Path(__file__).parent / "vendor_contract")
        if not validator.timestamp(value):
            raise ValueError("Source time is outside the supported RFC3339 subset")
        parsed = datetime.fromisoformat(value.upper().replace("Z", "+00:00"))
        result = parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")
    except (ValueError, AttributeError, TypeError):
        return original, unknown("Native time does not establish an absolute timezone-bearing instant."), unknown("Native clock basis is unresolved.")
    return original, observed(result, "Parsed the native timestamp's explicit UTC offset; no timezone was guessed."), observed("native_explicit_offset", "Native timestamp contains an explicit timezone offset.")


def source_config(source_id):
    configurations = {
        "zenodo.17551130": {
            "source_id": "zenodo.17551130", "scope": "urn:learnlog:release:zenodo:17551130:v1", "label": "JetBrains Academy next-step hint study",
            "source_url": "https://zenodo.org/records/17551130", "documentation_url": "https://arxiv.org/html/2511.06362v1",
            "release": "Zenodo 17551130 v1 / ai_hints_interaction.zip", "license": "CC-BY-4.0", "commercial_demo_eligible": True,
            "commercial_demo_scope": "Aggregate factual outputs only; learner content and event-level records excluded",
            "native_unit": "Native Log observations embedded in the released scenario HTML reports",
            "mapping_basis": "Native Log labels 'Hint button is clicked' and 'Hint retry is clicked' record learner Get Hint/Retry requests; system 'Code hint requested' is excluded.",
            "request_rule": "type == 'Log' and description in {'Hint button is clicked', 'Hint retry is clicked'}",
            "identity_basis": "pinned archive SHA-256 + member path + zero-based eventsData ordinal; this is a release-occurrence locator, not an authoritative learner/request ID",
            "excluded": "Other native Log events, system generation requests, code reveal clicks, IDE context, source-omitted activity and outside-product help",
        },
        "tutortrace.deployment8": {
            "source_id": "tutortrace.deployment8", "scope": "urn:learnlog:release:tutortrace:" + TUTORTRACE_COMMIT + ":deployment8", "label": "TutorTrace / IDETrace deployment 8",
            "source_url": "https://github.com/divadbaroon/TutorTrace_dataset_and_benchmark/tree/" + TUTORTRACE_COMMIT,
            "documentation_url": "https://vizpi.org/dataset", "release": TUTORTRACE_COMMIT + " / dataset/raw_telemetry/deployment_8.json",
            "license": "CC-BY-4.0 declared for dataset including raw telemetry", "commercial_demo_eligible": True,
            "commercial_demo_scope": "Aggregate factual outputs only; learner content and event-level records excluded",
            "native_unit": "One raw telemetry event with type CHAT_QUERY",
            "mapping_basis": "The author README describes raw AI queries/responses and gives CHAT_QUERY as a chat query; the pinned author prepare_data.py includes CHAT_QUERY in QUERY_TYPES. Treat it as a submitted learner assistance query, not typing, generation or display.",
            "request_rule": "type == 'CHAT_QUERY' in the events arrays of the pinned deployment-8 JSON object",
            "identity_basis": "pinned file SHA-256 + top-level source record key + zero-based events ordinal; this is a private release-occurrence locator, not an authoritative learner/request ID",
            "excluded": "CHAT_TYPE typing, CHAT_RESPONSE, IDE context, other deployments, source-omitted activity and outside-product help",
            "metadata_caveat": "Pinned Croissant declares CC-BY-4.0 for a dataset distribution including raw telemetry. Population descriptions conflict, so no verified learner-count claim is made. Commercial-demo eligibility is limited here to aggregate factual outputs. Research opt-in remains a data-access safeguard; no new ethics determination is implied.",
        },
    }
    return deepcopy(configurations[source_id])


def native_observation(config, member, ordinal, native, subtype, timestamp):
    local_id = digest([member, ordinal])
    return {"config": config, "member": member, "ordinal": ordinal, "native": native,
            "native_sha256": digest(native), "local_id": local_id,
            "subtype": subtype, "timestamp": timestamp}


def zenodo_requests(path):
    config = source_config("zenodo.17551130")
    config["input_sha256"] = check_pin(path, ZENODO_SHA)
    config["scope"] += ":sha256:" + config["input_sha256"]
    observations, native_counts = [], Counter()
    total_events = 0
    with zipfile.ZipFile(path) as archive:
        files = sorted(name for name in archive.namelist() if name.startswith("hints_dataset/") and name.endswith(".html"))
        for member in files:
            text = archive.read(member).decode("utf-8")
            match = re.search(r"\bconst\s+eventsData\s*=\s*", text)
            if not match:
                raise ValueError("Source report has no eventsData JSON assignment")
            events, _ = json.JSONDecoder().raw_decode(text[match.end():])
            if not isinstance(events, list):
                raise ValueError("Native eventsData is not a JSON array")
            for ordinal, native in enumerate(events):
                total_events += 1
                if native.get("type") == "Log":
                    native_counts[native.get("description")] += 1
                    if native.get("description") in {"Hint button is clicked", "Hint retry is clicked"}:
                        observations.append(native_observation(config, member, ordinal, native, native["description"], native.get("timestamp")))
    return config, observations, {"native_input_count": total_events, "native_assistance_log_count": sum(native_counts.values()), "native_log_label_counts": dict(sorted(native_counts.items())), "source_file_count": len(files)}


def tutortrace_requests(path):
    config = source_config("tutortrace.deployment8")
    config["input_sha256"] = check_pin(path, TUTORTRACE_SHA)
    config["scope"] += ":sha256:" + config["input_sha256"]
    rows = json.loads(Path(path).read_bytes())
    if not isinstance(rows, dict):
        raise ValueError("Pinned TutorTrace deployment must be a top-level object")
    result, event_counts, total = [], Counter(), 0
    for source_key, body in sorted(rows.items()):
        events = body.get("events")
        if not isinstance(events, list):
            raise ValueError("Pinned TutorTrace source record lacks an events array")
        for ordinal, native in enumerate(events):
            total += 1
            event_counts[native.get("type")] += 1
            if native.get("type") == "CHAT_QUERY":
                # Source key never enters public outputs; it only distinguishes
                # private release positions before the locator is hashed.
                member = "dataset/raw_telemetry/deployment_8.json#source-record:" + source_key
                result.append(native_observation(config, member, ordinal, native, "CHAT_QUERY", native.get("timestamp")))
    return config, result, {"native_input_count": total, "source_file_count": 1, "native_event_label_counts": dict(sorted(event_counts.items())), "metadata_caveat": config["metadata_caveat"]}


def make_capture(observation):
    c = observation["config"]
    ref = c["scope"] + ":native-location:" + observation["local_id"]
    original, utc, clock = normalize_time(observation["timestamp"])
    scope_note = "Bounded review covers the selected native record only; documentation outside that record is not asserted absent."
    return {
        "schema_version": "0.1.0-draft", "record_kind": "assistance_event_observation",
        "record_id": {"scope": c["scope"], "local_id": observation["local_id"]},
        "source": {"source_id": c["source_url"], "product_version": unknown("Exact product version is not established by this mapping."), "model_version": unknown("Exact AI model version is not established by this mapping."), "source_revision": observed(c["input_sha256"], "SHA-256 of the selected source-release bytes.", ("release",))},
        "assistance": {"label": observation["subtype"], "lifecycle": observed("requested", c["mapping_basis"], ("native", "mapping")), "event_time": {"original": original, "utc": utc, "clock_basis": clock}},
        "capture": {"instrument_id": "urn:learnlog:qlm-release-reader:" + c["source_id"] + ":v1", "capabilities": {stage: unknown("The release reader does not establish the source product's live instrumentation capability.") for stage in STAGES}, "boundary": {"systems": [c["label"] + " selected published release; adapter observation only"], "event_classes": ["requested"], "exclusions": [c["excluded"]]}, "window": {"start": unknown("Source capture start is not established; first released event is not treated as capture start."), "end": unknown("Source capture end is not established; last released event is not treated as capture end.")}, "coverage": unknown("The selected release does not establish complete capture of real-world assistance requests.")},
        "context": {"activity_reference": unreviewed("No activity-level reference is extracted for this request-count analysis."), "phase": unreviewed("No record-level assessment/practice classification was reviewed."), "permission": unreviewed("No record-level policy determination was reviewed.")},
        "provenance": {"native_record_reference": ref, "mapping_reference": "urn:learnlog:aggregate-adapter:" + c["source_id"] + ":v1", "mapping_review": unreviewed("Agent-authored mapping with agent audit; independent human mapping review is pending.")},
        "evidence": [{"evidence_id": "native", "kind": "native_record", "reference": ref, "description": "Private native record at the pinned release location; native-payload SHA-256=" + observation["native_sha256"] + ". " + scope_note}, {"evidence_id": "release", "kind": "source_documentation", "reference": c["source_url"], "description": "Pinned source input SHA-256=" + c["input_sha256"]}, {"evidence_id": "mapping", "kind": "source_documentation", "reference": "urn:learnlog:aggregate-adapter:" + c["source_id"] + ":v1", "description": "QLM candidate adapter documentation: " + c["request_rule"]}],
        "derived_labels": [],
    }


class RequestAggregator:
    """Set aggregation over release-occurrence identities, independent of batch order.

    Equal-looking native records at DIFFERENT release positions remain different
    observations. Only replay of the SAME scoped position is deduplicated.
    """
    def __init__(self, validate_record=None):
        self.records = {}
        if validate_record is None:
            validator, _ = load_contract(Path(__file__).parent / "vendor_contract")
            validate_record = validator.validate
        self.validate_record = validate_record

    def add(self, record):
        self.validate_record(record)
        key = (record["record_id"]["scope"], record["record_id"]["local_id"])
        encoded = canonical(record)
        if key in self.records and self.records[key] != encoded:
            raise ValueError("Conflicting payload for the same source-scoped release-occurrence identity")
        self.records[key] = encoded

    def extend(self, records):
        for record in records:
            self.add(record)
        return self

    def result(self):
        by_source, labels = Counter(), {}
        for encoded in self.records.values():
            record = json.loads(encoded)
            stage = record["assistance"]["lifecycle"]
            # Completeness is irrelevant to the narrower RELEASE-observation
            # numerator; unknown stages cannot enter this metric.
            if stage.get("state") != "observed" or stage.get("value") != "requested":
                continue
            scope = record["record_id"]["scope"]
            by_source[scope] += 1
            labels.setdefault(scope, Counter())[record["assistance"]["label"]] += 1
        return {"assistance_request_observations": sum(by_source.values()), "by_source_scope": dict(sorted(by_source.items())), "by_source_subtype": {key: dict(sorted(value.items())) for key, value in sorted(labels.items())}}


def load_contract(contract_dir):
    location = str(Path(contract_dir).resolve())
    if location not in sys.path:
        sys.path.insert(0, location)
    return importlib.import_module("validate_contract"), importlib.import_module("carrier_bindings")


def source_public(config, native_info, captures):
    counts = Counter(record["assistance"]["label"] for record in captures)
    return {key: config[key] for key in ["source_id", "scope", "label", "source_url", "documentation_url", "release", "license", "commercial_demo_eligible", "commercial_demo_scope", "input_sha256", "native_unit", "mapping_basis", "request_rule", "identity_basis"]} | native_info | {
        "assistance_request_observations": len(captures), "help_request_subtypes": [{"label": key, "count": value} for key, value in sorted(counts.items())],
        "capture_coverage": {"state": "unknown", "reason": "Released observations are countable; complete real-world capture is not established."},
        "model_version": {"state": "unknown", "reason": "This mapping does not establish exact AI model versions."},
        "metric_eligibility": [
            {"metric_id": METRIC_ID, "eligible": True, "reason": "Native row plus documented candidate mapping supports a recorded learner help-request observation within this release."},
            {"metric_id": "actual_request_total", "eligible": False, "reason": "Unknown source capture completeness and release-selection mechanisms."},
            {"metric_id": "request_rate", "eligible": False, "reason": "No comparable exposure denominator is established."},
            {"metric_id": "request_to_display_rate", "eligible": False, "reason": "No authoritative cross-stage request-response links are established."},
            {"metric_id": "learning_effect", "eligible": False, "reason": "A descriptive assistance-log count is not an educational outcome or causal estimate."},
        ]}


def run(args):
    if getattr(args, "tutortrace_json", None) and not args.allow_tutortrace_research:
        raise ValueError("Explicit --allow-tutortrace-research is required before reading learner telemetry; this package distributes aggregate factual outputs only")
    validator, bindings = load_contract(args.contract_dir)
    created_at = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    importer_id = "urn:learnlog:qlm-transformer:recorded-request-aggregation:v1"
    loaded = []
    for name, adapter in [("zenodo_archive", zenodo_requests), ("tutortrace_json", tutortrace_requests)]:
        path = getattr(args, name, None)
        if path:
            loaded.append(adapter(path))
    if not loaded:
        raise ValueError("Supply at least one actual source path")
    output = Path(args.output_dir)
    output.mkdir(parents=True, exist_ok=True)
    private = Path(args.private_dir)
    private.mkdir(parents=True, exist_ok=True)
    all_captures, recovered_xapi, recovered_caliper, source_summaries = [], [], [], []
    counts = Counter()
    with (private / "capture.private.jsonl").open("w") as captures_out, (private / "xapi.private.jsonl").open("w") as xapi_out, (private / "caliper.private.jsonl").open("w") as caliper_out:
        for config, observations, native_info in loaded:
            captures = []
            for observation in observations:
                capture = make_capture(observation)
                validator.validate(capture)
                xapi = bindings.xapi_statement(capture, importer_id, created_at, account_homepage=XAPI_ACCOUNT_HOMEPAGE, account_name=XAPI_ACCOUNT_NAME)
                caliper = bindings.caliper_event(capture, importer_id, created_at)
                xrecover, crecover = bindings.extract_xapi(xapi), bindings.extract_caliper(caliper)
                if capture != xrecover or capture != crecover:
                    raise AssertionError("Carrier roundtrip changed the capture profile")
                captures_out.write(canonical(capture) + "\n")
                xapi_out.write(canonical(xapi) + "\n")
                caliper_out.write(canonical(caliper) + "\n")
                captures.append(capture)
                recovered_xapi.append(xrecover)
                recovered_caliper.append(crecover)
                counts["contract_validations"] += 1
                counts["xapi_roundtrips"] += 1
                counts["caliper_roundtrips"] += 1
            all_captures.extend(captures)
            source_summaries.append(source_public(config, native_info, captures))
    canonical_result = RequestAggregator().extend(all_captures).result()
    if RequestAggregator().extend(recovered_xapi).result() != canonical_result or RequestAggregator().extend(recovered_caliper).result() != canonical_result:
        raise AssertionError("Carrier-recovered aggregate differs from native-profile aggregate")
    shuffled = deepcopy(all_captures)
    random.Random(20261018).shuffle(shuffled)
    batch_result = RequestAggregator()
    for start in range(0, len(shuffled), 137):
        batch_result.extend(shuffled[start:start+137])
    if batch_result.result() != canonical_result:
        raise AssertionError("Aggregation changed with order or batch boundaries")
    replay_result = RequestAggregator().extend(all_captures).extend(all_captures).result()
    if replay_result != canonical_result:
        raise AssertionError("Replayed source records were counted twice")
    conflicts_rejected = False
    if all_captures:
        altered = deepcopy(all_captures[0])
        altered["assistance"]["label"] += " conflicting modification"
        try:
            RequestAggregator().extend([all_captures[0], altered])
        except ValueError:
            conflicts_rejected = True
        if not conflicts_rejected:
            raise AssertionError("Conflicting duplicate was accepted")
    total, cumulative = 0, []
    for source in source_summaries:
        total += source["assistance_request_observations"]
        cumulative.append({"source_id": source["source_id"], "added_count": source["assistance_request_observations"], "cumulative_count": total})
    native_direct_count = sum(len(observations) for _, observations, _ in loaded)
    if native_direct_count != total or total != canonical_result["assistance_request_observations"]:
        raise AssertionError("Source-filter and transformed aggregate counts differ")
    verification = {"capture_profile_records": len(all_captures), "contract_validations": counts["contract_validations"], "xapi_roundtrips": counts["xapi_roundtrips"], "caliper_roundtrips": counts["caliper_roundtrips"], "direct_native_baseline_matches": True, "native_filter_count": native_direct_count, "carrier_aggregates_identical": True, "order_and_batch_invariant": True, "replay_idempotent": True, "conflicting_duplicate_rejected": conflicts_rejected, "unknown_coverage_preserved": all(record["capture"]["coverage"]["state"] == "unknown" for record in all_captures), "independent_human_mapping_review": False, "live_lrs_interoperability_test": False, "caliper_certification_test": False, "private_row_artifacts_in_public_output": False}
    public = {"schema_version": "1.0.0", "analysis_id": "recorded-assistance-requests-20261018", "executed_utc": created_at, "distribution_scope": "research_aggregate_facts_only_no_raw_redistribution", "metric": {"id": METRIC_ID, "label": "Recorded learner help-request observations", "unit": "Source-native request-record occurrences in the selected published releases", "common_definition": "A released source row records a learner asking the in-product assistance system for help; original request subtype and source remain separate strata.", "arithmetic_claim": "Counts of eligible recorded observations are summed across disjoint source-release namespaces. This does not establish equivalence of pedagogy, request opportunities, intensity, capture coverage or populations."}, "sources": source_summaries, "aggregate": {"source_count": len(source_summaries), "assistance_request_observations": total, "actual_request_total": None, "unique_cross_source_learners": None, "request_rate": None, "request_to_display_rate": None, "learning_effect": None}, "cumulative": cumulative, "pipeline_verification": verification, "limitations": ["Candidate mappings are agent-authored and agent-audited; independent human mapping review remains pending.", "The numerator describes selected public-release records, not all real-world requests or distinct real actions.", "Identical content at different release positions remains separate; replay of the same pinned release position is deduplicated.", "Release-selection mechanisms and capture completeness are unknown. Native event-time extrema are not source capture windows.", "Importer creation timestamps and actors describe software record creation; no learner action time or actor is fabricated.", "No learner-row, prompt or source-code payload is included in this aggregate JSON.", "No causal effect, cross-product efficacy, measurement superiority, unique cross-source learners or adoption by named vendors is shown."]}
    (output / "aggregate.public.json").write_text(json.dumps(public, indent=2, ensure_ascii=False) + "\n")
    (output / "verification.public.json").write_text(json.dumps(verification, indent=2) + "\n")
    return public


def cli():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract-dir", type=Path, default=Path(__file__).parent / "vendor_contract")
    parser.add_argument("--zenodo-archive", type=Path)
    parser.add_argument("--tutortrace-json", type=Path)
    parser.add_argument("--allow-tutortrace-research", action="store_true")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--private-dir", type=Path, required=True)
    args = parser.parse_args()
    result = run(args)
    print(json.dumps({"source_count": result["aggregate"]["source_count"], "request_observations": result["aggregate"]["assistance_request_observations"], "pipeline_verification": result["pipeline_verification"]}, indent=2))


if __name__ == "__main__":
    cli()
