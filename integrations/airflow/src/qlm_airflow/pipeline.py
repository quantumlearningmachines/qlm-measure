"""Bounded local-file pipeline; only artifact paths/counts belong in XCom.

Calls the unmodified QLM-transformer writer and verifier, not a substitute engine.
There are no network calls, database writes, or automatic vendor integrations.
"""
from __future__ import annotations

import argparse
import base64
import csv
import fcntl
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
from contextlib import contextmanager

from qlm_transformer import __contained_writer_version__ as TRANSFORMER_VERSION
from qlm_transformer.core import digest, timestamp, verify
from .research_adapters import ADAPTER_VERSION, SOURCES, adapt, expected_subjects, source_status, verify_import_document
from .scaffolding import measure_scaffolding, create_scaffolding_csv
from .semantics import mapping_contract, pooling_compatibility
from .ledger import ingest

PIPELINE_VERSION = "0.5.0rc1"
SCAFFOLDING_EVIDENCE_SHA256 = "5de6ad86ef9c44afb8eff772f878e18dba8704d5cacaaa7f73ff05c3a5d831da"
MAX_BYTES = 2_000_000
MAX_ROWS = 5_000
SAFE_ID = re.compile(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}\Z")


def _json(text):
    def members(pairs):
        value = {}
        for key, item in pairs:
            if key in value:
                raise ValueError("duplicate JSON member")
            value[key] = item
        return value
    def nonfinite(_):
        raise ValueError("non-finite JSON numbers are not supported")
    return json.loads(text, object_pairs_hook=members, parse_constant=nonfinite)


def _identifier(value, label):
    if not isinstance(value, str) or not SAFE_ID.fullmatch(value):
        raise ValueError(label + " must be a bounded filename-safe identifier")
    return value


def _inside(root, name):
    if not isinstance(name, str) or not name or "://" in name or Path(name).is_absolute():
        raise ValueError("configured file paths must be relative to the pipeline root")
    candidate = (root / name).resolve()
    if not candidate.is_relative_to(root):
        raise ValueError("configured path escapes the pipeline root")
    return candidate


def _output(root, name):
    candidate = _inside(root, name)
    if not candidate.is_relative_to(root / "outputs"):
        raise ValueError("output path must remain in the outputs directory")
    return candidate


def _artifact_file(root, folder, name):
    return _output(root, str((folder / name).relative_to(root)))


def _read(path):
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("input exceeds the 2 MB local demonstration limit")
    return path.read_bytes()


def load_manifest(root, manifest="config/demo.json"):
    root = Path(root).resolve(strict=True)
    manifest_path = _inside(root, manifest)
    config = _json(_read(manifest_path).decode("utf-8-sig"))
    if not isinstance(config, dict) or config.get("schema") != "qlm-airflow-manifest-0.2":
        raise ValueError("unsupported pipeline manifest")
    for name in ("tenant", "key_id"):
        if not isinstance(config.get(name), str) or not config[name].strip():
            raise ValueError(name + " is required")
    timestamp(config.get("imported_at"))
    datasets = config.get("datasets")
    if not isinstance(datasets, list) or not 1 <= len(datasets) <= 5:
        raise ValueError("configure one to five explicitly supported datasets")
    cumulative = config.get("cumulative")
    if cumulative is not None:
        if not isinstance(cumulative, dict) or set(cumulative) != {"ledger_id", "batch_id"}:
            raise ValueError("cumulative requires only ledger_id and immutable batch_id")
        for field in ("ledger_id", "batch_id"):
            _identifier(cumulative.get(field), field)
    ids, sources = set(), set()
    for dataset in datasets:
        if not isinstance(dataset, dict):
            raise ValueError("each dataset must be an object")
        identity = _identifier(dataset.get("id"), "dataset id")
        if identity == "combined":
            raise ValueError("dataset id combined is reserved for aggregate artifacts")
        if identity in ids:
            raise ValueError("duplicate dataset id")
        ids.add(identity)
        if dataset.get("platform") not in SOURCES:
            raise ValueError("unsupported platform")
        for name in ("input", "profile"):
            candidate = _inside(root, dataset.get(name))
            if candidate.is_relative_to(root / "outputs"):
                raise ValueError("input and profile files must be outside outputs")
            if name == "input":
                if candidate in sources:
                    raise ValueError("datasets must not alias the same input export")
                sources.add(candidate)
        if not isinstance(dataset.get("metric_notes"), dict):
            raise ValueError("metric_notes must describe the original metric scales")
        if any(not isinstance(k, str) or not isinstance(v, str) or not v.strip()
               for k, v in dataset["metric_notes"].items()):
            raise ValueError("metric notes must map metric names to nonempty text")
    return root, config


def parse_rows(raw, suffix):
    text = raw.decode("utf-8-sig")
    if suffix.lower() == ".csv":
        reader = csv.reader(io.StringIO(text, newline=""), strict=True)
        headers = next(reader, None)
        if not headers or any(not h.strip() for h in headers) or len(set(headers)) != len(headers):
            raise ValueError("CSV needs unique nonempty headers")
        rows = []
        for values in reader:
            if not values:
                continue
            if len(values) != len(headers):
                raise ValueError("CSV row width differs from its header")
            rows.append(dict(zip(headers, values)))
    elif suffix.lower() == ".json":
        rows = _json(text)
    elif suffix.lower() in (".jsonl", ".ndjson"):
        rows = [_json(line) for line in text.splitlines() if line.strip()]
    else:
        raise ValueError("use .csv, .json, .jsonl or .ndjson inputs")
    if not isinstance(rows, list) or not 1 <= len(rows) <= MAX_ROWS or any(not isinstance(r, dict) for r in rows):
        raise ValueError("input must contain 1–5000 object rows")
    # Apply the writer's canonical JSON domain checks before output creation.
    digest(rows)
    return rows


def read_key(provider=None):
    """Resolve only inside a task/CLI process; never return this value to XCom."""
    encoded = os.environ.get("QLM_PSEUDONYM_KEY_B64")
    if encoded is None and provider is not None:
        encoded = provider()
    if not isinstance(encoded, str):
        raise ValueError("configure QLM_PSEUDONYM_KEY_B64 or the documented Airflow secret variable")
    try:
        key = base64.b64decode(encoded, validate=True)
    except Exception:
        raise ValueError("pseudonym secret must be valid standard base64") from None
    if len(key) < 32:
        raise ValueError("pseudonym secret must decode to at least 32 bytes")
    return key


@contextmanager
def _lock(root, run_id, artifact):
    # POSIX advisory locks coordinate retries on the shared local filesystem.
    folder = _output(root, "outputs/.locks")
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    target = _output(root, "outputs/.locks/" + run_id + "_" + artifact + ".lock")
    with target.open("a", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def _write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n", encoding="utf-8")


def _run_folder(root, run_id):
    _identifier(run_id, "run id")
    if run_id == "cumulative":
        raise ValueError("run id cumulative is reserved for durable ledger storage")
    path = _output(root, "outputs/" + run_id)
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    return path


def plan(root, manifest="config/demo.json"):
    _, config = load_manifest(root, manifest)
    return [dataset["id"] for dataset in config["datasets"]]


def transform_dataset(root, manifest, run_id, dataset_id, key_provider=None):
    root, config = load_manifest(root, manifest)
    run = _run_folder(root, run_id)
    _identifier(dataset_id, "dataset id")
    datasets = [d for d in config["datasets"] if d["id"] == dataset_id]
    if len(datasets) != 1:
        raise ValueError("dataset is not present in the manifest")
    dataset = datasets[0]
    source_path = _inside(root, dataset["input"])
    raw = _read(source_path)
    rows = parse_rows(raw, source_path.suffix)
    profile = _json(_read(_inside(root, dataset["profile"])).decode("utf-8-sig"))
    if not isinstance(profile, dict) or profile.get("id") != dataset["platform"]:
        raise ValueError("research profile platform mismatch")
    key = read_key(key_provider)
    status = source_status(raw, profile)
    binding = {"pipeline_version": PIPELINE_VERSION, "adapter_version": ADAPTER_VERSION,
               "upstream_writer_version": TRANSFORMER_VERSION, "manifest_sha256": digest(config),
               "source_sha256": hashlib.sha256(raw).hexdigest(), "profile_sha256": digest(profile),
               "mapping_sha256": digest(profile["mapping"]), "dataset_id": dataset_id,
               "source_platform": dataset["platform"], "source_kind": status["sourceKind"], "key_id": config["key_id"],
               "pseudonym_key_fingerprint": hmac.new(key, b"qlm-cumulative-namespace-v1", hashlib.sha256).hexdigest()}
    final = _output(root, "outputs/" + run_id + "/" + dataset_id)
    with _lock(root, run_id, dataset_id):
        if final.exists():
            stored = _json(_read(_artifact_file(root, final, "metadata.json")).decode("utf-8"))
            if stored["binding"] != binding:
                raise ValueError("run id already contains different inputs/configuration; use a new run id")
            document = _json(_artifact_file(root, final, "learnlog.json").read_text(encoding="utf-8"))
            checkpoint = _json(_artifact_file(root, final, "checkpoint.json").read_text(encoding="utf-8"))
            verify_import_document(document, checkpoint)
            expected = expected_subjects(rows, profile, config["tenant"], key)
            if expected != [record["header"]["subject"] for record in document["records"]]:
                raise ValueError("cached pseudonyms differ; use a new run id after changing the secret")
        else:
            document, status = adapt(rows, raw, profile, key, config["tenant"], config["imported_at"])
            checkpoint = verify_import_document(document)
            metadata = {"binding": binding, "input_row_count": len(rows),
                        "observation_count": sum(len(record["entries"]) for record in document["records"]),
                        "record_count": len(document["records"]), "record_unit": profile["mapping"]["source_unit"],
                        "source_status": status, "metric_notes": dataset["metric_notes"],
                        "semantic_mapping": mapping_contract(dataset["platform"]),
                        "interpretation": "Observation units and assistance lifecycle states remain distinct; no pooled score or efficacy claim."}
            temporary = Path(tempfile.mkdtemp(prefix=".dataset-", dir=run))
            try:
                _write_json(temporary / "learnlog.json", document)
                _write_json(temporary / "checkpoint.json", checkpoint)
                _write_json(temporary / "metadata.json", metadata)
                os.replace(temporary, final)
            finally:
                if temporary.exists():
                    shutil.rmtree(temporary)
    return {"dataset_id": dataset_id, "artifact_dir": str(final), "input_row_count": len(rows),
            "observation_count": sum(len(record["entries"]) for record in document["records"]),
            "record_count": len(document["records"])}


def _csv_cell(value):
    text = str(value)
    return "'" + text if text.startswith(("=", "+", "-", "@", "\t", "\r")) else text


def _measurement_evidence(root):
    raw = _read(_inside(root, "provenance/scaffolding-evidence.json"))
    if hashlib.sha256(raw).hexdigest() != SCAFFOLDING_EVIDENCE_SHA256:
        raise ValueError("this release requires its exact pinned published annotation companion")
    evidence = _json(raw.decode("utf-8-sig"))
    excerpts = {}
    for source, name in (("ground_truth.jsonl", "tutormoments-real-ground-truth.jsonl"),
                         ("annotations.jsonl", "tutormoments-real-human-annotations.jsonl")):
        original = _read(_inside(root, "provenance/" + name))
        actual = hashlib.sha256(original).hexdigest()
        if actual != evidence["sources"][source]["sample_sha256"]:
            raise ValueError("published annotation excerpt hash mismatch")
        excerpts[name] = actual
    return evidence, {"evidence_sha256": hashlib.sha256(raw).hexdigest(), "source_excerpts_sha256": excerpts}


def aggregate(root, manifest, run_id, artifacts):
    root, config = load_manifest(root, manifest)
    run = _run_folder(root, run_id)
    expected = {dataset["id"]: dataset for dataset in config["datasets"]}
    if not isinstance(artifacts, list) or len(artifacts) != len(expected):
        raise ValueError("aggregate requires one verified artifact per configured dataset")
    provided = [artifact.get("dataset_id") for artifact in artifacts if isinstance(artifact, dict)]
    if len(provided) != len(expected) or set(provided) != set(expected):
        raise ValueError("aggregate dataset set differs from the manifest")
    observations, datasets, metric_rows, coverage_rows, bindings, measurement_runs, contracts, cumulative_events = [], [], [], [], [], [], [], []
    measurement_evidence, evidence_binding = _measurement_evidence(root)
    assistance_counts = {}
    assigned_conditions = {}
    for dataset_id, dataset in expected.items():
        folder = _output(root, "outputs/" + run_id + "/" + dataset_id)
        metadata = _json(_artifact_file(root, folder, "metadata.json").read_text(encoding="utf-8"))
        binding = metadata["binding"]
        if binding["manifest_sha256"] != digest(config):
            raise ValueError("artifact manifest binding differs")
        if binding.get("dataset_id") != dataset_id or binding.get("source_platform") != dataset["platform"]:
            raise ValueError("artifact dataset identity differs from the manifest")
        profile = _json(_read(_inside(root, dataset["profile"])).decode("utf-8-sig"))
        if digest(profile) != binding["profile_sha256"]:
            raise ValueError("profile changed between conversion and aggregation")
        if hashlib.sha256(_read(_inside(root, dataset["input"]))).hexdigest() != binding["source_sha256"]:
            raise ValueError("input changed between conversion and aggregation")
        document = _json(_artifact_file(root, folder, "learnlog.json").read_text(encoding="utf-8"))
        verify_import_document(document, _json(_artifact_file(root, folder, "checkpoint.json").read_text(encoding="utf-8")))
        if any(record["header"]["source_platform"] != dataset["platform"] or
               record["header"]["source_sha256"] != binding["source_sha256"] or
               record["header"]["mapping_sha256"] != binding["mapping_sha256"] for record in document["records"]):
            raise ValueError("document provenance differs from its dataset binding")
        bindings.append(binding)
        contract = mapping_contract(dataset["platform"])
        contexts = [entry["event"]["data"]["assistance_context"] for record in document["records"] for entry in record["entries"]]
        first_context = contexts[0] if contexts else None
        source_namespaces = {record["header"].get("source_namespace") for record in document["records"]}
        source_stratum = next(iter(source_namespaces)) if dataset["platform"] == "explicit-assistance-events" and len(source_namespaces) == 1 else dataset["platform"]
        contracts.append({"source_id": source_stratum, "source_kind": binding["source_kind"], "mapping": contract,
                          "context": first_context, "context_consistent": all(item == first_context for item in contexts)})
        measurement_runs.append({"profile": profile, "sourceKind": binding["source_kind"],
                                 "sourceVerified": binding["source_kind"] == "verified_public_sample",
                                 "sourceHash": binding["source_sha256"], "document": document,
                                 "records": document["records"]})
        current = []
        local_counts = {}
        for record in document["records"]:
            for entry in record["entries"]:
                event = entry["event"]
                data = event["data"]
                if event["name"] not in ("qlm_import:dialogue_turn_observed", "qlm_import:participant_summary_observed", "qlm_import:assistance_lifecycle_observed", "qlm_import:transcript_utterance_observed"):
                    raise ValueError("unsupported research observation semantics")
                assistance = data["assistance"]
                if assistance not in ("tutor_utterance_recorded", "student_utterance_recorded", "assigned_condition_only", "help_requested", "help_generated", "help_transmitted", "help_displayed", "learner_response_observed", "utterance_recorded_no_help_stage"):
                    raise ValueError("unsupported assistance evidence label")
                local_counts[assistance] = local_counts.get(assistance, 0) + 1
                assistance_counts[assistance] = assistance_counts.get(assistance, 0) + 1
                if "help_evidence" in data:
                    condition = data["help_evidence"]["condition"]
                    assigned_conditions[condition] = assigned_conditions.get(condition, 0) + 1
                row = {"dataset_id": dataset_id, "source_platform": dataset["platform"],
                       "source_kind": binding["source_kind"], "record_unit": metadata["record_unit"],
                       "subject_id": record["header"]["subject"], "subject_scope": "tenant_and_source; not cross-source learner linkage",
                       "record_id": record["header"]["record_id"], "seq": entry["seq"],
                       "activity_id": event.get("activity", {}).get("id"), "event_name": event["name"],
                       "imported_at": entry["time"], "time_basis": data["time_basis"], "entry_hash": entry["entry_hash"],
                       "provenance": data["provenance"], "reported_metrics": data["reported_metrics"],
                       "missing_metrics": data["missing_metrics"], "metric_notes": metadata["metric_notes"],
                       "assistance": assistance, "raw_source_fields": data["raw_source_fields"],
                       "assistance_context": data["assistance_context"], "original_source_timestamp": data["original_source_timestamp"],
                       **{name: data[name] for name in ("dialogue", "source_time_basis", "help_evidence", "lifecycle", "utterance", "inferred_annotations", "assistance_stages") if name in data}}
                current.append(row)
                if "lifecycle" in data:
                    lifecycle = data["lifecycle"]
                    cumulative_events.append({"native_identity": {"platform": dataset["platform"], "source_id": lifecycle["source_id"], "event_id": lifecycle["event_id"]},
                                              "source_revision": lifecycle["source_revision"],
                                              "source_payload": {"scoped_subject": record["header"]["subject"], "activity_id": event["activity"]["id"],
                                                                 "lifecycle": lifecycle, "assistance_context": data["assistance_context"],
                                                                 "source_record_sha256": data["provenance"]["source_record_sha256"],
                                                                 "mapping_sha256": binding["mapping_sha256"],
                                                                 "source_kind": binding["source_kind"],
                                                                 "semantic_profile_binding": record["header"]["semantic_profile_binding"]}})
                for metric, value in data["reported_metrics"].items():
                    metric_rows.append([dataset_id, dataset["platform"], metadata["record_unit"],
                                        data["provenance"]["source_row"], data["provenance"].get("source_file_row", ""),
                                        metric, json.dumps(value, ensure_ascii=False, allow_nan=False),
                                        dataset["metric_notes"].get(metric, "Original source measure; scale not established")])
        observations.extend(current)
        datasets.append({"dataset_id": dataset_id, "source_platform": dataset["platform"],
                         "source_kind": binding["source_kind"], "input_rows": metadata["input_row_count"],
                         "observations": len(current), "records": len(document["records"]),
                         "record_unit": metadata["record_unit"], "evidence_counts": local_counts,
                         "semantic_mapping": contract})
        for metric in profile["mapping"].get("metrics", {}):
            present = sum(metric in row["reported_metrics"] for row in current)
            coverage_rows.append([dataset_id, dataset["platform"], metadata["record_unit"], metric,
                                  len(current), present, len(current) - present, dataset["metric_notes"].get(metric, "Unknown")])
    coverage = {"schema": "qlm-research-source-coverage-0.2", "observations": len(observations),
                "datasets": datasets, "evidence_counts": assistance_counts, "assigned_condition_counts": assigned_conditions,
                "independent_performance_established": False, "pooled_score": None,
                "external_ai_use": "not_established", "cross_source_learner_linkage": "not_performed",
                "limits": ["Observation totals combine source units for transport only; they are not learner counts.",
                           "Learnlog entry times are import times; transcript source offsets remain relative seconds.",
                           "Tutor utterances are not automatically classified as hints or effective scaffolding.",
                           "Assigned OATutor conditions do not establish actual hint delivery/use or absence of outside AI.",
                           "Original metric values are preserved; there is no pooled score or causal comparison."]}
    if any(dataset["platform"] == "sandpiper" for dataset in expected.values()):
        coverage["limits"].append("Sandpiper annotation codes are inferred assertions by a named annotator, not help events; every assistance stage is not recorded for that source, and its start/end times stay unparsed strings.")
    scaffolding = measure_scaffolding(measurement_runs, measurement_evidence)
    compatibility = pooling_compatibility(contracts)
    context_coverage = {}
    for row in observations:
        for field, value in row["assistance_context"].items():
            key = "unknown" if value is None else str(value)
            counts = context_coverage.setdefault(field, {})
            counts[key] = counts.get(key, 0) + 1
    coverage["context_coverage"] = context_coverage
    coverage["pooling_compatibility"] = compatibility
    cumulative_receipt = None
    if config.get("cumulative") is not None:
        if not cumulative_events:
            raise ValueError("cumulative ingestion needs explicit native event identities and revisions; research row positions are not substitutes")
        fingerprints = {item["pseudonym_key_fingerprint"] for item in bindings}
        if len(fingerprints) != 1:
            raise ValueError("cumulative inputs must share one stable pseudonym namespace")
        setting = config["cumulative"]
        folder = _output(root, "outputs/cumulative/" + setting["ledger_id"])
        namespace = {"tenant": config["tenant"], "key_id": config["key_id"], "pseudonym_key_fingerprint": next(iter(fingerprints)),
                     "identity_scope": "adapter + source_id + native event_id; no cross-source learner linkage"}
        cumulative_receipt = ingest(folder, setting["batch_id"], namespace, cumulative_events)
        cumulative_receipt["excluded_observations_without_native_event_identity"] = len(observations) - len(cumulative_events)
    final = _output(root, "outputs/" + run_id + "/combined")
    with _lock(root, run_id, "combined"):
        payloads = {"observations.jsonl": "".join(json.dumps(row, ensure_ascii=False, allow_nan=False) + "\n" for row in observations),
                    "coverage.json": json.dumps(coverage, ensure_ascii=False, indent=2) + "\n",
                    "pooling_compatibility.json": json.dumps(compatibility, ensure_ascii=False, indent=2) + "\n",
                    "scaffolding_measurement.json": json.dumps(scaffolding, ensure_ascii=False, allow_nan=False, indent=2) + "\n",
                    "scaffolding_intervals.csv": create_scaffolding_csv(scaffolding)}
        if cumulative_receipt is not None:
            payloads["cumulative_ingestion.json"] = json.dumps(cumulative_receipt, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
        for name, headers, values in (
            ("original_metrics.csv", ["dataset_id", "source_platform", "record_unit", "input_row", "original_source_line", "original_metric", "original_value_json", "original_scale_notes"], metric_rows),
            ("metric_coverage.csv", ["dataset_id", "source_platform", "record_unit", "original_metric", "observations", "reported", "missing", "original_scale_notes"], coverage_rows),
            ("scaffolding_matrix.csv", ["source_coded_need", "source_coded_action", "deduplicated_intervals"],
             [[cell["need"], cell["action"], cell["count"]] for cell in scaffolding["matrix"]])):
            stream = io.StringIO(newline="")
            writer = csv.writer(stream)
            writer.writerow(headers)
            writer.writerows([[_csv_cell(value) for value in row] for row in values])
            payloads[name] = stream.getvalue()
        payloads["COMPLETE.json"] = json.dumps({"manifest_sha256": digest(config), "bindings": bindings,
                                               "scaffolding_evidence": evidence_binding,
                                               "files_sha256": {name: hashlib.sha256(text.encode()).hexdigest() for name, text in payloads.items()}}, indent=2) + "\n"
        if final.exists():
            if any(_artifact_file(root, final, name).read_bytes() != content.encode("utf-8") for name, content in payloads.items()):
                raise ValueError("existing combined output differs; use a new run id")
        else:
            temporary = Path(tempfile.mkdtemp(prefix=".combined-", dir=run))
            try:
                for name, content in payloads.items():
                    with (temporary / name).open("w", encoding="utf-8", newline="") as output:
                        output.write(content)
                os.replace(temporary, final)
            finally:
                if temporary.exists():
                    shutil.rmtree(temporary)
    return {"output_dir": str(final), "datasets": len(datasets), "observations": len(observations),
            "records": sum(dataset["records"] for dataset in datasets), "record_count_is_not_unique_people": True}


def run(root, manifest="config/demo.json", run_id="demo"):
    artifacts = [transform_dataset(root, manifest, run_id, identity) for identity in plan(root, manifest)]
    return aggregate(root, manifest, run_id, artifacts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path.cwd())
    parser.add_argument("--manifest", default="config/demo.json")
    parser.add_argument("--run-id", default="demo")
    args = parser.parse_args()
    print(json.dumps(run(args.root, args.manifest, args.run_id), indent=2))


if __name__ == "__main__":
    main()
