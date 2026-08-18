"""
Tests for qlm-measure CLI against the sample bundle.

Every fixture in samples/ must produce the expected text and JSON report.
Exit codes: 0 valid, 1 invalid, 2 usage error.
"""
import json
import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from qlm_measure.cli import main
from qlm_measure.io import load_records, LoadError
from qlm_measure.verifier import verify_record
from qlm_measure.report import format_text, build_report
from qlm_measure.checks import CATALOG, SHIPPED_CHECKS, PLANNED_CHECKS, CATALOG_BY_ID
from qlm_measure.rules import reproduce

SAMPLES = os.path.join(os.path.dirname(__file__), "..", "..",
                       "samples", "qlm-measure-samples", "samples")
EXPECTED = os.path.join(SAMPLES, "expected")


def _load_expected_text(name):
    with open(os.path.join(EXPECTED, name)) as f:
        return f.read()


def _load_expected_report(name):
    with open(os.path.join(EXPECTED, name)) as f:
        return json.load(f)


# ── Loader tests ────────────────────────────────────────────────────

class TestLoader:
    def test_json_object(self):
        records = load_records(os.path.join(SAMPLES, "clean.json"))
        assert len(records) == 1
        assert "entries" in records[0]

    def test_jsonl(self):
        records = load_records(os.path.join(SAMPLES, "clean.jsonl"))
        assert len(records) == 3

    def test_empty_file_raises(self, tmp_path):
        p = tmp_path / "empty.json"
        p.write_text("")
        with pytest.raises(LoadError):
            load_records(str(p))

    def test_malformed_json_raises(self, tmp_path):
        p = tmp_path / "bad.json"
        p.write_text("{not json")
        with pytest.raises(LoadError):
            load_records(str(p))

    def test_not_a_record_raises(self, tmp_path):
        p = tmp_path / "notrecord.json"
        p.write_text('{"foo": "bar"}')
        with pytest.raises(LoadError):
            load_records(str(p))

    def test_bom_tolerated(self, tmp_path):
        src = open(os.path.join(SAMPLES, "clean.json"), "rb").read()
        p = tmp_path / "bom.json"
        p.write_bytes(b"\xef\xbb\xbf" + src)
        records = load_records(str(p))
        assert len(records) == 1


# ── Verifier tests ──────────────────────────────────────────────────

class TestVerifier:
    def test_clean(self):
        records = load_records(os.path.join(SAMPLES, "clean.json"))
        result = verify_record(records[0])
        assert result.valid
        assert len(result.violations) == 0

    def test_tampered_value(self):
        records = load_records(os.path.join(SAMPLES, "tampered_value.json"))
        result = verify_record(records[0])
        assert not result.valid
        check_ids = {v.check_id for v in result.violations}
        assert "HASH.ENTRY_RECOMPUTE" in check_ids
        assert "POSTERIOR.CHAIN" in check_ids

    def test_dropped_entry(self):
        records = load_records(os.path.join(SAMPLES, "dropped_entry.json"))
        result = verify_record(records[0])
        assert not result.valid
        check_ids = {v.check_id for v in result.violations}
        assert "HASH.PREV_LINK" in check_ids

    def test_reordered(self):
        records = load_records(os.path.join(SAMPLES, "reordered.json"))
        result = verify_record(records[0])
        assert not result.valid
        check_ids = {v.check_id for v in result.violations}
        assert "VERSION.MONOTONIC" in check_ids
        assert "TIMESTAMP.MONOTONIC" in check_ids
        assert "HASH.PREV_LINK" in check_ids

    def test_compacted_clean(self):
        records = load_records(os.path.join(SAMPLES, "compacted_clean.json"))
        result = verify_record(records[0])
        assert result.valid

    def test_jsonl_all_valid(self):
        records = load_records(os.path.join(SAMPLES, "clean.jsonl"))
        for r in records:
            result = verify_record(r)
            assert result.valid

    def test_bad_timestamp(self, tmp_path):
        records = load_records(os.path.join(SAMPLES, "clean.json"))
        record = records[0]
        record["entries"][0]["timestamp"] = "not-a-date"
        result = verify_record(record)
        assert not result.valid
        check_ids = {v.check_id for v in result.violations}
        assert "SCHEMA.TIMESTAMP_FORMAT" in check_ids


# ── Text format tests ───────────────────────────────────────────────

class TestTextFormat:
    def _compare_text(self, fixture, expected_file):
        records = load_records(os.path.join(SAMPLES, fixture))
        results = [verify_record(r) for r in records]
        text = format_text(fixture, records, results)
        expected = _load_expected_text(expected_file)
        assert text == expected, f"Text mismatch for {fixture}"

    def test_clean(self):
        self._compare_text("clean.json", "clean.txt")

    def test_tampered(self):
        self._compare_text("tampered_value.json", "tampered_value.txt")

    def test_dropped(self):
        self._compare_text("dropped_entry.json", "dropped_entry.txt")

    def test_reordered(self):
        self._compare_text("reordered.json", "reordered.txt")

    def test_compacted(self):
        self._compare_text("compacted_clean.json", "compacted_clean.txt")

    def test_jsonl(self):
        self._compare_text("clean.jsonl", "clean_jsonl.txt")


# ── Report tests ────────────────────────────────────────────────────

class TestReport:
    def _compare_report(self, fixture, expected_file):
        records = load_records(os.path.join(SAMPLES, fixture))
        results = [verify_record(r) for r in records]
        report = build_report(fixture, records, results)
        expected = _load_expected_report(expected_file)
        # Compare everything except tool.version and generated_at
        for key in ["records", "summary"]:
            assert report[key] == expected[key], f"Report {key} mismatch for {fixture}"
        assert report["input"]["records"] == expected["input"]["records"]

    def test_clean(self):
        self._compare_report("clean.json", "clean.report.json")

    def test_tampered(self):
        self._compare_report("tampered_value.json", "tampered_value.report.json")

    def test_dropped(self):
        self._compare_report("dropped_entry.json", "dropped_entry.report.json")

    def test_reordered(self):
        self._compare_report("reordered.json", "reordered.report.json")

    def test_compacted(self):
        self._compare_report("compacted_clean.json", "compacted_clean.report.json")


# ── CLI exit code tests ─────────────────────────────────────────────

class TestCLIExitCodes:
    def test_clean_exit_0(self):
        code = main(["verify", os.path.join(SAMPLES, "clean.json"), "--quiet"])
        assert code == 0

    def test_tampered_exit_1(self):
        code = main(["verify", os.path.join(SAMPLES, "tampered_value.json"), "--quiet"])
        assert code == 1

    def test_no_args_exit_2(self):
        code = main([])
        assert code == 2

    def test_missing_file_exit_2(self):
        code = main(["verify", "/nonexistent/file.json"])
        assert code == 2

    def test_explain_exit_0(self):
        code = main(["explain"])
        assert code == 0

    def test_explain_check_exit_0(self):
        code = main(["explain", "HASH.ENTRY_RECOMPUTE"])
        assert code == 0

    def test_explain_unknown_exit_2(self):
        code = main(["explain", "FAKE.CHECK"])
        assert code == 2

    def test_version_exit_0(self):
        code = main(["version"])
        assert code == 0


# ── Check catalog tests ─────────────────────────────────────────────

class TestCheckCatalog:
    def test_shipped_count(self):
        assert len(SHIPPED_CHECKS) == 10

    def test_planned_count(self):
        assert len(PLANNED_CHECKS) == 5

    def test_all_have_ids(self):
        for c in CATALOG:
            assert c.id
            assert c.label
            assert c.status in ("shipped", "planned")

    def test_catalog_by_id(self):
        assert "HASH.ENTRY_RECOMPUTE" in CATALOG_BY_ID
        assert CATALOG_BY_ID["HASH.ENTRY_RECOMPUTE"].category == "Hash chain"


# ── Rule tests ──────────────────────────────────────────────────────

class TestRules:
    def test_golden_case(self):
        p1 = reproduce("tempered-bkt-1", {"slip": 0.10, "guess": 0.20}, 0.35, True, 0.42)
        assert abs(p1 - 0.5032) < 0.001

        p2 = reproduce("tempered-bkt-1", {"slip": 0.10, "guess": 0.20}, p1, True, 0.95)
        assert abs(p2 - 0.8087) < 0.001

    def test_all_vectors(self):
        vectors_path = os.path.join(os.path.dirname(__file__), "..", "..",
                                    "schema", "vectors", "estimate-tempered-bkt-1.json")
        vectors = json.load(open(vectors_path))
        for v in vectors["vectors"]:
            result = reproduce("tempered-bkt-1", {"slip": v["slip"], "guess": v["guess"]},
                              v["prior"], v["correct"], v["weight"])
            assert abs(result - v["posterior"]) < vectors["tolerance"], \
                f"Vector failed: prior={v['prior']} correct={v['correct']} w={v['weight']}"

    def test_unknown_rule(self):
        assert reproduce("nonexistent-rule", {}, 0.5, True, 1.0) is None

    def test_weight_zero(self):
        result = reproduce("tempered-bkt-1", {"slip": 0.10, "guess": 0.20}, 0.5, True, 0.0)
        assert result == 0.5
