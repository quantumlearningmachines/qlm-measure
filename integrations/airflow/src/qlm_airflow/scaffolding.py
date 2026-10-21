"""Pure descriptive source-label aggregation, paired with browser measurement.

Annotations remain a companion layer. This module adds no Learnlog events,
semantic classifier, learner identity linkage, or effectiveness estimate.
"""
from copy import deepcopy
import csv
import io
import json
import re

TURN_FIELDS = ("turn_number", "start_seconds", "end_seconds", "role", "text")


def _records(run):
    return run.get("records", run.get("document", {}).get("records", []))


def _projection(turn):
    return [turn.get(key) for key in TURN_FIELDS] if isinstance(turn, dict) else [None] * len(TURN_FIELDS)


def _same_projection(left, right):
    # JSON booleans are not numbers. Python's True == 1 must not weaken binding.
    for actual, expected in zip(_projection(left), _projection(right)):
        if isinstance(actual, bool) or isinstance(expected, bool):
            if type(actual) is not type(expected) or actual != expected:
                return False
        elif actual != expected:
            return False
    return True


def _matching_transcript(record, evidence):
    source = evidence["sources"]["transcripts.jsonl"]
    expected_hash = source["sample_sha256"]
    header = record.get("header", {})
    entries = record.get("entries", [])
    if not entries or header.get("source_platform") != "tutormoments" or header.get("source_kind") != "verified_public_sample" or header.get("source_sha256") != expected_hash:
        return None
    if any(not isinstance(header.get(key), str) or not header[key] for key in ("record_id", "subject")):
        return None
    transcript_id = entries[0].get("event", {}).get("activity", {}).get("id")
    transcript = next((t for t in evidence["transcripts"] if t["id"] == transcript_id), None)
    if transcript is None or len(entries) != len(transcript["turns"]):
        return None
    for index, entry in enumerate(entries):
        event = entry.get("event", {})
        data = event.get("data", {})
        provenance = data.get("provenance", {})
        dialogue = data.get("dialogue")
        original = transcript["turns"][index]
        if event.get("name") != "qlm_import:dialogue_turn_observed" or event.get("activity", {}).get("id") != transcript_id or not isinstance(dialogue, dict) or len(dialogue) != len(TURN_FIELDS) or not _same_projection(dialogue, original):
            return None
        expected = {"source_kind": "verified_public_sample", "source_sha256": expected_hash, "source_record_sha256": transcript["source_record_sha256"], "source_file_sha256": source["sha256"], "source_file_row": transcript["source_file_line_1_based"], "source_field_path": "turns[" + str(index) + "]"}
        if any(provenance.get(key) != value for key, value in expected.items()):
            return None
        raw = data.get("raw_source_fields", {})
        if not _same_projection(raw.get("turn"), original) or raw.get("source") != transcript["provider"]:
            return None
    return transcript


def measure_scaffolding(runs, evidence):
    """Accept browser-shaped runs and explicit pinned companion evidence JSON."""
    source = evidence["sources"]["transcripts.jsonl"]
    expected_hash = source["sample_sha256"]
    intervals, sessions, exclusions, seen = [], [], [], set()
    for run in runs:
        dataset = run.get("profile", {}).get("id", "unknown")
        records = _records(run)
        if dataset != "tutormoments":
            reason = "Assigned conditions and participant summaries do not report observed scaffolding dialogue or compatible coded intervals." if dataset == "oatutor" else "No compatible published companion annotations for this source."
            exclusions.append({"dataset": dataset, "records": len(records), "reason": reason})
            continue
        if run.get("sourceKind") != "verified_public_sample" or run.get("sourceVerified") is not True or run.get("sourceHash") != expected_hash:
            exclusions.append({"dataset": dataset, "records": len(records), "reason": "Input is not the exact verified public transcript excerpt; published annotations cannot be inherited by edited or unverified data."})
            continue
        for record in records:
            transcript = _matching_transcript(record, evidence)
            if transcript is None:
                exclusions.append({"dataset": dataset, "records": 1, "reason": "Transformed dialogue or source provenance does not match the pinned published transcript; annotation applicability is unmeasured."})
                continue
            if transcript["id"] in seen:
                exclusions.append({"dataset": dataset, "records": 1, "reason": "Repeated published source session omitted from coded-interval counts to prevent duplicate aggregation."})
                continue
            seen.add(transcript["id"])
            windows = [w for w in evidence["windows"] if w["transcript_id"] == transcript["id"]]
            for window in windows:
                indexes = [a["ground_truth_key_moment_index_0_based"] for a in window["annotations"]]
                intervals.append({"id": window["id"], "record_id": record["header"]["record_id"], "subject": record["header"]["subject"], "transcript_id": transcript["id"], "dataset": dataset, "provider": transcript["provider"], "turn_start": window["turn_start"], "turn_end": window["turn_end"], "need": window["need"], "action": window["action"], "annotation_rows": window["annotation_rows"], "annotations": deepcopy(window["annotations"]), "turns": [deepcopy(e["event"]["data"]["dialogue"]) for e in record["entries"] if window["turn_start"] <= e["event"]["data"]["dialogue"]["turn_number"] <= window["turn_end"]], "provenance": {"dataset_url": evidence["dataset_url"], "revision": evidence["revision"], "license": evidence["license"], "ground_truth_url": evidence["sources"]["ground_truth.jsonl"]["url"], "ground_truth_sha256": evidence["sources"]["ground_truth.jsonl"]["sha256"], "ground_truth_source_line_1_based": window["ground_truth_source_line_1_based"], "ground_truth_source_line_sha256": window["ground_truth_source_line_sha256"], "ground_truth_field_paths": ["key_moments[" + str(index) + "]" for index in indexes], "source_label_fields": {"need": "situation_label_agg", "action": "action_direction_agg"}, "human_annotation_url": evidence["sources"]["annotations.jsonl"]["url"], "human_annotation_sha256": evidence["sources"]["annotations.jsonl"]["sha256"], "source_transcript_url": source["url"], "source_transcript_sha256": source["sha256"], "source_transcript_sample_sha256": expected_hash, "source_transcript_line_1_based": transcript["source_file_line_1_based"], "label_origin": evidence["label_origin"]}})
            sessions.append({"id": transcript["id"], "record_id": record["header"]["record_id"], "subject": record["header"]["subject"], "dataset": dataset, "provider": transcript["provider"], "turns": len(record["entries"]), "intervals": len(windows), "annotation_rows": sum(w["annotation_rows"] for w in windows), "action_includes_scaffolding": {"numerator": sum(w["action"] in ("scaffolding", "both") for w in windows), "denominator": len(windows)}})
    intervals.sort(key=lambda item: item["id"])
    sessions.sort(key=lambda item: item["id"])
    cells = {}
    for interval in intervals:
        key = interval["need"], interval["action"]
        if key not in cells:
            cells[key] = {"need": key[0], "action": key[1], "count": 0}
        cells[key]["count"] += 1
    return {"measurement_profile": evidence["measurement_profile"], "status": "available" if intervals else "unmeasured", "totals": {"intervals": len(intervals), "annotation_rows": sum(i["annotation_rows"] for i in intervals), "sessions": len(sessions), "providers": len({s["provider"] for s in sessions}), "action_includes_scaffolding": {"numerator": sum(i["action"] in ("scaffolding", "both") for i in intervals), "denominator": len(intervals)}}, "matrix": [cells[key] for key in sorted(cells)], "sessions": sessions, "intervals": intervals, "exclusions": exclusions, "limitations": list(evidence["limitations"]), "provenance": {"dataset_url": evidence["dataset_url"], "revision": evidence["revision"], "license": evidence["license"], "license_url": evidence["license_url"], "attribution": evidence["attribution"], "label_origin": evidence["label_origin"], "denominator": "Distinct (transcript_id, annotation_type=scaffolding, turn_start, turn_end) exact-span keys in the published annotation companion.", "deduplication": "One interval count per exact published span; repeated annotation rows, interface passes and source sessions do not add interval counts.", "human_text_verification": deepcopy(evidence["human_text_verification"]), "sources": deepcopy(evidence["sources"])}}


def _compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _csv_guard(value):
    text = str(value) if value is not None else ""
    if re.match(r"^[\s]*[=+@\t\r]", text) or (re.match(r"^[\s]*-", text) and not re.fullmatch(r"\s*-\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\s*", text)):
        text = "'" + text
    return text


def create_scaffolding_csv(measurement):
    """One source-coded interval per row; never a person-level effectiveness file."""
    header = ["measurement_profile", "source_dataset", "provider", "source_transcript_id", "record_id", "scoped_subject", "interval_id", "turn_start", "turn_end", "published_need_label", "published_action_direction_label", "source_annotation_rows", "included_interval_denominator", "label_origin", "source_revision", "ground_truth_url", "ground_truth_source_line_1_based", "ground_truth_field_paths_json", "source_transcript_sample_sha256", "source_evidence_turns_json", "human_annotation_evidence_json", "interval_provenance_json"]
    rows = []
    for interval in measurement["intervals"]:
        item, p = interval, interval["provenance"]
        rows.append([measurement["measurement_profile"], item["dataset"], item["provider"], item["transcript_id"], item["record_id"], item["subject"], item["id"], item["turn_start"], item["turn_end"], item["need"], item["action"], item["annotation_rows"], measurement["totals"]["intervals"], p["label_origin"], p["revision"], p["ground_truth_url"], p["ground_truth_source_line_1_based"], _compact(p["ground_truth_field_paths"]), p["source_transcript_sample_sha256"], _compact(item["turns"]), _compact(item["annotations"]), _compact(p)])
    output = io.StringIO(newline="")
    writer = csv.writer(output, quoting=csv.QUOTE_ALL, lineterminator="\r\n")
    writer.writerows([[_csv_guard(value) for value in row] for row in [header, *rows]])
    return output.getvalue()
