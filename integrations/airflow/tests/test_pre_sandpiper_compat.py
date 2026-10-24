"""Backward compatibility: documents written before the sandpiper source existed.

The fixtures in tests/fixtures/pre-sandpiper are real outputs of adapt() at the
commit named in their MANIFEST.json, made before any sandpiper code was added.
"""
import hashlib
import json
from pathlib import Path
import unittest

from qlm_transformer.core import verify
from qlm_airflow.pipeline import parse_rows
from qlm_airflow.research_adapters import adapt, verify_import_document, _rechain
from qlm_airflow.semantics import binding, resource

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT / "tests/fixtures/pre-sandpiper"


def without_salt(event):
    return {k: v for k, v in event.items() if k != "salt"}


class PreSandpiperCompatibilityTests(unittest.TestCase):
    """Written first, against real outputs of the code as it was before sandpiper."""

    def manifest(self):
        return json.loads((LEGACY / "MANIFEST.json").read_text())

    def test_manifest_lists_real_outputs_for_all_three_existing_sources(self):
        manifest = self.manifest()
        self.assertEqual(manifest["adapter_version"], "0.4.0-research-adapters")
        self.assertRegex(manifest["generator_commit"], "^[0-9a-f]{40}$")
        self.assertEqual({d["platform"] for d in manifest["documents"]}, {"tutormoments", "oatutor", "explicit-assistance-events"})
        self.assertEqual(len(manifest["documents"]), 6)
        for item in manifest["documents"]:
            text = (LEGACY / item["file"]).read_bytes()
            self.assertEqual(hashlib.sha256(text).hexdigest(), item["sha256"], item["file"])

    def test_every_pre_sandpiper_document_still_verifies_with_its_recorded_heads(self):
        for item in self.manifest()["documents"]:
            with self.subTest(file=item["file"]):
                document = json.loads((LEGACY / item["file"]).read_text())
                self.assertEqual(verify_import_document(document, item["heads"]), item["heads"])
                self.assertEqual(len(document["records"]), item["records"])
                for record in document["records"]:
                    self.assertEqual(record["header"]["semantic_profile_binding"]["id"], "qlm:assistance-context:0.1.0")
                    self.assertEqual(record["header"]["source_kind"], item["source_kind"])

    def test_existing_sources_produce_the_same_documents_as_before(self):
        manifest = self.manifest()
        key = manifest["pseudonym_key_utf8"].encode()
        for item in manifest["documents"]:
            with self.subTest(file=item["file"]):
                before = json.loads((LEGACY / item["file"]).read_text())
                path = ROOT.parents[1] / item["input"]
                if not path.exists():
                    self.skipTest("source sample outside the standalone package")
                raw = path.read_bytes() + (b"\n" if item["input_byte_changed"] else b"")
                prof = json.loads((ROOT / "profiles" / (item["platform"] + ".json")).read_text())
                after, status = adapt(parse_rows(raw, path.suffix), raw, prof, key, manifest["tenant"], manifest["imported_at"])
                self.assertEqual(status["sourceKind"], item["source_kind"])
                self.assertEqual(len(after["records"]), len(before["records"]))
                for old, new in zip(before["records"], after["records"]):
                    self.assertEqual({k: v for k, v in new["header"].items() if k != "record_id"},
                                     {k: v for k, v in old["header"].items() if k != "record_id"})
                    self.assertEqual(new["event_schemas"], old["event_schemas"])
                    self.assertEqual([without_salt(e["event"]) for e in new["entries"]], [without_salt(e["event"]) for e in old["entries"]])

    def test_an_old_document_tampered_after_the_upgrade_is_still_rejected(self):
        document = json.loads((LEGACY / "oatutor.learnlog.json").read_text())
        record = document["records"][0]
        record["header"]["semantic_profile_binding"] = binding(resource("assistance-context-v0.2.0.json"))
        _rechain(record)
        verify(document)
        with self.assertRaisesRegex(ValueError, "semantic profile"):
            verify_import_document(document)


if __name__ == "__main__":
    unittest.main()
