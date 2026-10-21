#!/usr/bin/env python3
"""Reconcile aggregate-only SQL outputs to the adjacent pipeline summary."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--aggregate-public", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sql_result = json.loads(args.results.read_text())
    pipeline = json.loads(args.aggregate_public.read_text())
    assert sql_result["query_sha256"] == sha(ROOT / "query.sql")
    direct = sql_result["representations"]["direct_capture"]["query_rows"]
    for representation in sql_result["representations"].values():
        assert representation["query_rows"] == direct
    assert set(sql_result["representations"]) == {"direct_capture", "recovered_xapi", "recovered_caliper"}
    expected_strata = sorted(
        (source["scope"], item["label"], item["count"])
        for source in pipeline["sources"] for item in source["help_request_subtypes"]
    )
    actual_strata = sorted(
        (row["scope"], row["native_label"], row["recorded_help_request_observations"])
        for row in direct if row["grouping"] == "source_native_label"
    )
    assert actual_strata == expected_strata
    total = next(row for row in direct if row["grouping"] == "total")
    assert total["recorded_help_request_observations"] == pipeline["aggregate"]["assistance_request_observations"]
    assert all(row["unknown_coverage_observations"] == row["released_observations"] for row in direct)
    assert all(row["unreviewed_mapping_observations"] == row["released_observations"] for row in direct)
    unavailable = ("actual_request_total", "request_rate", "request_to_display_rate", "learning_effect", "available_generated_observations", "available_displayed_observations")
    assert all(row[key] is None for row in direct for key in unavailable)
    # Aggregate labels and source release scopes are public strata. No native
    # payloads or scoped local occurrence identifiers belong in this artifact.
    assert not any(term in json.dumps(sql_result) for term in ("local_id", "native_record_reference", "payload_json"))
    test_run = subprocess.run([sys.executable, "-m", "unittest", "discover", "-s", str(ROOT), "-p", "test_*.py", "-v"], capture_output=True, text=True, check=True)
    test_text = test_run.stdout + test_run.stderr
    match = re.search(r"Ran (\d+) tests", test_text)
    if not match:
        raise ValueError("Unable to identify the executed test count")
    test_count = int(match.group(1))
    log = ROOT / "unit-tests.log"
    log.write_text(test_text)
    proof = {
        "query_matches_pipeline_scope_label_strata": True,
        "shared_query_identical_across_three_representations": True,
        "recorded_help_request_observations": total["recorded_help_request_observations"],
        "unknowns_and_unreviewed_mapping_status_preserved": True,
        "unsupported_actual_totals_rates_and_effects_are_null": True,
        "no_native_payload_or_scoped_local_identifier_in_result": True,
        "synthetic_unit_tests_passed": test_count,
        "files": {path.name: sha(path) for path in (ROOT / "query.sql", ROOT / "run_sql.py", ROOT / "test_sql.py", args.results, args.aggregate_public, log)},
        "limits": "Agent-run software verification; no independent human review, causal estimate or superiority claim."
    }
    args.output.write_text(json.dumps(proof, indent=2) + "\n")
    print(json.dumps({"synthetic_tests_passed": test_count, "recorded_help_request_observations": total["recorded_help_request_observations"], "checks": "PASS"}))


if __name__ == "__main__":
    main()
