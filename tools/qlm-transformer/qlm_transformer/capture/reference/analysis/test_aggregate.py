"""Synthetic boundary tests; actual-release checks live in run verification."""
from copy import deepcopy
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import json
import zipfile

import aggregate as a


def fixture(scope="urn:test:release:a", local="1", label="SYNTHETIC requested help"):
    config = a.source_config("zenodo.17551130")
    config["scope"] = scope
    config["input_sha256"] = "0" * 64
    native = {"timestamp": "2026-01-01T00:00:00Z", "type": "Log", "description": label}
    record = a.make_capture(a.native_observation(config, "SYNTHETIC.json", 0, native, label, native["timestamp"]))
    record["record_id"]["local_id"] = local
    return record


class AggregationTests(unittest.TestCase):
    def test_research_opt_in_is_checked_before_any_input_adapter_reads(self):
        args = SimpleNamespace(tutortrace_json="SYNTHETIC-not-opened.json", zenodo_archive=None,
                               allow_tutortrace_research=False, contract_dir=Path(__file__).parent / "vendor_contract")
        with patch.object(a, "tutortrace_requests") as tutortrace, patch.object(a, "zenodo_requests") as zenodo:
            tutortrace.return_value = (a.source_config("tutortrace.deployment8"), [], {})
            with self.assertRaisesRegex(ValueError, "before reading learner telemetry"):
                a.run(args)
        tutortrace.assert_not_called()
        zenodo.assert_not_called()

    def test_unknown_coverage_still_allows_release_observation_count(self):
        record = fixture()
        self.assertEqual(record["capture"]["coverage"]["state"], "unknown")
        self.assertEqual(a.RequestAggregator().extend([record]).result()["assistance_request_observations"], 1)

    def test_source_scoped_identity_prevents_false_cross_source_dedup(self):
        records = [fixture("urn:test:a", "same"), fixture("urn:test:b", "same")]
        self.assertEqual(a.RequestAggregator().extend(records).result()["assistance_request_observations"], 2)

    def test_same_content_at_different_positions_remains_two_release_observations(self):
        records = [fixture(local="1"), fixture(local="2")]
        self.assertEqual(a.RequestAggregator().extend(records).result()["assistance_request_observations"], 2)

    def test_replay_is_idempotent(self):
        record = fixture()
        self.assertEqual(a.RequestAggregator().extend([record, record, deepcopy(record)]).result()["assistance_request_observations"], 1)

    def test_conflicting_identity_is_rejected(self):
        first = fixture()
        second = deepcopy(first)
        second["assistance"]["label"] = "different source interpretation"
        with self.assertRaises(ValueError):
            a.RequestAggregator().extend([first, second])

    def test_order_and_batches_do_not_change_result(self):
        records = [fixture("urn:test:a", "1"), fixture("urn:test:b", "2"), fixture("urn:test:a", "3")]
        expected = a.RequestAggregator().extend(records).result()
        batched = a.RequestAggregator().extend(records[1:]).extend(records[:1]).extend(records)
        self.assertEqual(batched.result(), expected)

    def test_generated_is_excluded_from_request_metric(self):
        record = fixture()
        record["assistance"]["lifecycle"]["value"] = "generated"
        record["capture"]["boundary"]["event_classes"] = ["generated"]
        self.assertEqual(a.RequestAggregator().extend([record]).result()["assistance_request_observations"], 0)

    def test_unknown_stage_is_excluded_without_becoming_zero_occurrences(self):
        record = fixture()
        record["assistance"]["lifecycle"] = a.unknown("SYNTHETIC unresolved stage")
        self.assertEqual(a.RequestAggregator().extend([record]).result()["assistance_request_observations"], 0)
        self.assertNotIn("value", record["assistance"]["lifecycle"])

    def test_capture_stage_contradiction_rejected_by_direct_aggregate_api(self):
        record = fixture()
        record["capture"]["capabilities"]["requested"] = a.observed(False, "SYNTHETIC absent requested hook")
        with self.assertRaises(ValueError):
            a.RequestAggregator().add(record)

    def test_unknown_with_value_rejected_by_direct_aggregate_api(self):
        record = fixture()
        record["capture"]["coverage"]["value"] = "complete_within_boundary"
        with self.assertRaises(Exception):
            a.RequestAggregator().add(record)

    def test_bad_reference_rejected_by_direct_aggregate_api(self):
        record = fixture()
        record["provenance"]["native_record_reference"] = "relative-file"
        with self.assertRaises(Exception):
            a.RequestAggregator().add(record)

    def test_high_precision_time_is_preserved_without_silent_truncation(self):
        value = "2026-01-01T00:00:00.1234567Z"
        original, utc, basis = a.normalize_time(value)
        self.assertEqual(original["value"], value)
        self.assertEqual(utc["state"], "unknown")
        self.assertNotIn("value", utc)

    def test_extra_zero_precision_can_be_represented_exactly(self):
        value = "2026-01-01T00:00:00.123456000Z"
        original, utc, basis = a.normalize_time(value)
        self.assertEqual(original["value"], value)
        self.assertEqual(utc["value"], "2026-01-01T00:00:00.123456Z")

    def test_numeric_clock_is_preserved_and_epoch_is_not_guessed(self):
        original, utc, basis = a.normalize_time(1777402314100)
        self.assertEqual(original["value"], 1777402314100)
        self.assertEqual(utc["state"], "unknown")

    def test_timezone_free_clock_is_not_imputed(self):
        original, utc, basis = a.normalize_time("2026-01-01T00:00:00")
        self.assertEqual(utc["state"], "unknown")

    def test_invalid_offset_is_retained_without_utc_invention(self):
        for suffix in ["+00:60", "+01:99", "+24:00"]:
            value = "2026-01-01T00:00:00" + suffix
            original, utc, basis = a.normalize_time(value)
            self.assertEqual(original["value"], value)
            self.assertEqual(utc["state"], "unknown")
            self.assertEqual(basis["state"], "unknown")

    def test_non_rfc_iso_clock_is_not_normalized(self):
        value = "2026-01-01 00:00:00+00:00"
        original, utc, basis = a.normalize_time(value)
        self.assertEqual(original["value"], value)
        self.assertEqual(utc["state"], "unknown")

    def test_exact_offset_is_converted(self):
        original, utc, basis = a.normalize_time("2026-01-01T01:00:00+01:00")
        self.assertEqual(utc["value"], "2026-01-01T00:00:00.000000Z")

    def test_pin_rejects_changed_source_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "SYNTHETIC.txt"
            path.write_text("changed")
            with self.assertRaises(ValueError):
                a.check_pin(path, "0" * 64)

    def test_capture_does_not_create_native_person_or_request_links(self):
        record = fixture()
        self.assertNotIn("subject", record)
        self.assertNotIn("assistance_id", record["assistance"])
        self.assertEqual(record["provenance"]["mapping_review"]["state"], "not_reviewed")

    def test_zenodo_adapter_excludes_backend_generation_and_code_reveal_click(self):
        native = [
            {"type": "Log", "description": "Hint button is clicked", "timestamp": None},
            {"type": "Log", "description": "Hint retry is clicked", "timestamp": None},
            {"type": "Log", "description": "Code hint requested", "timestamp": None},
            {"type": "Log", "description": "Show code hint is clicked", "timestamp": None},
            {"type": "Activity", "description": "Hint button is clicked", "timestamp": None},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "SYNTHETIC.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("hints_dataset/SYNTHETIC/scenario.html", "const eventsData = " + json.dumps(native) + ";")
            with patch.object(a, "check_pin", return_value="0" * 64):
                config, observations, info = a.zenodo_requests(path)
        self.assertEqual([row["subtype"] for row in observations], ["Hint button is clicked", "Hint retry is clicked"])
        self.assertEqual(info["native_input_count"], 5)
        self.assertEqual(info["native_assistance_log_count"], 4)

    def test_tutortrace_adapter_excludes_typing_and_response(self):
        rows = {"SYNTHETIC-source": {"events": [
            {"type": "CHAT_TYPE", "timestamp": 1, "payload": {}},
            {"type": "CHAT_QUERY", "timestamp": 2, "payload": {}},
            {"type": "CHAT_RESPONSE", "timestamp": 3, "payload": {}},
        ]}}
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "SYNTHETIC.json"
            path.write_text(json.dumps(rows))
            with patch.object(a, "check_pin", return_value="0" * 64):
                config, observations, info = a.tutortrace_requests(path)
        self.assertEqual(len(observations), 1)
        self.assertEqual(observations[0]["subtype"], "CHAT_QUERY")
        self.assertEqual(info["native_input_count"], 3)
        self.assertEqual(observations[0]["ordinal"], 1)


if __name__ == "__main__":
    unittest.main()
