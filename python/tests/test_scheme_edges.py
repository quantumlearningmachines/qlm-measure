"""Branches the chain vectors never reach, and the schema errors each scheme reports, which must read
the same as in TypeScript (test/scheme-validators.test.ts holds the same table)."""
import math

import pytest

from qlm_measure.schemes import (
    SCHEMES, canonicalize_rfc8785, detect_scheme, js_json_dumps, js_number, js_string, js_string_of, seal_event, sort_object_locale,
    verify_chain,
)

EMPTY_EVENT_ERRORS = {
    "tpc/clinical-v4": ["invalid type: undefined", "missing learner", "missing encounter", "invalid turn: undefined", "missing construct", "invalid signal: undefined", "invalid scaffold: undefined", "invalid confidence: undefined", "invalid event_kind: undefined", "payload must be an object"],
    "tpc/clinical-v3": ["invalid type: undefined", "missing learner", "missing encounter", "invalid turn: undefined", "missing construct", "invalid signal: undefined", "invalid scaffold: undefined", "invalid confidence: undefined"],
    "tpc/clinical-v2": ["invalid type: undefined", "missing learner", "missing encounter", "invalid turn: undefined", "missing construct", "invalid signal: undefined", "invalid scaffold: undefined", "invalid confidence: undefined"],
    "tpc/clinical-v1": ["invalid type: undefined", "missing learner", "missing encounter", "invalid turn: undefined", "missing construct", "invalid signal: undefined", "invalid scaffold: undefined", "invalid confidence: undefined"],
    "play/clinical-clin-1.0": ["invalid schemaVersion: undefined", "missing eventId", "missing ts", "missing encounterId", "missing type"],
    "play/emit-1": ["missing student_id", "missing product", "missing construct", "missing signal"],
    "play/measure-session-1": ["missing studyId", "missing sessionId"],
    "play/encounter-sha256-1": ["missing eventId", "missing ts", "missing encounterId", "missing type"],
    "play/encounter-fnv64-1": ["missing eventId", "missing ts", "missing encounterId", "missing type"],
    "play/research-provenance-1": ["missing designLayer", "missing runtimeLayer"],
    "qcore/qinverse-djb2-1": ["missing eventId", "missing sequence"],
    "studio/loop-1": ["missing sessionId", "missing participantId", "missing stage", "missing event", "missing at"],
    "dp/ledger-v3": ["missing eventId", "missing tenantId", "missing sessionId", "missing eventType", "missing eventSeq"],
    "tpc/dse-journal-1": ["missing seq", "missing eventType"],
    "yardstick/spine-1": ["missing enrollment_id", "missing item_id"],
    "labpath/learning-evidence-v1": ["missing event_id", "missing learner_id", "missing ts", "missing world_id", "missing session_id"],
    "tpc/transcript-1": ["missing transcript"],
    "tpc/differential-commit-2": ["missing learner", "missing encounter", "missing checkpoint", "invalid commit_schema: undefined", "rankedDifferential must be 1 to 5 non-empty strings", "whyText must be a string", "nextAction must be a string or null", "invalid discipline: undefined", "concepts must hold one concept id or null per ranked entry", "statuses must hold one of leading, active, ruled_out per ranked entry", "confidence must hold one number 0 to 100 or null per ranked entry", "captureSnapshot must be an array of non-empty strings", "evidenceLinks must be an array", "invalid discriminator", "planLinks must be an array", "trigger must be a non-empty string or null", "supersedes must be a hash or null"],
    "tpc/differential-commit-1": ["missing learner", "missing encounter", "missing checkpoint"],
    "tpc/rct-input-1": ["missing studyId"],
    "play/world-trace-identity-1": ["missing seq", "missing type", "missing prevHash", "payload must be an object"],
    "play/world-trace-tsim-1": ["missing seq", "missing type", "missing prevHash", "payload must be an object"],
    "play/world-trace-1": ["missing seq", "missing type", "missing prevHash", "payload must be an object"],
    "tpc/yardstick-record-2": ["missing sequence", "missing type", "missing studyId", "missing timestamp", "payload must be an object"],
    "tpc/yardstick-record-1": ["missing sequence", "missing type", "missing studyId", "missing timestamp", "payload must be an object"],
    "tpc/intervention-1": ["missing flagId", "missing actor", "missing actionType", "missing constructId", "missing timestamp"],
    "tpc/rehearsal-stage-1": ["missing stage", "missing passed", "missing timestamp"],
    "yardstick/activity-1": ["missing seq", "missing at", "missing who", "missing action"],
    "yardstick/depth-1": ["missing seq", "missing learner", "missing construct", "missing event", "missing at", "missing kind"],
}


def test_every_scheme_reports_the_same_errors_for_an_empty_event_as_typescript():
    assert sorted(SCHEMES) == sorted(EMPTY_EVENT_ERRORS)
    for scheme_id, errors in EMPTY_EVENT_ERRORS.items():
        assert SCHEMES[scheme_id].validate({}) == errors, scheme_id


def test_numbers_and_strings_serialize_as_javascript_does():
    assert [js_number(True), js_number(False), js_number(math.nan), js_number(math.inf), js_number(-0.0)] == ["true", "false", "null", "null", "0"]
    assert js_string("\b\f\n\r\t\x01\ud800\"\\é") == '"\\b\\f\\n\\r\\t\\u0001\\ud800\\"\\\\é"'
    with pytest.raises(TypeError, match="not JSON-shaped: set"):
        js_json_dumps({1})
    assert js_string_of(None) == "null"


def test_the_rfc_8785_form_refuses_what_json_cannot_hold():
    with pytest.raises(TypeError, match="Unserializable type: set"):
        canonicalize_rfc8785({1})
    with pytest.raises(ValueError, match="Non-finite number in canonical event"):
        SCHEMES["yardstick/depth-1"].canonical({"scheme": "yardstick/depth-1", "x": math.inf})


def test_product_canonical_forms_keep_extra_keys_and_sort_digits_first():
    base = {"eventId": "a", "tenantId": "t", "sessionId": "s", "eventType": "x", "eventSeq": 1}
    assert '"extra":1' in SCHEMES["dp/ledger-v3"].canonical({**base, "extra": 1})
    assert SCHEMES["dp/ledger-v3"].canonical({**base, "receivedAt": "r"}) == SCHEMES["dp/ledger-v3"].canonical(base)
    assert list(sort_object_locale({"b": 1, "1": 2, "_": 3})) == ["_", "1", "b"]


def test_commit_errors_show_an_object_as_javascript_does():
    assert "invalid commit_schema: [object Object]" in SCHEMES["tpc/differential-commit-2"].validate({"commit_schema": {}})


def test_detection_returns_none_when_no_scheme_matches():
    assert detect_scheme({"eventId": "e", "eventHash": "nope"}, "play/encounter") is None


def test_verify_chain_skips_the_duplicate_check_for_an_event_with_no_hash():
    first = seal_event({"eventId": "a", "tenantId": "t", "sessionId": "s", "eventType": "x", "eventSeq": 1}, "dp/ledger-v3")
    r = verify_chain([{k: v for k, v in first.items() if k != "eventHash"}], scheme="dp/ledger-v3")
    assert r.clean is False
    assert verify_chain([first], scheme="dp/ledger-v3").clean is True


def test_yardstick_depth_checks_each_kinds_own_fields():
    v = SCHEMES["yardstick/depth-1"].validate
    common = {"seq": 1, "learner": "l", "construct": "c", "event": "e", "at": "2026-10-10T00:00:00.000000Z"}
    evidence = {**common, "kind": "evidence", "scaffold": "s", "directiveness": 0, "is_probe": False}
    assert v(evidence) == []
    assert v({**evidence, "item": 3, "session": 4}) == ["invalid item", "invalid session"]
    assert v({**evidence, "params": None}) == ["invalid params"]
    assert v({**evidence, "params": [1]}) == ["invalid params"]
    assert v({**evidence, "params": {"guess": "x", "slip": 0.1}}) == ["invalid params"]
    assert v({**evidence, "params": {"guess": 0.2, "slip": 0.1}}) == []
    verification = {**common, "kind": "verification", "check": "c", "answered": common["at"], "fired": common["at"], "source": "need", "outcome": "pass", "helped": False, "decision_hash": "h"}
    assert v(verification) == []
    assert v({**verification, "decision_hash": ""}) == ["invalid decision_hash"]
