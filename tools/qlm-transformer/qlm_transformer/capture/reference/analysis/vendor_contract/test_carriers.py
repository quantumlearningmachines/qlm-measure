import json
import unittest
from build_examples import example
from carrier_fragments import KEY, fragment, extract


class FragmentTests(unittest.TestCase):
    def test_all_three_carriers_preserve_all_three_contracts(self):
        for stage in ["requested", "generated", "displayed"]:
            for carrier in ["xapi", "caliper_event", "learnlog_sidecar"]:
                with self.subTest(stage=stage, carrier=carrier):
                    record = example(stage)
                    encoded = fragment(carrier, record, "urn:learnlog:synthetic:host")
                    self.assertEqual(record, extract(carrier, json.loads(json.dumps(encoded))))

    def test_xapi_uses_context_extension(self):
        self.assertIn(KEY, fragment("xapi", example("requested"))["context"]["extensions"])

    def test_caliper_uses_event_extension_not_envelope(self):
        encoded = fragment("caliper_event", example("generated"))
        self.assertEqual(set(encoded), {"extensions"})
        self.assertNotIn("data", encoded)

    def test_no_host_actor_or_time_invented(self):
        for carrier in ["xapi", "caliper_event", "learnlog_sidecar"]:
            encoded = fragment(carrier, example("displayed"), "urn:learnlog:synthetic:host")
            self.assertFalse({"actor", "timestamp", "eventTime", "sendTime"} & set(encoded))

    def test_sidecar_requires_traceable_host_reference(self):
        with self.assertRaisesRegex(ValueError, "host record reference"):
            fragment("learnlog_sidecar", example("displayed"))

    def test_sidecar_extraction_requires_traceable_host_reference(self):
        for invalid in [None, "", " ", "relative-host"]:
            encoded = {"assistance_capture": example("displayed")}
            if invalid is not None:
                encoded["host_record_reference"] = invalid
            with self.subTest(reference=invalid):
                with self.assertRaisesRegex(ValueError, "host record reference"):
                    extract("learnlog_sidecar", encoded)

    def test_does_not_mutate_input(self):
        record = example("requested")
        encoded = fragment("xapi", record)
        encoded["context"]["extensions"][KEY]["assistance"]["label"] = "changed"
        self.assertEqual(record["assistance"]["label"], "hint")

    def test_rejects_invalid_contract_before_binding(self):
        record = example("requested")
        record["assistance"]["lifecycle"]["evidence_refs"] = ["missing"]
        with self.assertRaisesRegex(ValueError, "Unresolved"):
            fragment("xapi", record)

    def test_unknown_carrier_rejected(self):
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            fragment("caliper_envelope", example("requested"))


if __name__ == "__main__":
    unittest.main()
