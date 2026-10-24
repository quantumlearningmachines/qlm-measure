"""Sandpiper (National Tutoring Observatory) PER_UTTERANCE export adapter, and the
backward-compatibility guarantee for documents written before it existed.

The bundled Sandpiper input is a SYNTHETIC fixture made from Sandpiper's own
documentation examples (MIT). No NTO data exists in this repository.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import base64
import os

from jsonschema import Draft202012Validator
from qlm_transformer.core import digest, subject_id, verify
from qlm_airflow import pipeline
from qlm_airflow.pipeline import parse_rows
from qlm_airflow.research_adapters import SOURCES, adapt, expected_subjects, verify_import_document, _rechain
from qlm_airflow.semantics import PROFILE, binding, mapping_contract, profile_for, resource

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "tests/fixtures"
LEGACY = FIXTURES / "pre-sandpiper"
SAMPLE = FIXTURES / "sandpiper-SYNTHETIC.csv"
BROWSER = ROOT.parents[1] / "demo/transformer/dist"
KEY = b"sandpiper-test-key-only-not-for-production-0001"
TENANT = "sandpiper-test"
AT = "2026-10-24T00:00:00Z"
STAGES = ("requested", "offered", "generated", "transmitted", "displayed", "accepted")
BASE = "_id,session_id,sequence_id,role,content,start_time,end_time"


def profile():
    return json.loads((ROOT / "profiles/sandpiper.json").read_text())


def run_csv(text, key=KEY):
    raw = text.encode()
    return adapt(parse_rows(raw, ".csv"), raw, profile(), key, TENANT, AT)


def sample_run():
    raw = SAMPLE.read_bytes()
    return adapt(parse_rows(raw, ".csv"), raw, profile(), KEY, TENANT, AT)


class ProfileVersioningTests(unittest.TestCase):
    def test_v0_1_0_stays_byte_semantically_identical_to_its_published_copy(self):
        packaged = resource("assistance-context-v0.1.0.json")
        self.assertEqual(packaged["version"], "0.1.0")
        self.assertNotIn("sandpiper", packaged["semantics"])
        self.assertEqual(digest(packaged), digest(json.loads((ROOT / "schemas/assistance-context-v0.1.0.json").read_text())))
        legacy = json.loads((LEGACY / "tutormoments.learnlog.json").read_text())
        self.assertEqual(binding(packaged), legacy["records"][0]["header"]["semantic_profile_binding"])
        self.assertEqual(PROFILE, packaged)

    def test_v0_2_0_only_adds_the_sandpiper_contract(self):
        old, new = resource("assistance-context-v0.1.0.json"), resource("assistance-context-v0.2.0.json")
        self.assertEqual(new["$id"], "https://transformer.quantumlearningmachines.com/schemas/assistance-context-v0.2.0.json")
        self.assertEqual((new["profile_id"], new["version"]), ("qlm:assistance-context:0.2.0", "0.2.0"))
        for key in set(old) | set(new):
            if key not in ("$id", "profile_id", "version", "semantics"):
                self.assertEqual(new.get(key), old.get(key), key)
        self.assertEqual({k: v for k, v in new["semantics"].items() if k != "sandpiper"}, old["semantics"])
        self.assertIn("sandpiper", new["semantics"])

    def test_each_platform_binds_the_profile_version_that_introduced_its_contract(self):
        for platform in ("tutormoments", "oatutor", "explicit-assistance-events"):
            self.assertEqual(profile_for(platform)["version"], "0.1.0")
        self.assertEqual(profile_for("sandpiper")["version"], "0.2.0")
        self.assertEqual(mapping_contract("sandpiper"), resource("assistance-context-v0.2.0.json")["semantics"]["sandpiper"])
        self.assertIn("sandpiper", SOURCES)
        for unknown in ("unknown", "", None):
            with self.subTest(unknown=unknown), self.assertRaises(ValueError):
                profile_for(unknown)
            with self.assertRaises(ValueError):
                mapping_contract(unknown)

    def test_published_copies_of_new_definitions_match_the_packaged_resources(self):
        for name in ("assistance-context-v0.2.0.json", "sandpiper-utterance-v1.json"):
            packaged = resource(name)
            self.assertEqual(digest(packaged), digest(json.loads((ROOT / "schemas" / name).read_text())), name)
            if BROWSER.exists():
                self.assertEqual(digest(packaged), digest(json.loads((BROWSER / "schemas" / name).read_text())), name)
        Draft202012Validator.check_schema(resource("sandpiper-utterance-v1.json"))


class SandpiperContractTests(unittest.TestCase):
    def test_mapping_contract_is_explicit_partial_and_unreviewed(self):
        contract = mapping_contract("sandpiper")
        self.assertEqual(contract["source_unit"], "sandpiper_session")
        self.assertEqual(contract["target_unit"], "dialogue_turn")
        self.assertEqual(contract["coverage"]["status"], "partial")
        self.assertTrue(contract["coverage"]["boundary"].strip())
        self.assertEqual(contract["review"]["status"], "implementation_checked_not_independently_reviewed")
        self.assertIn("inferred", contract["coding_method"])
        for name in ("definition", "pooling_limit", "original_event_time", "contract_version"):
            self.assertTrue(contract[name].strip(), name)
        for name in ("transformations", "information_loss"):
            self.assertTrue(contract[name] and all(isinstance(x, str) and x.strip() for x in contract[name]), name)
        self.assertIsNone(contract["measurement_profile"])
        self.assertIsNone(contract["denominator"])
        self.assertEqual(contract["assistance_stages"], {stage: "not_recorded" for stage in STAGES})

    def test_profile_is_labeled_synthetic_and_attributes_sandpiper(self):
        prof = profile()
        self.assertEqual((prof["id"], prof["mode"], prof["mapping"]["platform"], prof["mapping"]["mode"]), ("sandpiper", "annotated_dialogue", "sandpiper", "annotated_dialogue"))
        self.assertIn("SYNTHETIC", prof["name"])
        self.assertEqual(prof["source"]["kind"], "synthetic_contract_fixture")
        self.assertIn("MIT", prof["source"]["license"])
        self.assertIn("National Tutoring Observatory", prof["source"]["license"])
        self.assertIn("National-Tutoring-Observatory/sandpiper", prof["source"]["url"])
        self.assertRegex(prof["source"]["revision"], "^[0-9a-f]{40}$")
        self.assertTrue(any("SYNTHETIC" in item for item in prof["source"]["limitations"]))
        self.assertIn("SYNTHETIC", prof["source"]["summary"])
        self.assertNotIn("sampleSha256", prof["source"])
        self.assertEqual(prof["source"]["fixtureSha256"], hashlib.sha256(SAMPLE.read_bytes()).hexdigest())
        if BROWSER.exists():
            self.assertEqual((BROWSER / "samples" / prof["sampleName"]).read_bytes(), SAMPLE.read_bytes())

    def test_sample_holds_sandpipers_documented_example_rows(self):
        rows = parse_rows(SAMPLE.read_bytes(), ".csv")
        self.assertEqual(list(rows[0]), ["_id", "session_id", "sequence_id", "role", "content", "start_time", "end_time",
                                         "annotator[AI-0][0]given_praise", "annotator[AI-0][0]markedAs", "annotator[AI-0][0]votingReason"])
        self.assertEqual([(r["session_id"], r["sequence_id"], r["role"], r["content"]) for r in rows], [
            ("session_001", "1", "Tutor", "Hello! Today we're going to work on fractions."),
            ("session_001", "2", "Student", "Hi! I'm ready to learn."),
            ("session_001", "3", "Tutor", "Great! Let's start with a simple example."),
            ("session_001", "4", "Student", "Okay I'm listening."),
            ("session_001", "5", "Tutor", "A fraction shows a part of a whole."),
            ("session_001", "6", "Student", "Got it. Can you show me an example?"),
            ("session_002", "1", "Tutor", "Welcome back! Let's review decimals today."),
            ("session_002", "2", "Student", "Hello! I've been practicing.")])


class SandpiperAdapterTests(unittest.TestCase):
    def test_sample_is_a_synthetic_fixture_never_a_verified_source(self):
        document, status = sample_run()
        self.assertEqual(status, {"sourceKind": "synthetic_fixture", "sourceVerified": False})
        changed, status = run_csv(SAMPLE.read_text() + "\n")
        self.assertEqual(status, {"sourceKind": "unverified_user_input", "sourceVerified": False})
        for doc, kind in ((document, "synthetic_fixture"), (changed, "unverified_user_input")):
            for record in doc["records"]:
                self.assertEqual(record["header"]["source_kind"], kind)
                self.assertNotIn("source_provenance", record["header"])

    def test_one_record_per_session_with_entries_in_sequence_order(self):
        document, _ = sample_run()
        self.assertEqual(len(document["records"]), 2)
        expected = (("session_001", [str(n) for n in range(1, 7)]), ("session_002", ["1", "2"]))
        for record, (session, sequence) in zip(document["records"], expected):
            header = record["header"]
            self.assertEqual(header["subject"], subject_id("sandpiper", TENANT, session, KEY))
            self.assertEqual((header["source_platform"], header["import_mode"], header["record_scope"]), ("sandpiper", "annotated_dialogue", "sandpiper_session"))
            self.assertEqual(header["event_order_basis"], "source_sequence_id_numeric_order")
            self.assertEqual(header["assistance_coverage"], "source_dialogue_and_inferred_codes_only_no_help_stage_recorded")
            self.assertEqual(header["semantic_profile_binding"], binding(resource("assistance-context-v0.2.0.json")))
            self.assertEqual(header["semantic_mapping"], mapping_contract("sandpiper"))
            self.assertEqual(header["event_schema_bindings"], [binding(resource("sandpiper-utterance-v1.json"))])
            self.assertEqual(record["event_schemas"], [resource("sandpiper-utterance-v1.json")["$id"]])
            self.assertEqual([e["event"]["data"]["utterance"]["sequence_id"] for e in record["entries"]], sequence)
            for entry in record["entries"]:
                event = entry["event"]
                self.assertEqual(event["name"], "qlm_import:transcript_utterance_observed")
                self.assertEqual(event["activity"], {"id": session})
                self.assertEqual(event["actor"], {"role": "system", "kind": "software", "id": "QLM-transformer"})
                self.assertEqual(entry["time"], AT)
        self.assertEqual(expected_subjects(parse_rows(SAMPLE.read_bytes(), ".csv"), profile(), TENANT, KEY),
                         [r["header"]["subject"] for r in document["records"]])

    def test_rows_are_ordered_by_numeric_sequence_not_file_order(self):
        text = BASE + "\nb,s2,2,Student,later,,\na,s1,10,Tutor,ten,,\nc,s1,9,Student,nine,,\nd,s2,1,Tutor,first,,\ne,s1,1,Tutor,one,,\n"
        document, _ = run_csv(text)
        self.assertEqual([r["entries"][0]["event"]["activity"]["id"] for r in document["records"]], ["s2", "s1"])
        self.assertEqual([[e["event"]["data"]["utterance"]["sequence_id"] for e in r["entries"]] for r in document["records"]], [["1", "2"], ["1", "9", "10"]])
        self.assertEqual([[e["event"]["data"]["provenance"]["source_row"] for e in r["entries"]] for r in document["records"]], [[4, 1], [5, 3, 2]])
        self.assertEqual(expected_subjects(parse_rows(text.encode(), ".csv"), profile(), TENANT, KEY),
                         [subject_id("sandpiper", TENANT, s, KEY) for s in ("s2", "s1")])

    def test_utterance_keeps_source_text_and_unparsed_times(self):
        document, _ = sample_run()
        rows = parse_rows(SAMPLE.read_bytes(), ".csv")
        first = document["records"][0]["entries"][0]["event"]["data"]
        self.assertEqual(first["utterance"], {"_id": "0", "session_id": "session_001", "sequence_id": "1", "role": "Tutor",
                                              "content": "Hello! Today we're going to work on fractions.", "start_time": "00:00:00", "end_time": "00:00:05"})
        self.assertEqual(first["raw_source_fields"], rows[0])
        self.assertEqual(first["provenance"], {"platform": "sandpiper", "source_sha256": hashlib.sha256(SAMPLE.read_bytes()).hexdigest(),
                                               "source_row": 1, "source_record_sha256": digest(rows[0]), "imported_at": AT,
                                               "mapping_sha256": digest(profile()["mapping"]), "source_kind": "synthetic_fixture"})
        self.assertEqual((first["time_basis"], first["source_time_basis"], first["original_source_timestamp"]), ("import_time", "source_strings_unparsed", None))
        self.assertEqual((first["reported_metrics"], first["missing_metrics"]), ({}, []))
        later = document["records"][1]["entries"][1]["event"]["data"]["utterance"]
        self.assertEqual(later, {"_id": "1", "session_id": "session_002", "sequence_id": "2", "role": "Student",
                                 "content": "Hello! I've been practicing.", "start_time": None, "end_time": None})
        odd, _ = run_csv(BASE + "\nx,s,1,Tutor,hi,  0:01 ,yesterday-ish\n")
        self.assertEqual(odd["records"][0]["entries"][0]["event"]["data"]["utterance"]["start_time"], "  0:01 ")
        self.assertEqual(odd["records"][0]["entries"][0]["event"]["data"]["utterance"]["end_time"], "yesterday-ish")

    def test_any_nonempty_role_label_is_kept_exactly(self):
        document, _ = run_csv(BASE + "\n0,s,1,Teacher,a,,\n1,s,2,STUDENT_1,b,,\n2,s,3, tutor ,c,,\n3,s,4,Tutor,,,\n")
        data = [e["event"]["data"] for e in document["records"][0]["entries"]]
        self.assertEqual([d["utterance"]["role"] for d in data], ["Teacher", "STUDENT_1", " tutor ", "Tutor"])
        self.assertEqual(data[3]["utterance"]["content"], "")
        self.assertEqual({d["assistance"] for d in data}, {"utterance_recorded_no_help_stage"})

    def test_annotation_codes_are_inferred_assertions_and_never_help(self):
        document, _ = sample_run()
        data = [e["event"]["data"] for r in document["records"] for e in r["entries"]]
        self.assertEqual(data[2]["inferred_annotations"], [{"basis": "inferred", "annotator": "AI-0", "index": 0, "fields": {"given_praise": "Great!"}}])
        self.assertEqual([len(d["inferred_annotations"]) for d in data], [0, 0, 1, 0, 0, 0, 0, 0])
        for d in data:
            self.assertEqual(d["assistance"], "utterance_recorded_no_help_stage")
            self.assertEqual(d["assistance_stages"], {stage: "not_recorded" for stage in STAGES})
            self.assertNotIn("none", json.dumps(d["assistance_stages"]))
            self.assertNotIn("help_evidence", d)
            self.assertNotIn("lifecycle", d)
            self.assertEqual(d["assistance_context"]["observed_use"], "unknown")

    def test_annotator_index_fields_and_identified_by_are_kept(self):
        header = BASE + ",annotator[joe][0]TUTOR_MOVE,annotator[joe][1]TUTOR_MOVE,annotator[joe][0]identifiedBy,annotator[AI-0][0]TUTOR_MOVE,annotator[AI-0][0]reasoning,annotator[AI-0][0]identifiedBy,annotator[a]b][0]x"
        text = header + "\n0,s,1,Tutor,What do you notice?,,,PROBING_UNDERSTAND,GIVING_HINT,HUMAN,GIVING_HINT,asks a question,AI,\n1,s,2,Student,Oh,,,,,,,,,odd name\n"
        document, _ = run_csv(text)
        first, second = [e["event"]["data"]["inferred_annotations"] for e in document["records"][0]["entries"]]
        self.assertEqual(first, [
            {"basis": "inferred", "annotator": "joe", "index": 0, "fields": {"TUTOR_MOVE": "PROBING_UNDERSTAND"}, "identifiedBy": "HUMAN"},
            {"basis": "inferred", "annotator": "joe", "index": 1, "fields": {"TUTOR_MOVE": "GIVING_HINT"}},
            {"basis": "inferred", "annotator": "AI-0", "index": 0, "fields": {"TUTOR_MOVE": "GIVING_HINT", "reasoning": "asks a question"}, "identifiedBy": "AI"}])
        self.assertEqual(second, [{"basis": "inferred", "annotator": "a]b", "index": 0, "fields": {"x": "odd name"}}])
        only_identity, _ = run_csv(BASE + ",annotator[AI-0][0]identifiedBy\n0,s,1,Tutor,hi,,,AI\n")
        self.assertEqual(only_identity["records"][0]["entries"][0]["event"]["data"]["inferred_annotations"],
                         [{"basis": "inferred", "annotator": "AI-0", "index": 0, "fields": {}, "identifiedBy": "AI"}])
        for d in (e["event"]["data"] for e in document["records"][0]["entries"]):
            self.assertEqual(d["assistance_stages"], {stage: "not_recorded" for stage in STAGES})

    def test_same_sequence_id_in_different_sessions_is_allowed(self):
        document, _ = run_csv(BASE + "\n0,a,1,Tutor,x,,\n0,b,1,Tutor,y,,\n")
        self.assertEqual(len(document["records"]), 2)

    def test_invalid_exports_are_rejected_with_clear_errors(self):
        good = "0,s,1,Tutor,hi,,"
        cases = [
            ("_id,session_id,role,content,start_time,end_time\n0,s,Tutor,hi,,", "missing Sandpiper utterance column"),
            (BASE + ",notes\n" + good + ",x", "neither a Sandpiper utterance column nor"),
            (BASE + ",annotator[joe]TUTOR_MOVE\n" + good + ",x", "neither a Sandpiper utterance column nor"),
            (BASE + ",annotator[][0]x\n" + good + ",x", "neither a Sandpiper utterance column nor"),
            (BASE + ",annotator[joe][01]x\n" + good + ",x", "neither a Sandpiper utterance column nor"),
            (BASE + ",annotator[joe][0]\n" + good + ",x", "neither a Sandpiper utterance column nor"),
            (BASE + ",annotator[joe][9007199254740992]x\n" + good + ",x", "annotation index"),
            (BASE + "\n0,s,1,Tutor,hi,,\n1,s,1,Student,hey,,", "unique within a session"),
            (BASE + "\n0,s,1,,hi,,", "role"),
            (BASE + "\n0,,1,Tutor,hi,,", "session_id"),
            (BASE + "\n0,   ,1,Tutor,hi,,", "session_id"),
        ]
        for sequence in ("0", "01", "1.0", "-1", "abc", " 1", "１", "+1", "1e3"):
            cases.append((BASE + "\n0,s," + sequence + ",Tutor,hi,,", "positive integer string"))
        cases.append((BASE + "\n0,s,,Tutor,hi,,", "positive integer string"))
        for text, message in cases:
            with self.subTest(text=text), self.assertRaisesRegex(ValueError, message):
                run_csv(text + "\n")
        row = {"_id": "0", "session_id": "s", "sequence_id": 1, "role": "Tutor", "content": "hi", "start_time": "", "end_time": ""}
        for bad in (row, {**row, "sequence_id": "1", "content": None}, {**row, "sequence_id": "1", "annotator[a][0]x": 3}):
            with self.subTest(bad=bad), self.assertRaisesRegex(ValueError, "text"):
                adapt([bad], json.dumps([bad]).encode(), profile(), KEY, TENANT, AT)
        many = [{**row, "sequence_id": str(n + 1)} for n in range(5001)]
        with self.assertRaisesRegex(ValueError, "5000"):
            adapt(many, b"many", profile(), KEY, TENANT, AT)
        for bad in ([], "rows", [None]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                adapt(bad, b"x", profile(), KEY, TENANT, AT)

    def test_events_satisfy_the_bound_schema(self):
        validator = Draft202012Validator(resource("sandpiper-utterance-v1.json"))
        for document in (sample_run()[0], run_csv(SAMPLE.read_text() + "\n")[0]):
            for record in document["records"]:
                for entry in record["entries"]:
                    validator.validate(entry["event"])

    def test_verifier_rejects_reinterpretation_even_with_a_recalculated_chain(self):
        document, _ = sample_run()
        self.assertEqual(verify_import_document(document), verify(document))
        def annotation(d):
            return d["records"][0]["entries"][2]["event"]["data"]

        def claim_verified(d):
            d["records"][0]["header"]["source_kind"] = "verified_public_sample"
            for entry in d["records"][0]["entries"]:
                entry["event"]["data"]["provenance"]["source_kind"] = "verified_public_sample"
        mutations = {
            "observed_basis": lambda d: annotation(d)["inferred_annotations"][0].update(basis="observed"),
            "help_stage_recorded": lambda d: annotation(d)["assistance_stages"].update(displayed="recorded"),
            "stage_none": lambda d: annotation(d)["assistance_stages"].update(offered="none"),
            "added_code": lambda d: d["records"][0]["entries"][0]["event"]["data"]["inferred_annotations"].append({"basis": "inferred", "annotator": "AI-0", "index": 0, "fields": {"given_praise": "Hello"}}),
            "dropped_code": lambda d: annotation(d).update(inferred_annotations=[]),
            "changed_code": lambda d: annotation(d)["inferred_annotations"][0]["fields"].update(given_praise="GIVING_HINT"),
            "role_differs_from_source": lambda d: annotation(d)["utterance"].update(role="Student"),
            "content_differs_from_source": lambda d: annotation(d)["utterance"].update(content="Changed"),
            "time_parsed": lambda d: annotation(d)["utterance"].update(start_time="2026-01-01T00:00:08Z"),
            "empty_time_kept_as_blank": lambda d: d["records"][1]["entries"][0]["event"]["data"]["utterance"].update(start_time=""),
            "raw_row_digest": lambda d: annotation(d)["raw_source_fields"].update(content="Changed"),
            "help_label": lambda d: annotation(d).update(assistance="tutor_utterance_recorded"),
            "absolute_time": lambda d: annotation(d).update(original_source_timestamp="2026-01-01T00:00:00Z"),
            "session_differs_from_activity": lambda d: annotation(d)["utterance"].update(session_id="session_002"),
            "out_of_order": lambda d: d["records"][0]["entries"].reverse(),
            "duplicate_sequence": lambda d: d["records"][0]["entries"][1]["event"]["data"]["utterance"].update(sequence_id="1"),
            "import_mode": lambda d: d["records"][0]["header"].update(import_mode="dialogue"),
            "mapping": lambda d: d["records"][0]["header"]["semantic_mapping"].update(coverage={"status": "complete_within_boundary", "boundary": "x"}),
            "old_profile": lambda d: d["records"][0]["header"].update(semantic_profile_binding=binding(PROFILE)),
            "schema": lambda d: d["records"][0]["header"].update(event_schema_bindings=[binding(resource("research-import-v2.json"))]),
            "verified_claim": claim_verified,
            "coverage_declaration": lambda d: d["records"][0]["header"].update(assistance_coverage="explicit_source_lifecycle_assertions_only"),
            "order_declaration": lambda d: d["records"][0]["header"].update(event_order_basis="input_row_order_not_independently_verified"),
            "raw_unknown_column": lambda d: annotation(d)["raw_source_fields"].update(notes="x"),
            "activity_renamed": lambda d: d["records"][0]["entries"][2]["event"]["activity"].update(id="session_002"),
            "repeated_entry": lambda d: d["records"][0]["entries"].insert(1, deepcopy(d["records"][0]["entries"][0])),
            "extra_event_field": lambda d: d["records"][0]["entries"][2]["event"].update(instrument={"id": "x"}),
            "second_session": lambda d: d["records"][0]["entries"].append(deepcopy(d["records"][1]["entries"][1])),
        }
        for name, mutate in mutations.items():
            changed = deepcopy(document)
            mutate(changed)
            for record in changed["records"]:
                for seq, entry in enumerate(record["entries"], 1):
                    entry["seq"] = seq
                _rechain(record)
            verify(changed)
            with self.subTest(mutation=name), self.assertRaises(ValueError):
                verify_import_document(changed)


class SandpiperPipelineTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        for folder in ("config", "samples", "profiles", "provenance"):
            shutil.copytree(ROOT / folder, self.root / folder)
        shutil.copy(SAMPLE, self.root / "samples" / SAMPLE.name)
        manifest = {"schema": "qlm-airflow-manifest-0.2", "tenant": TENANT, "key_id": "sandpiper-test-key", "imported_at": AT,
                    "datasets": [{"id": "sandpiper_synthetic", "platform": "sandpiper", "input": "samples/" + SAMPLE.name,
                                  "profile": "profiles/sandpiper.json", "metric_notes": {}}]}
        (self.root / "config/sandpiper.json").write_text(json.dumps(manifest))
        self.env = patch.dict(os.environ, {"QLM_PSEUDONYM_KEY_B64": base64.b64encode(os.urandom(32)).decode()})
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.temporary.cleanup()

    def test_pipeline_imports_sandpiper_without_counting_codes_as_help(self):
        result = pipeline.run(self.root, "config/sandpiper.json", "sandpiper")
        self.assertEqual((result["datasets"], result["observations"], result["records"]), (1, 8, 2))
        again = pipeline.run(self.root, "config/sandpiper.json", "sandpiper")
        self.assertEqual(again, result)
        combined = self.root / "outputs/sandpiper/combined"
        coverage = json.loads((combined / "coverage.json").read_text())
        self.assertEqual(coverage["evidence_counts"], {"utterance_recorded_no_help_stage": 8})
        self.assertEqual(coverage["datasets"][0]["source_kind"], "synthetic_fixture")
        self.assertEqual(coverage["datasets"][0]["record_unit"], "sandpiper_session")
        self.assertTrue(any(limit.startswith("Sandpiper annotation codes are inferred assertions") for limit in coverage["limits"]))
        scaffolding = json.loads((combined / "scaffolding_measurement.json").read_text())
        self.assertEqual(scaffolding["status"], "unmeasured")
        self.assertEqual([item["dataset"] for item in scaffolding["exclusions"]], ["sandpiper"])
        self.assertFalse(json.loads((combined / "pooling_compatibility.json").read_text())["eligible"])
        rows = [json.loads(line) for line in (combined / "observations.jsonl").read_text().splitlines()]
        self.assertEqual(len(rows), 8)
        self.assertEqual(rows[2]["inferred_annotations"][0]["basis"], "inferred")
        self.assertEqual(rows[2]["utterance"]["role"], "Tutor")
        self.assertEqual(rows[0]["assistance_stages"], {stage: "not_recorded" for stage in STAGES})


if __name__ == "__main__":
    unittest.main()
