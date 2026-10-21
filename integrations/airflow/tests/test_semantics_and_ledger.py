"""SYNTHETIC contract tests. No rows here are observed research/product data."""
import base64
from concurrent.futures import ProcessPoolExecutor
from copy import deepcopy
import hashlib
import json
import multiprocessing
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

from jsonschema import Draft202012Validator
from qlm_transformer.core import digest, verify
from qlm_airflow import pipeline
from qlm_airflow.ledger import ingest
from qlm_airflow.research_adapters import adapt, expected_subjects, source_status, verify_import_document, _rechain
from qlm_airflow.semantics import PROFILE, binding, normalize_context, pooling_compatibility, mapping_contract

ROOT = Path(__file__).resolve().parents[1]
CONTEXT = {"phase": "practice", "permission": "permitted", "observed_use": "recorded", "capture": "complete_within_boundary", "capture_boundary": "SYNTHETIC test recorder only"}


def native(event_id="synthetic-event-1", revision=0, content="SYNTHETIC fixture"):
    lifecycle = {"source_id": "SYNTHETIC-source", "event_id": event_id, "source_revision": revision, "event_type": "help_displayed", "content": content}
    return {"native_identity": {"platform": "explicit-assistance-events", "source_id": lifecycle["source_id"], "event_id": event_id}, "source_revision": revision,
            "source_payload": {"scoped_subject": "qlm:SYNTHETIC", "activity_id": "synthetic-task", "lifecycle": lifecycle, "source_kind": "synthetic_fixture"}}


def concurrent_ingest(arguments):
    folder, batch_id, rows = arguments
    return ingest(folder, batch_id, {"tenant": "SYNTHETIC"}, rows)


class SemanticsTests(unittest.TestCase):
    def test_mutable_profile_cannot_promote_fabricated_bytes_to_published_sample(self):
        profile = json.loads((ROOT / "profiles/tutormoments.json").read_text())
        raw = b'{"SYNTHETIC":"not a publication"}\n'
        profile["source"]["sampleSha256"] = hashlib.sha256(raw).hexdigest()
        self.assertEqual(source_status(raw, profile)["sourceKind"], "unverified_user_input")
        real = (ROOT / "samples/tutormoments-real-transcripts.jsonl").read_bytes()
        profile = json.loads((ROOT / "profiles/tutormoments.json").read_text())
        profile["source"]["citation"] = "Fabricated citation"
        self.assertEqual(source_status(real, profile)["sourceKind"], "unverified_user_input")

    def test_packaged_profiles_and_event_schemas_match_public_canonical_artifacts(self):
        for name in ("assistance-context-v0.1.0.json", "research-import-v2.json", "assistance-lifecycle-v1.json"):
            packaged = json.loads((ROOT / "src/qlm_airflow/resources" / name).read_text())
            public = json.loads((ROOT / "schemas" / name).read_text())
            self.assertEqual(digest(packaged), digest(public))
            browser = ROOT.parent / "dist/schemas" / name
            if browser.exists():
                self.assertEqual(digest(public), digest(json.loads(browser.read_text())))

    def test_context_unknown_defaults_do_not_infer_permission_or_no_ai(self):
        context = normalize_context()
        self.assertEqual(context["phase"], "unknown")
        self.assertEqual(context["permission"], "unknown")
        self.assertEqual(context["observed_use"], "unknown")
        self.assertIsNone(context["model_version"])
        for invalid in (None, {"capture": "complete_within_boundary"}, {"permission": "yes"}, {"made_up": True}, {"model_version": True}, []):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                normalize_context(invalid)

    def reviewed(self, source):
        mapping = mapping_contract("explicit-assistance-events")
        mapping["review"] = {"status": "independently_reviewed", "reviewer": "SYNTHETIC reviewer test", "scope": "SYNTHETIC software test only", "reference": "https://example.invalid/synthetic-review"}
        mapping["coverage"] = {"status": "complete_within_boundary", "boundary": CONTEXT["capture_boundary"]}
        return {"source_id": source, "source_kind": "unverified_user_input", "mapping": mapping, "context": CONTEXT}

    def test_pooling_screen_has_pass_path_for_complete_declared_descriptors(self):
        result = pooling_compatibility([self.reviewed("SYNTHETIC-a"), self.reviewed("SYNTHETIC-b")])
        self.assertTrue(result["eligible"])
        self.assertIn("does not validate", result["limitations"][0])

    def test_real_source_semantics_are_blocked_and_heterogeneous(self):
        descriptors = [{"source_id": name, "mapping": mapping_contract(name), "context": normalize_context()} for name in ("tutormoments", "oatutor")]
        result = pooling_compatibility(descriptors)
        self.assertFalse(result["eligible"])
        self.assertIn("target_unit_incompatible", {reason["code"] for reason in result["reasons"]})

    def test_pooling_false_pass_traps(self):
        for alteration in ("null_review", "empty_measurement", "missing_unit", "missing_coding", "invalid_boundary", "same_source", "missing_review_reference", "synthetic", "unknown_use", "mixed_context", "invalid_descriptor"):
            with self.subTest(alteration=alteration):
                left, right = self.reviewed("SYNTHETIC-a"), self.reviewed("SYNTHETIC-b")
                if alteration == "null_review": right["mapping"]["review"] = None
                elif alteration == "empty_measurement": right["mapping"]["measurement_profile"] = ""
                elif alteration == "missing_unit": right["mapping"].pop("target_unit")
                elif alteration == "missing_coding": right["mapping"].pop("coding_method")
                elif alteration == "invalid_boundary": right["mapping"]["coverage"]["boundary"] = True
                elif alteration == "same_source": right["source_id"] = left["source_id"]
                elif alteration == "missing_review_reference": right["mapping"]["review"].pop("reference")
                elif alteration == "synthetic": right["source_kind"] = "synthetic_fixture"
                elif alteration == "unknown_use": right["context"] = {**CONTEXT, "observed_use": "unknown"}
                elif alteration == "mixed_context": right["context_consistent"] = False
                else: right = None
                self.assertFalse(pooling_compatibility([left, right])["eligible"])


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name) / "ledger"
        self.namespace = {"tenant": "SYNTHETIC", "key_id": "test"}

    def tearDown(self):
        self.temp.cleanup()

    def test_batch_replay_overlap_and_correction_keep_active_counts(self):
        first = ingest(self.folder, "batch-1", self.namespace, [native("a"), native("b")])
        second = ingest(self.folder, "batch-2", self.namespace, [native("b"), native("c")])
        replay = ingest(self.folder, "batch-2", self.namespace, [native("b"), native("c")])
        correction = ingest(self.folder, "correction", self.namespace, [native("c", 1, "SYNTHETIC corrected")])
        self.assertEqual((first["active_events"], second["active_events"], replay["active_events"], correction["active_events"]), (2, 3, 3, 3))
        self.assertEqual(second, replay)
        self.assertEqual(correction["history_revisions"], 4)
        self.assertEqual(len([event for event in correction["active_snapshot"] if event["revision"] == 1]), 1)
        # A delayed task retry reproduces its original snapshot, not a newer one.
        self.assertEqual(first, ingest(self.folder, "batch-1", self.namespace, [native("a"), native("b")]))

    def test_conflicts_abort_entire_batch_without_mutation(self):
        ingest(self.folder, "first", self.namespace, [native("a")])
        before = (self.folder / "state.json").read_bytes()
        with self.assertRaisesRegex(ValueError, "conflicting"):
            ingest(self.folder, "conflict", self.namespace, [native("new"), native("a", content="changed without revision")])
        self.assertEqual(before, (self.folder / "state.json").read_bytes())
        with self.assertRaisesRegex(ValueError, "different native"):
            ingest(self.folder, "first", self.namespace, [native("b")])

    def test_older_revision_remains_history_without_replacing_active(self):
        ingest(self.folder, "newer", self.namespace, [native("a", 2, "revision 2")])
        result = ingest(self.folder, "older", self.namespace, [native("a", 1, "revision 1")])
        self.assertEqual(result["history_revisions"], 2)
        self.assertEqual(result["active_snapshot"][0]["revision"], 2)

    def test_cross_batch_request_links_and_corrections_cannot_contradict_known_request(self):
        request = native("request"); request["source_payload"]["lifecycle"]["event_type"] = "help_requested"
        ingest(self.folder, "request", self.namespace, [request])
        display = native("display"); display["source_payload"]["lifecycle"]["request_event_id"] = "request"
        wrong = deepcopy(display); wrong["source_payload"]["scoped_subject"] = "qlm:other"
        with self.assertRaisesRegex(ValueError, "active request link"):
            ingest(self.folder, "wrong-learner", self.namespace, [wrong])
        result = ingest(self.folder, "display", self.namespace, [display])
        self.assertEqual(result["request_link_checks"]["resolved_within_ledger"], 1)
        revision = native("request", 1); revision["source_payload"]["lifecycle"]["event_type"] = "help_generated"
        with self.assertRaisesRegex(ValueError, "active request link"):
            ingest(self.folder, "invalid-request-correction", self.namespace, [revision])

    def test_oversized_state_is_rejected_before_replace(self):
        ingest(self.folder, "first", self.namespace, [native("a")])
        before = (self.folder / "state.json").read_bytes()
        from qlm_airflow import ledger
        with patch.object(ledger, "MAX_STATE_BYTES", len(before) + 100):
            with self.assertRaisesRegex(ValueError, "would exceed"):
                ingest(self.folder, "too-large", self.namespace, [native("b", content="x" * 1000)])
        self.assertEqual(before, (self.folder / "state.json").read_bytes())

    def test_changed_subject_activity_namespace_and_boolean_revision_rejected(self):
        ingest(self.folder, "first", self.namespace, [native("a")])
        for field in ("scoped_subject", "activity_id"):
            row = native("a", 1); row["source_payload"][field] = "changed"
            with self.assertRaisesRegex(ValueError, "identity changed"):
                ingest(self.folder, "changed-" + field, self.namespace, [row])
        row = native(); row["source_revision"] = True
        with self.assertRaises(ValueError): ingest(self.folder, "boolean", self.namespace, [row])
        with self.assertRaisesRegex(ValueError, "namespace differs"):
            ingest(self.folder, "wrong-key", {"tenant": "other"}, [native()])

    def test_concurrent_processes_serialize_without_lost_updates(self):
        context = multiprocessing.get_context("fork")
        with ProcessPoolExecutor(max_workers=3, mp_context=context) as executor:
            list(executor.map(concurrent_ingest, [(str(self.folder), "batch-" + str(index), [native(str(index))]) for index in range(5)]))
        result = ingest(self.folder, "inspect", {"tenant": "SYNTHETIC"}, [])
        self.assertEqual(result["active_events"], 5)
        self.assertEqual(result["history_revisions"], 5)

    def test_corrupt_state_and_payload_fail_closed(self):
        for row in ({}, {"native_identity": {}, "source_revision": 0, "source_payload": {}}, {**native(), "source_payload": {}}):
            with self.assertRaises(ValueError): ingest(self.folder, "bad", self.namespace, [row])
        ingest(self.folder, "first", self.namespace, [native()])
        state = json.loads((self.folder / "state.json").read_text()); state["history"] = []
        (self.folder / "state.json").write_text(json.dumps(state))
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            ingest(self.folder, "next", self.namespace, [native("other")])


class CumulativePipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        for folder in ("config", "samples", "profiles", "provenance", "tests/fixtures"):
            shutil.copytree(ROOT / folder, self.root / folder)
        self.secret = base64.b64encode(os.urandom(32)).decode()
        self.environment = patch.dict(os.environ, {"QLM_PSEUDONYM_KEY_B64": self.secret})
        self.environment.start()

    def tearDown(self):
        self.environment.stop(); self.temp.cleanup()

    def run_batch(self, name, run_id=None):
        result = pipeline.run(self.root, "config/" + name + ".json", run_id or name)
        folder = Path(result["output_dir"])
        receipt = json.loads((folder / "cumulative_ingestion.json").read_text())
        complete = json.loads((folder / "COMPLETE.json").read_text())
        for name, expected in complete["files_sha256"].items():
            self.assertEqual(hashlib.sha256((folder / name).read_bytes()).hexdigest(), expected)
        return result, receipt

    def test_real_pipeline_commits_two_batches_replay_and_correction(self):
        _, first = self.run_batch("synthetic-batch-1")
        _, second = self.run_batch("synthetic-batch-2")
        _, replay = self.run_batch("synthetic-batch-2", "synthetic-replay")
        _, corrected = self.run_batch("synthetic-correction")
        self.assertEqual((first["active_events"], second["active_events"], replay["active_events"], corrected["active_events"]), (2, 5, 5, 5))
        self.assertEqual(corrected["history_revisions"], 6)
        self.assertEqual(second, replay)
        self.assertEqual(corrected["active_event_counts"], {"help_requested": 1, "help_generated": 1, "help_transmitted": 1, "help_displayed": 1, "learner_response_observed": 1})
        for event in corrected["active_snapshot"]:
            self.assertEqual(event["source_payload"]["source_kind"], "synthetic_fixture")
        self.assertNotIn(self.secret, json.dumps(corrected))
        self.assertNotIn("fixture-learner-1", json.dumps(corrected))

    def test_lifecycle_schema_hashes_request_origin_and_depth_preserved(self):
        self.run_batch("synthetic-batch-2")
        doc = json.loads((self.root / "outputs/synthetic-batch-2/synthetic_events/learnlog.json").read_text())
        validator = Draft202012Validator(json.loads((ROOT / "schemas/assistance-lifecycle-v1.json").read_text()))
        for record in doc["records"]:
            self.assertEqual(record["header"]["semantic_profile_binding"], binding(PROFILE))
            event = record["entries"][0]["event"]; validator.validate(event)
            self.assertEqual(event["actor"], {"role": "system", "kind": "software", "id": "QLM-transformer"})
        displayed = next(record["entries"][0]["event"]["data"] for record in doc["records"] if record["entries"][0]["event"]["data"]["assistance"] == "help_displayed")
        self.assertEqual(displayed["lifecycle"]["native_hint_depth"], 3)
        self.assertEqual(displayed["lifecycle"]["delivery_order"], 1)
        self.assertIsNone(displayed["original_source_timestamp"])

    def test_source_scoping_prevents_cross_product_learner_linkage(self):
        profile = json.loads((ROOT / "profiles/explicit-assistance-events.json").read_text())
        row = json.loads((ROOT / "tests/fixtures/synthetic-batch-1.jsonl").read_text().splitlines()[0])
        key = base64.b64decode(self.secret)
        first = expected_subjects([row], profile, "tenant", key)
        second = expected_subjects([{**row, "source_id": "SYNTHETIC-second-product"}], profile, "tenant", key)
        self.assertNotEqual(first, second)

    def test_bound_schema_and_profile_tampering_is_rejected_even_with_recalculated_chain(self):
        self.run_batch("synthetic-batch-1")
        doc = json.loads((self.root / "outputs/synthetic-batch-1/synthetic_events/learnlog.json").read_text())
        for mutation in ("profile", "schema", "context", "identity", "source_digest", "import_time"):
            changed = deepcopy(doc)
            record = changed["records"][0]
            if mutation == "profile": record["header"]["semantic_profile_binding"]["sha256"] = "0" * 64
            elif mutation == "schema": record["event_schemas"] = ["https://example.invalid/changed-schema"]
            elif mutation == "context": record["entries"][0]["event"]["data"]["assistance_context"]["permission"] = True
            elif mutation == "identity": record["header"]["source_namespace"] = "SYNTHETIC-other"
            elif mutation == "source_digest": record["entries"][0]["event"]["data"]["provenance"]["source_sha256"] = "0" * 64
            else: record["entries"][0]["event"]["data"]["provenance"]["imported_at"] = "2026-10-18T00:00:00Z"
            _rechain(record)
            verify(changed)  # valid chain alone is insufficient for interpretation
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                verify_import_document(changed)

    def test_explicit_null_boolean_context_and_ambiguous_source_clock_rejected(self):
        profile = json.loads((ROOT / "profiles/explicit-assistance-events.json").read_text())
        row = json.loads((ROOT / "tests/fixtures/synthetic-batch-1.jsonl").read_text().splitlines()[0])
        for malformed in ({**row, "context": None}, {**row, "context": False}, {**row, "source_timestamp": "2026-10-17T00:00:00+00:00"}, {**row, "source_revision": True}):
            with self.subTest(malformed=malformed), self.assertRaises(ValueError):
                adapt([malformed], json.dumps([malformed]).encode(), profile, base64.b64decode(self.secret), "SYNTHETIC", "2026-10-17T00:00:00Z")

    def test_cumulative_rejects_research_row_positions_as_native_event_ids(self):
        config = json.loads((self.root / "config/demo.json").read_text())
        config["cumulative"] = {"ledger_id": "no-native-events", "batch_id": "batch"}
        (self.root / "config/no-native.json").write_text(json.dumps(config))
        with self.assertRaisesRegex(ValueError, "explicit native event"):
            pipeline.run(self.root, "config/no-native.json", "research")
        with self.assertRaisesRegex(ValueError, "reserved"):
            pipeline.run(self.root, "config/demo.json", "cumulative")
