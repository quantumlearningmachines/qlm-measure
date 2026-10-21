"""Synthetic boundary cases: Python ISO parsing must not normalize invalid input."""
from pathlib import Path
import unittest
try:
    from build_examples import example
    def capture():
        return example("requested")
except ModuleNotFoundError:
    from test_aggregate import fixture as capture
    import aggregate
    aggregate.load_contract(Path(__file__).parent / "vendor_contract")
from validate_contract import timestamp, validate
from carrier_bindings import xapi_statement, caliper_event

class TimestampBoundaryTests(unittest.TestCase):
    def test_invalid_offset_components_are_rejected(self):
        for suffix in ["+00:60", "+01:99", "+24:00", "-00:60"]:
            value = "2026-01-01T00:00:00" + suffix
            with self.subTest(value=value):
                self.assertFalse(timestamp(value))
                record = capture()
                record["assistance"]["event_time"]["utc"] = {"state":"observed", "value":value, "reason":"Synthetic test assertion.", "evidence_refs":["native"]}
                with self.assertRaises(Exception):
                    validate(record)

    def test_non_rfc_iso_forms_are_rejected(self):
        for value in ["2026-01-01 00:00:00+00:00", "20260101T000000Z", "2026-01-01T00:00:00+0000", "2026-02-30T00:00:00Z"]:
            with self.subTest(value=value):
                self.assertFalse(timestamp(value))

    def test_importer_time_does_not_normalize_invalid_offset(self):
        for constructor in [caliper_event, xapi_statement]:
            kwargs = {} if constructor is caliper_event else {"account_homepage":"https://example.org/synthetic/accounts", "account_name":"synthetic"}
            with self.subTest(constructor=constructor.__name__), self.assertRaises(ValueError):
                constructor(capture(), "urn:synthetic:importer", "2026-01-01T00:00:00+00:60", **kwargs)

    def test_clock_components_and_supported_edge_offsets(self):
        for value in ["2026-01-01T24:00:00Z", "2026-01-01T00:60:00Z", "2026-01-01T00:00:60Z"]:
            self.assertFalse(timestamp(value))
        for value in ["2026-01-01T00:00:00+00:59", "2026-01-01T00:00:00+23:59", "2026-01-01t00:00:00z"]:
            self.assertTrue(timestamp(value))
