from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
import unittest

from jsonschema import Draft7Validator
from build_examples import example, missing, observed
from build_bindings import carrier_example, profile, draft7_schema
from carrier_bindings import (KEY, IMPORT, PROFILE_VERSION, CREATE, xapi_statement,
    caliper_event, caliper_envelope, extract_xapi, extract_caliper,
    extract_caliper_envelope, validate_xapi, validate_caliper,
    validate_caliper_envelope, capture_digest, resource_id)
from validate_contract import SCHEMA, FORMATS, validate

IMPORTER = "https://example.org/learnlog/tests/importer"
SENSOR = "https://example.org/learnlog/tests/sensor"
ACCOUNT_HOMEPAGE = "https://example.org/learnlog/tests/account-system"
ACCOUNT_NAME = "synthetic-assistance-importer"
HOST_TIME = "2026-10-17T21:00:00.123Z"


class FullBindingTests(unittest.TestCase):
    def setUp(self):
        self.capture = carrier_example("generated")
        self.xapi = xapi_statement(self.capture, IMPORTER, HOST_TIME, account_homepage=ACCOUNT_HOMEPAGE, account_name=ACCOUNT_NAME)
        self.caliper = caliper_event(self.capture, IMPORTER, HOST_TIME)

    def test_full_records_roundtrip_three_lifecycles(self):
        for stage in ["requested", "generated", "displayed"]:
            capture = carrier_example(stage)
            xapi = xapi_statement(capture, IMPORTER, HOST_TIME, account_homepage=ACCOUNT_HOMEPAGE, account_name=ACCOUNT_NAME)
            caliper = caliper_event(capture, IMPORTER, HOST_TIME)
            envelope = caliper_envelope([caliper], SENSOR, HOST_TIME)
            for decoded in [extract_xapi(json.loads(json.dumps(xapi))), extract_caliper(json.loads(json.dumps(caliper))), extract_caliper_envelope(json.loads(json.dumps(envelope)))[0]]:
                self.assertEqual(decoded, capture)

    def test_all_five_lifecycle_states_supported_without_inferred_transitions(self):
        for stage in ["requested", "generated", "transmitted", "displayed", "accepted"]:
            capture = example(stage)
            self.assertEqual(stage, extract_xapi(xapi_statement(capture, IMPORTER, HOST_TIME, account_homepage=ACCOUNT_HOMEPAGE, account_name=ACCOUNT_NAME))["assistance"]["lifecycle"]["value"])

    def test_native_time_unknown_stays_unknown(self):
        for carrier in [extract_xapi(self.xapi), extract_caliper(self.caliper)]:
            self.assertEqual("unknown", carrier["assistance"]["event_time"]["utc"]["state"])
            self.assertNotIn("value", carrier["assistance"]["event_time"]["utc"])
        self.assertEqual(HOST_TIME, self.xapi["timestamp"])
        self.assertEqual(HOST_TIME, self.caliper["eventTime"])

    def test_anonymous_source_does_not_create_learner_actor(self):
        self.assertNotIn("subject", self.capture)
        self.assertEqual(ACCOUNT_HOMEPAGE, self.xapi["actor"]["account"]["homePage"])
        self.assertEqual({"id": IMPORTER, "type": "SoftwareApplication"}, self.caliper["actor"])
        self.assertEqual("Created", self.caliper["action"])
        self.assertEqual(CREATE, self.xapi["verb"]["id"])

    def test_unknown_lifecycle_is_transportable_without_asserting_stage(self):
        capture = deepcopy(self.capture)
        capture["assistance"]["lifecycle"] = missing("unknown", "Source lifecycle unresolved")
        self.assertEqual(capture, extract_xapi(xapi_statement(capture, IMPORTER, HOST_TIME, account_homepage=ACCOUNT_HOMEPAGE, account_name=ACCOUNT_NAME)))

    def test_importer_identity_and_time_are_required(self):
        for constructor in [xapi_statement, caliper_event]:
            for importer, time in [(None, HOST_TIME), ("relative", HOST_TIME), (IMPORTER, None), (IMPORTER, "2026-01-01T12:00:00")]:
                with self.subTest(constructor=constructor.__name__, importer=importer, time=time):
                    with self.assertRaises((ValueError, TypeError)):
                        constructor(self.capture, importer, time, **({"account_homepage": ACCOUNT_HOMEPAGE, "account_name": ACCOUNT_NAME} if constructor is xapi_statement else {}))

    def test_host_time_offset_normalized_without_replacing_source_clock(self):
        event = caliper_event(self.capture, IMPORTER, "2026-10-17T23:00:00.123+02:00")
        self.assertEqual(HOST_TIME, event["eventTime"])
        self.assertEqual(self.capture, extract_caliper(event))

    def test_submillisecond_precision_not_silently_truncated(self):
        for time in ["2026-10-17T21:00:00.123456Z", "2026-10-17T21:00:00.0000001Z", "2026-10-17T21:00:00.1230001Z"]:
            with self.subTest(time=time):
                with self.assertRaisesRegex(ValueError, "millisecond precision"):
                    caliper_event(self.capture, IMPORTER, time)
        event = caliper_event(self.capture, IMPORTER, "2026-10-17T21:00:00.1230000Z")
        self.assertEqual(HOST_TIME, event["eventTime"])

    def test_source_identity_scope_and_content_control_resource_identity(self):
        first = example("requested")
        second = deepcopy(first)
        second["record_id"]["scope"] += ":other-source"
        self.assertNotEqual(resource_id(first), resource_id(second))
        second = deepcopy(first)
        second["assistance"]["label"] = "different native label"
        self.assertNotEqual(resource_id(first), resource_id(second))

    def test_replay_stable_but_new_import_time_distinct(self):
        self.assertEqual(self.xapi, xapi_statement(self.capture, IMPORTER, HOST_TIME, account_homepage=ACCOUNT_HOMEPAGE, account_name=ACCOUNT_NAME))
        later = xapi_statement(self.capture, IMPORTER, "2026-10-17T21:00:01.123Z", account_homepage=ACCOUNT_HOMEPAGE, account_name=ACCOUNT_NAME)
        self.assertNotEqual(self.xapi["id"], later["id"])
        self.assertEqual(self.xapi["object"]["id"], later["object"]["id"])

    def test_object_key_order_does_not_change_digest(self):
        self.assertEqual(capture_digest(self.capture), capture_digest(dict(reversed(list(self.capture.items())))))

    def test_no_source_or_carrier_mutation(self):
        before = deepcopy(self.capture)
        encoded = xapi_statement(self.capture, IMPORTER, HOST_TIME, account_homepage=ACCOUNT_HOMEPAGE, account_name=ACCOUNT_NAME)
        decoded = extract_xapi(encoded)
        decoded["assistance"]["label"] = "changed"
        self.assertEqual(before, self.capture)
        self.assertEqual(before, extract_xapi(encoded))

    def test_payload_tampering_rejected_even_when_schema_valid(self):
        for carrier, validator, extension_path in [(self.xapi, validate_xapi, ["context", "extensions"]), (self.caliper, validate_caliper, ["extensions"])]:
            changed = deepcopy(carrier)
            extensions = changed
            for key in extension_path:
                extensions = extensions[key]
            extensions[KEY]["assistance"]["label"] = "tampered label"
            with self.assertRaisesRegex(ValueError, "does not agree"):
                validator(changed)

    def test_missing_contract_or_metadata_rejected(self):
        for extension_key in [KEY, IMPORT]:
            for carrier, validator, path in [(self.xapi, validate_xapi, ["context", "extensions"]), (self.caliper, validate_caliper, ["extensions"])]:
                changed = deepcopy(carrier)
                extensions = changed
                for key in path:
                    extensions = extensions[key]
                del extensions[extension_key]
                with self.assertRaises(ValueError):
                    validator(changed)

    def test_xapi_identity_actor_time_and_verb_mismatch_rejected(self):
        mutations = [lambda item: item["actor"]["account"].update(homePage="https://example.org/learner"),
            lambda item: item.update(timestamp="2026-01-01T12:00:00.000Z"),
            lambda item: item["verb"].update(id="https://example.org/requested-help"),
            lambda item: item["object"].update(id="urn:other:record"),
            lambda item: item["context"]["contextActivities"]["category"][0].update(id="urn:other:profile"),
            lambda item: item.update(id="b3e96888-f88f-4a4a-bd68-2b90154ed2b9")]
        for mutate in mutations:
            changed = deepcopy(self.xapi)
            mutate(changed)
            with self.assertRaises(ValueError):
                validate_xapi(changed)

    def test_caliper_learner_and_tool_use_inferences_rejected(self):
        mutations = [lambda item: item["actor"].update(type="Person"),
            lambda item: item.update(action="Used", type="ToolUseEvent", profile="ToolUseProfile"),
            lambda item: item.update(eventTime="2026-01-01T12:00:00.000Z"),
            lambda item: item.update(eventTime="2026-10-17T21:00:00.123+00:00"),
            lambda item: item["object"].update(id="urn:other:record"),
            lambda item: item.update(id="urn:uuid:b3e96888-f88f-4a4a-bd68-2b90154ed2b9")]
        for mutate in mutations:
            changed = deepcopy(self.caliper)
            mutate(changed)
            with self.assertRaises(ValueError):
                validate_caliper(changed)

    def test_envelope_has_only_four_standard_fields_and_event_extensions(self):
        envelope = caliper_envelope([self.caliper], SENSOR, HOST_TIME)
        self.assertEqual({"sensor", "sendTime", "dataVersion", "data"}, set(envelope))
        self.assertIn(KEY, envelope["data"][0]["extensions"])
        envelope["extensions"] = {KEY: self.capture}
        with self.assertRaisesRegex(ValueError, "no custom"):
            validate_caliper_envelope(envelope)

    def test_envelope_rejects_duplicate_event_and_send_before_create(self):
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            caliper_envelope([self.caliper, self.caliper], SENSOR, HOST_TIME)
        with self.assertRaisesRegex(ValueError, "precedes"):
            caliper_envelope([self.caliper], SENSOR, "2026-10-17T20:00:00.123Z")

    def test_envelope_batch_preserves_order_and_source_scope(self):
        capture = example("requested")
        second = caliper_event(capture, IMPORTER, HOST_TIME)
        envelope = caliper_envelope([self.caliper, second], SENSOR, HOST_TIME)
        self.assertEqual([self.capture, capture], extract_caliper_envelope(envelope))

    def test_unknown_zero_corruption_rejected_before_encoding(self):
        self.capture["assistance"]["event_time"]["utc"]["value"] = 0
        with self.assertRaises(Exception):
            xapi_statement(self.capture, IMPORTER, HOST_TIME, account_homepage=ACCOUNT_HOMEPAGE, account_name=ACCOUNT_NAME)

    def test_observation_cannot_assert_explicitly_absent_capture_hook(self):
        for capability in [observed(False, "Fixture declares no hook"), missing("not_collected", "Fixture declares no hook")]:
            capture = example("displayed")
            capture["capture"]["capabilities"]["displayed"] = capability
            with self.assertRaisesRegex(ValueError, "contradicts"):
                validate(capture)

    def test_submicrosecond_source_clock_not_truncated_into_window(self):
        capture = example("displayed")
        capture["capture"]["window"]["end"]["value"] = "2026-01-01T12:00:00.0000000Z"
        capture["assistance"]["event_time"]["utc"]["value"] = "2026-01-01T12:00:00.0000001Z"
        with self.assertRaises(Exception):
            validate(capture)

    def test_profile_reuses_create_and_defines_no_assistance_verbs(self):
        result = profile(HOST_TIME)
        self.assertIn({"location": "$.verb.id", "presence": "included", "any": [CREATE]}, result["templates"][0]["rules"])
        self.assertNotIn("verb", result["templates"][0])
        self.assertFalse(any(item["type"] == "Verb" for item in result["concepts"]))
        self.assertEqual(3, len(result["concepts"]))

    def test_inline_schemas_are_valid_draft7_and_validate_examples(self):
        result = profile(HOST_TIME)
        for concept in result["concepts"]:
            if "inlineSchema" in concept:
                schema = json.loads(concept["inlineSchema"])
                Draft7Validator.check_schema(schema)
                validator = Draft7Validator(schema, format_checker=FORMATS)
                validator.validate(self.xapi["context"]["extensions"][concept["id"]])

    def test_draft7_translation_preserves_unknown_rejection(self):
        converted = draft7_schema(deepcopy(SCHEMA))
        converted["$schema"] = "http://json-schema.org/draft-07/schema#"
        self.capture["assistance"]["event_time"]["utc"]["value"] = 0
        self.assertFalse(Draft7Validator(converted, format_checker=FORMATS).is_valid(self.capture))

    def test_lrs_stored_version_may_be_retained_without_overriding_source(self):
        self.xapi.update(stored="2026-10-17T21:00:01.123Z", version="1.0.0")
        self.assertEqual(self.capture, extract_xapi(self.xapi))
        self.xapi["version"] = "2.0.0"
        with self.assertRaisesRegex(ValueError, "Statement versions 1.0.x"):
            validate_xapi(self.xapi)

    def test_authority_shape_is_checked_but_not_authenticated(self):
        for authority in ["not-an-Agent", {"objectType": "Agent"}, {"objectType": "Agent", "account": "invalid"}, {"mbox": "not-an-email"}, {"mbox": "mailto:a@example.org", "openid": "https://example.org/id"}, {"objectType": "Group", "member": []}]:
            changed = deepcopy(self.xapi)
            changed["authority"] = authority
            with self.subTest(authority=authority):
                with self.assertRaises(ValueError):
                    validate_xapi(changed)
        self.xapi["authority"] = {"objectType": "Agent", "account": {"homePage": "https://example.org/test-lrs", "name": "test-authority"}}
        self.assertEqual(self.capture, extract_xapi(self.xapi))

    def test_complete_fixture_files_match_exact_roundtrips(self):
        path = Path(__file__).parent / "examples" / "carriers" / "demo-bindings.json"
        data = json.loads(path.read_text())
        datetime.fromisoformat(data["provenance"]["generated_at"].replace("Z", "+00:00"))
        for fixture in data["examples"].values():
            self.assertEqual(fixture["assistance_capture"], extract_xapi(fixture["xapi_statement"]))
            self.assertEqual(fixture["assistance_capture"], extract_caliper(fixture["caliper_event"]))
            self.assertEqual([fixture["assistance_capture"]], extract_caliper_envelope(fixture["caliper_envelope"]))


if __name__ == "__main__":
    unittest.main()
