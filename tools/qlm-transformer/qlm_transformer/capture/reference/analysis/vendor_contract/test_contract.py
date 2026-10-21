import copy
import unittest
from jsonschema import Draft202012Validator, ValidationError
from build_examples import example, missing
from validate_contract import SCHEMA, validate


class ContractTests(unittest.TestCase):
    def setUp(self):
        self.record = example("displayed")

    def test_schema_is_valid_2020_12(self):
        Draft202012Validator.check_schema(SCHEMA)

    def test_three_hints_are_distinct_observations(self):
        records = [validate(example(stage)) for stage in ["requested", "generated", "displayed"]]
        self.assertEqual({r["assistance"]["label"] for r in records}, {"hint"})
        self.assertEqual(len({r["assistance"]["lifecycle"]["value"] for r in records}), 3)

    def test_anonymous_events_are_permitted(self):
        self.assertNotIn("subject", validate(self.record))

    def test_raw_prompt_is_not_required_or_implicitly_accepted(self):
        validate(self.record)
        self.record["raw_prompt"] = "Unnecessary sensitive content"
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_missing_is_not_zero(self):
        self.record["source"]["model_version"]["value"] = 0
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_unknown_is_not_false(self):
        self.record["capture"]["capabilities"]["requested"] = {"state": "unknown", "reason": "Evidence unresolved.", "evidence_refs": [], "value": False}
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_observed_requires_evidence(self):
        self.record["assistance"]["lifecycle"]["evidence_refs"] = []
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_not_reported_requires_bounded_evidence(self):
        self.record["source"]["model_version"]["evidence_refs"] = []
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_not_reported_requires_actual_review_scope(self):
        del self.record["source"]["model_version"]["review_scope"]
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_not_collected_requires_instrumentation_basis(self):
        del self.record["capture"]["capabilities"]["requested"]["capture_basis"]
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_not_reviewed_is_distinct_and_permitted(self):
        self.assertEqual(validate(self.record)["provenance"]["mapping_review"]["state"], "not_reviewed")

    def test_unresolved_evidence_rejected(self):
        self.record["assistance"]["lifecycle"]["evidence_refs"] = ["not-an-evidence-id"]
        with self.assertRaisesRegex(ValueError, "Unresolved"):
            validate(self.record)

    def test_duplicate_evidence_rejected(self):
        self.record["evidence"].append(copy.deepcopy(self.record["evidence"][0]))
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            validate(self.record)

    def test_display_cannot_be_encoded_as_learned(self):
        self.record["assistance"]["lifecycle"]["value"] = "learned"
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_derived_label_requires_method(self):
        self.record["derived_labels"] = [{"label": "hint_depth", "value": 2, "evidence_refs": ["native"]}]
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_source_clock_and_import_clock_cannot_be_substituted(self):
        self.record["assistance"]["event_time"]["utc"] = missing("not_reported", "No absolute clock reported.")
        validate(self.record)
        self.record["assistance"]["event_time"]["utc"]["value"] = "2026-01-01T12:00:00Z"
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_complete_coverage_requires_window(self):
        self.record["capture"]["coverage"]["value"] = "complete_within_boundary"
        self.record["capture"]["window"]["start"] = {"state": "unknown", "reason": "Clock unavailable.", "evidence_refs": []}
        with self.assertRaisesRegex(ValueError, "known observation window"):
            validate(self.record)

    def test_complete_coverage_requires_capability_for_boundary(self):
        self.record["capture"]["coverage"]["value"] = "complete_within_boundary"
        self.record["capture"]["boundary"]["event_classes"].append("requested")
        with self.assertRaisesRegex(ValueError, "declared instrumentation"):
            validate(self.record)

    def test_reversed_window_rejected(self):
        self.record["capture"]["window"]["start"]["value"] = "2027-01-01T00:00:00Z"
        with self.assertRaisesRegex(ValueError, "reversed"):
            validate(self.record)

    def test_observed_stage_outside_declared_boundary_rejected(self):
        self.record["capture"]["boundary"]["event_classes"] = ["requested"]
        with self.assertRaisesRegex(ValueError, "outside the declared capture boundary"):
            validate(self.record)

    def test_observed_native_time_outside_window_rejected(self):
        self.record["assistance"]["event_time"]["utc"]["value"] = "2026-01-02T12:00:00Z"
        with self.assertRaisesRegex(ValueError, "outside the capture window"):
            validate(self.record)

    def test_invalid_timestamp_rejected(self):
        self.record["assistance"]["event_time"]["utc"]["value"] = "yesterday"
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_present_identity_requires_scope(self):
        self.record["subject"] = {"local_id": "learner-1"}
        with self.assertRaises(ValidationError):
            validate(self.record)

    def test_schema_cannot_authenticate_a_false_but_well_formed_claim(self):
        self.record["assistance"]["lifecycle"]["reason"] = "Unsupported claim deliberately used to show the validator's limit."
        validate(self.record)  # Truth and evidence quality require an external check.


if __name__ == "__main__":
    unittest.main()
