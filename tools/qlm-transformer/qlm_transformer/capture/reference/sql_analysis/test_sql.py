"""Synthetic loader/query tests. No real source rows are distributed here."""
from copy import deepcopy
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

import run_sql as sql

CONTRACT_DIR = Path(__file__).resolve().parent.parent / "analysis" / "vendor_contract"
validator, bindings = sql.load_contract(CONTRACT_DIR)


def unknown(reason="SYNTHETIC unavailable value"):
    return {"state": "unknown", "reason": reason, "evidence_refs": []}


def observed(value):
    return {"state": "observed", "value": value, "reason": "SYNTHETIC fixture assertion", "evidence_refs": ["native"]}


def fixture(scope="urn:synthetic:source:a", local="1", label="SYNTHETIC hint requested"):
    return {
        "schema_version": "0.1.0-draft", "record_kind": "assistance_event_observation",
        "record_id": {"scope": scope, "local_id": local},
        "source": {"source_id": "urn:synthetic:release", "product_version": unknown(), "model_version": unknown(), "source_revision": unknown()},
        "assistance": {"label": label, "lifecycle": observed("requested"), "event_time": {"original": unknown(), "utc": unknown(), "clock_basis": unknown()}},
        "capture": {"instrument_id": "urn:synthetic:instrument", "capabilities": {stage: unknown() for stage in ("requested", "generated", "transmitted", "displayed", "accepted")}, "boundary": {"systems": ["SYNTHETIC system"], "event_classes": ["requested"], "exclusions": ["SYNTHETIC excluded activity"]}, "window": {"start": unknown(), "end": unknown()}, "coverage": unknown()},
        "context": {"activity_reference": unknown(), "phase": unknown(), "permission": unknown()},
        "provenance": {"native_record_reference": "urn:synthetic:native-record", "mapping_reference": "urn:synthetic:mapping", "mapping_review": {"state": "not_reviewed", "reason": "SYNTHETIC unreviewed mapping", "evidence_refs": []}},
        "evidence": [{"evidence_id": "native", "kind": "native_record", "reference": "urn:synthetic:native-record", "description": "SYNTHETIC fixture, not a learner row"}],
        "derived_labels": []
    }


class SQLTests(unittest.TestCase):
    def setUp(self):
        self.db = sql.open_database()

    def tearDown(self):
        self.db.close()

    def add(self, records):
        return sql.load_records(self.db, records, validator.validate)

    def total(self):
        return next(row for row in sql.run_query(self.db) if row["grouping"] == "total")

    def test_count_same_local_identity_separately_across_sources(self):
        self.add([fixture("urn:synthetic:a", "same"), fixture("urn:synthetic:b", "same")])
        self.assertEqual(self.total()["recorded_help_request_observations"], 2)

    def test_native_label_strata_are_preserved(self):
        self.add([fixture(local="1", label="SYNTHETIC Get Hint"), fixture(local="2", label="SYNTHETIC CHAT_QUERY")])
        rows = [row for row in sql.run_query(self.db) if row["grouping"] != "total"]
        self.assertEqual({row["native_label"] for row in rows}, {"SYNTHETIC Get Hint", "SYNTHETIC CHAT_QUERY"})

    def test_equal_content_at_different_release_positions_stays_separate(self):
        self.add([fixture(local="1"), fixture(local="2")])
        self.assertEqual(self.total()["released_observations"], 2)

    def test_exact_replay_is_idempotent(self):
        record = fixture()
        stats = self.add([record, deepcopy(record), record])
        self.assertEqual(stats, {"inserted": 1, "identical_replays_skipped": 2})
        self.assertEqual(self.total()["released_observations"], 1)

    def test_object_key_order_is_not_a_false_conflict(self):
        record = fixture()
        reordered = dict(reversed(list(record.items())))
        self.assertEqual(self.add([record, reordered])["identical_replays_skipped"], 1)

    def test_conflict_rolls_back_whole_new_batch_and_preserves_prior_data(self):
        self.add([fixture(local="prior")])
        conflicting = fixture(local="new", label="SYNTHETIC conflicting reinterpretation")
        with self.assertRaises(ValueError):
            self.add([fixture(local="new"), fixture(local="other"), conflicting])
        self.assertEqual(self.total()["released_observations"], 1)
        self.assertEqual(self.db.execute("SELECT local_id FROM captures").fetchone()[0], "prior")

    def test_late_schema_error_rolls_back_entire_batch(self):
        bad = fixture(local="bad")
        del bad["capture"]
        with self.assertRaises(Exception):
            self.add([fixture(local="good"), bad])
        self.assertEqual(self.total()["released_observations"], 0)

    def test_unknown_cannot_be_smuggled_as_zero(self):
        bad = fixture()
        bad["capture"]["coverage"]["value"] = 0
        with self.assertRaises(Exception):
            self.add([bad])

    def test_unreviewed_lifecycle_is_excluded_and_explicitly_counted(self):
        record = fixture()
        record["assistance"]["lifecycle"] = {"state": "not_reviewed", "reason": "SYNTHETIC unreviewed stage", "evidence_refs": []}
        self.add([record])
        total = self.total()
        self.assertEqual(total["recorded_help_request_observations"], 0)
        self.assertEqual(total["unresolved_lifecycle_observations"], 1)
        self.assertIsNone(total["actual_request_total"])
        self.assertIsNone(total["available_displayed_observations"])

    def test_missing_stage_rows_are_null_not_zero_real_events(self):
        self.add([fixture()])
        total = self.total()
        self.assertIsNone(total["available_generated_observations"])
        self.assertIsNone(total["available_displayed_observations"])
        self.assertEqual(total["unknown_coverage_observations"], 1)
        self.assertEqual(total["unreviewed_mapping_observations"], 1)

    def test_observed_generated_is_counted_without_entering_request_metric(self):
        record = fixture()
        record["assistance"]["lifecycle"] = observed("generated")
        record["capture"]["boundary"]["event_classes"] = ["generated"]
        self.add([record])
        total = self.total()
        self.assertEqual(total["recorded_help_request_observations"], 0)
        self.assertEqual(total["available_generated_observations"], 1)
        self.assertIsNone(total["actual_request_total"])

    def test_sql_query_is_identical_after_both_carrier_recoveries(self):
        records = [fixture("urn:synthetic:a"), fixture("urn:synthetic:b")]
        self.add(records)
        expected = sql.run_query(self.db)
        for make, extract in ((bindings.xapi_statement, bindings.extract_xapi), (bindings.caliper_event, bindings.extract_caliper)):
            database = sql.open_database()
            try:
                account = {"account_homepage": "https://example.org/synthetic/account-system", "account_name": "synthetic-sql-importer"} if make is bindings.xapi_statement else {}
                recovered = [extract(make(record, "urn:synthetic:importer", "2026-01-01T00:00:00.000Z", **account)) for record in records]
                sql.load_records(database, recovered, validator.validate)
                self.assertEqual(sql.run_query(database), expected)
            finally:
                database.close()

    def test_inconsistent_carrier_metadata_is_rejected(self):
        carrier = bindings.xapi_statement(fixture(), "urn:synthetic:importer", "2026-01-01T00:00:00.000Z", account_homepage="https://example.org/synthetic/account-system", account_name="synthetic-sql-importer")
        carrier["actor"]["account"]["name"] = "SYNTHETIC learner invented"
        with self.assertRaises(ValueError):
            bindings.extract_xapi(carrier)

    def test_order_and_batch_boundaries_do_not_change_query(self):
        records = [fixture("urn:synthetic:a", "1"), fixture("urn:synthetic:b", "2"), fixture("urn:synthetic:a", "3")]
        self.add(records)
        expected = sql.run_query(self.db)
        database = sql.open_database()
        try:
            sql.load_records(database, records[2:], validator.validate)
            sql.load_records(database, list(reversed(records[:2])), validator.validate)
            self.assertEqual(sql.run_query(database), expected)
        finally:
            database.close()

    def test_parameter_binding_handles_malicious_looking_scope_as_data(self):
        scope = "urn:synthetic:source:';DROP_TABLE_captures;--"
        self.add([fixture(scope=scope)])
        self.assertEqual(self.total()["released_observations"], 1)

    def test_sqlite_table_rejects_mismatched_identity(self):
        record = fixture()
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO captures(scope,local_id,payload_json) VALUES (?,?,?)", ("urn:synthetic:different", "1", sql.canonical(record)))

    def test_duplicate_json_keys_are_rejected_before_schema_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "SYNTHETIC.jsonl"
            path.write_text('{"record_id":{"scope":"urn:synthetic:first","scope":"urn:synthetic:second"}}\n')
            with self.assertRaises(ValueError):
                list(sql.read_jsonl(path, lambda value: value))


if __name__ == "__main__":
    unittest.main()
