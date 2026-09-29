"""Chain schemes: Python must verify and re-seal the same vectors as TypeScript."""
import json
from pathlib import Path

import pytest

from qlm_measure.schemes import (
    compute_event_hash, detect_scheme, get_scheme, js_json_dumps, list_schemes, seal_event, verify_chain,
)

VEC = Path(__file__).resolve().parents[2] / "schema" / "vectors" / "chains"
VECTORS = sorted(VEC.glob("*.json"))


@pytest.mark.parametrize("path", VECTORS, ids=[p.stem for p in VECTORS])
def test_vector_verifies(path):
    v = json.loads(path.read_text())
    r = verify_chain(v["events"], family=v["family"])
    assert r.clean is v["expect"]["clean"]
    assert r.stats["hash_scheme"] == v["expect"]["hash_scheme"]
    if "tampered" in v["expect"]:
        assert r.stats["tampered"] == v["expect"]["tampered"]
        assert any(e.startswith(f"[{v['expect']['tampered_index']}] hash mismatch") for e in r.errors)
    if "schemes" in v["expect"]:
        assert r.stats["schemes"] == v["expect"]["schemes"]


@pytest.mark.parametrize("path", [p for p in VECTORS if "tampered" not in p.stem], ids=[p.stem for p in VECTORS if "tampered" not in p.stem])
def test_vector_reseals_byte_for_byte(path):
    v = json.loads(path.read_text())
    fam = get_scheme(v["scheme"])
    for i, e in enumerate(v["events"]):
        prev = (fam.genesis if fam.genesis is not None else "") if i == 0 else str(v["events"][i - 1][fam.hash_field])
        sid = detect_scheme(e, v["family"], prev=prev)
        assert sid is not None
        scheme = get_scheme(sid)
        rest = {k: x for k, x in e.items() if k != scheme.hash_field}
        assert compute_event_hash(rest, sid, prev=prev) == e[scheme.hash_field]
        assert seal_event(rest, sid, prev=prev)[scheme.hash_field] == e[scheme.hash_field]


def test_registry_order_matches_typescript():
    ids = [s["id"] for s in list_schemes()]
    assert ids[:5] == ["tpc/clinical-v4", "tpc/clinical-v3", "tpc/clinical-v2", "tpc/clinical-v1", "play/clinical-clin-1.0"]
    assert ids[5:] == ["play/emit-1", "play/measure-session-1", "play/encounter-fnv64-1", "play/research-provenance-1",
                       "qcore/qinverse-djb2-1", "studio/loop-1", "dp/ledger-v3", "tpc/dse-journal-1", "yardstick/spine-1",
                       "labpath/learning-evidence-v1", "tpc/transcript-1", "tpc/differential-commit-2", "tpc/differential-commit-1",
                       "tpc/rct-input-1", "play/world-trace-identity-1", "play/world-trace-tsim-1", "play/world-trace-1",
                       "tpc/yardstick-record-2", "tpc/yardstick-record-1", "tpc/intervention-1", "tpc/rehearsal-stage-1", "yardstick/activity-1"]
    assert len(ids) == 27 and len({s["family"] for s in list_schemes()}) == 19


# tpc/differential-commit-2 (TPC-SPEC-002 E4): the same record, canonical string and errors as the TypeScript tests.
_COMMIT_GOOD = {
    "type": "differential_commit", "learner": "l", "encounter": "e", "turn": 0, "checkpoint": "on_evidence", "rankedDifferential": ["a", "b"],
    "whyText": "w", "nextAction": None, "discipline": "GM", "prev_hash": "genesis", "commit_schema": 2, "concepts": ["c.a", None],
    "statuses": ["leading", "ruled_out"], "confidence": [70, None], "evidenceLinks": [{"ref": "x", "direction": "against", "rank": 2}],
    "discriminator": {"text": "t", "ref": None, "kind": "time"}, "planLinks": [{"ref": "p", "rank": 1}], "trigger": "learner",
    "captureSnapshot": ["x"], "supersedes": None,
}


def test_commit_2_canonical_matches_typescript():
    assert get_scheme("tpc/differential-commit-2").canonical(_COMMIT_GOOD, None) == (
        '["differential_commit","l","e","on_evidence",["a","b"],"w",null,"GM","genesis",2,["c.a",null],["leading","ruled_out"],[70,null],'
        '[{"direction":"against","rank":2,"ref":"x"}],{"kind":"time","ref":null,"text":"t"},[{"rank":1,"ref":"p"}],"learner",["x"],null]')


def test_commit_schema_picks_the_version():
    v1, v2 = get_scheme("tpc/differential-commit-1"), get_scheme("tpc/differential-commit-2")
    skip = {"type": "commit_skipped", "learner": "l", "encounter": "e", "checkpoint": "pre_close", "reason": "timeout", "prev_hash": "genesis"}
    old = {k: v for k, v in _COMMIT_GOOD.items() if k != "commit_schema"}
    assert (v1.applies(_COMMIT_GOOD), v2.applies(_COMMIT_GOOD)) == (False, True)
    assert (v1.applies(old), v2.applies(old)) == (True, False)
    assert (v1.applies(skip), v2.applies(skip)) == (True, False)
    for e in ({**_COMMIT_GOOD, "commit_schema": 1}, {**_COMMIT_GOOD, "commit_schema": None}, {**skip, "commit_schema": 2}, {**_COMMIT_GOOD, "commit_schema": True}):
        assert (v1.applies(e), v2.applies(e)) == (False, False)
    assert v2.applies({**_COMMIT_GOOD, "commit_schema": 2.0})  # JSON 2.0 is the number 2, as in JavaScript
    for sid in ("tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3", "tpc/clinical-v4"):
        assert not get_scheme(sid).applies(_COMMIT_GOOD)


def test_commit_2_covers_every_field():
    sealed = seal_event(_COMMIT_GOOD, "tpc/differential-commit-2")
    assert verify_chain([sealed], family="tpc/clinical").clean
    edits = {"concepts": ["c.a", "c.b"], "statuses": ["active", "ruled_out"], "confidence": [71, None],
             "evidenceLinks": [{"ref": "x", "direction": "for", "rank": 2}], "discriminator": {"text": "t", "ref": "x", "kind": "time"},
             "planLinks": [], "trigger": "LAB-02", "captureSnapshot": ["x", "y"], "supersedes": "f" * 64}
    for f, v in edits.items():
        assert verify_chain([{**sealed, f: v}], family="tpc/clinical").stats["tampered"] == 1, f
    stripped = {k: v for k, v in sealed.items() if k != "commit_schema"}
    assert verify_chain([stripped], family="tpc/clinical").stats["tampered"] == 1


def test_commit_2_validation_matches_typescript():
    bad = {**_COMMIT_GOOD, "discipline": "nursing", "statuses": ["leading", "maybe"], "confidence": [101, None],
           "evidenceLinks": [{"rank": 0, "ref": "x", "direction": "for"}, {"rank": 1, "ref": "not-seen", "direction": "for"}],
           "discriminator": {"kind": "hunch", "ref": None, "text": "t"}, "planLinks": [{"rank": 3, "ref": "p"}], "trigger": None}
    del bad["supersedes"]
    r = verify_chain([seal_event(bad, "tpc/differential-commit-2")], scheme="tpc/differential-commit-2")
    assert r.stats["tampered"] == 0
    assert r.errors == [
        "[0] invalid discipline: nursing",
        "[0] statuses must hold one of leading, active, ruled_out per ranked entry",
        "[0] confidence must hold one number 0 to 100 or null per ranked entry",
        "[0] invalid evidenceLinks[0]",
        "[0] evidenceLinks[1] ref not in captureSnapshot: not-seen",
        "[0] invalid discriminator",
        "[0] invalid planLinks[0]",
        "[0] on_evidence needs a trigger",
        "[0] supersedes must be a hash or null",
    ]
    empty = seal_event({**_COMMIT_GOOD, "checkpoint": "after_history", "rankedDifferential": [], "concepts": [], "statuses": [], "confidence": []},
                       "tpc/differential-commit-2")
    assert verify_chain([empty], scheme="tpc/differential-commit-2").errors == [
        "[0] invalid checkpoint: after_history", "[0] rankedDifferential must be 1 to 5 non-empty strings", "[0] invalid evidenceLinks[0]",
        "[0] invalid planLinks[0]"]
    # a rank written 2.0 is the integer 2, as Number.isInteger sees it; True is not a rank
    assert verify_chain([seal_event({**_COMMIT_GOOD, "evidenceLinks": [{"ref": "x", "direction": "for", "rank": 2.0}]}, "tpc/differential-commit-2")],
                        scheme="tpc/differential-commit-2").clean
    assert verify_chain([seal_event({**_COMMIT_GOOD, "planLinks": [{"ref": "p", "rank": True}]}, "tpc/differential-commit-2")],
                        scheme="tpc/differential-commit-2").errors == ["[0] invalid planLinks[0]"]


def _commit_errs(e: dict) -> list[str]:
    return verify_chain([seal_event(e, "tpc/differential-commit-2")], scheme="tpc/differential-commit-2").errors


def _without(f: str) -> dict:
    return {k: v for k, v in _COMMIT_GOOD.items() if k != f}


def test_commit_2_wants_every_field_written():
    assert _commit_errs(_without("trigger")) == ["[0] trigger must be a non-empty string or null"]
    assert _commit_errs(_without("discriminator")) == ["[0] invalid discriminator"]
    assert _commit_errs(_without("nextAction")) == ["[0] nextAction must be a string or null"]
    assert _commit_errs({**_COMMIT_GOOD, "discriminator": {"kind": "time", "text": "t"}}) == ["[0] invalid discriminator"]
    six = {"rankedDifferential": list("abcdef"), "concepts": [None] * 6, "statuses": ["active"] * 6, "confidence": [None] * 6}
    assert _commit_errs({**_COMMIT_GOOD, **six}) == ["[0] rankedDifferential must be 1 to 5 non-empty strings"]
    assert _commit_errs({**_COMMIT_GOOD, "planLinks": [{"ref": "p", "rank": 1.5}]}) == ["[0] invalid planLinks[0]"]
    # a huge integer rank is just invalid (compared as an integer, never turned into a float)
    assert _commit_errs({**_COMMIT_GOOD, "planLinks": [{"ref": "p", "rank": 10 ** 400}]}) == ["[0] invalid planLinks[0]"]


def test_commit_2_takes_only_named_keys():
    assert _commit_errs({**_COMMIT_GOOD, "evidenceLinks": [{"ref": "x", "direction": "for", "rank": 1, "note": "n"}]}) == ["[0] invalid evidenceLinks[0]"]
    assert _commit_errs({**_COMMIT_GOOD, "planLinks": [{"ref": "p", "rank": 1, "10": 1}]}) == ["[0] invalid planLinks[0]"]
    assert _commit_errs({**_COMMIT_GOOD, "discriminator": {"kind": "time", "ref": None, "text": "t", "why": "w"}}) == ["[0] invalid discriminator"]
    proto = json.loads('{"ref":"x","direction":"for","rank":1,"__proto__":{"a":1}}')
    assert _commit_errs({**_COMMIT_GOOD, "evidenceLinks": [proto]}) == ["[0] invalid evidenceLinks[0]"]


def test_commit_1_says_why_a_commit_fits_neither_version():
    r = verify_chain([seal_event(_without("commit_schema"), "tpc/differential-commit-1")], family="tpc/clinical")
    assert r.stats["tampered"] == 0
    assert r.errors == ["[0] fields without commit_schema 2: concepts, statuses, confidence, evidenceLinks, discriminator, planLinks, trigger, "
                        "captureSnapshot, supersedes"]
    skip = {"type": "commit_skipped", "learner": "l", "encounter": "e", "checkpoint": "pre_close", "reason": "timeout", "prev_hash": "genesis"}

    def why(e):
        return verify_chain([{**e, "hash": "0" * 64}], family="tpc/clinical").errors

    assert why({**skip, "commit_schema": 2}) == ["[0] commit_skipped carries no commit_schema", "[0] hash mismatch (tampered)"]
    assert why({**_COMMIT_GOOD, "commit_schema": 1}) == ["[0] invalid commit_schema: 1", "[0] hash mismatch (tampered)"]
    assert why({**_COMMIT_GOOD, "commit_schema": "2"}) == ["[0] invalid commit_schema: 2", "[0] hash mismatch (tampered)"]
    assert why({**skip, "reason": ["skip"]}) == ["[0] invalid reason: skip", "[0] hash mismatch (tampered)"]
    assert why({k: v for k, v in skip.items() if k != "reason"}) == ["[0] invalid reason: undefined", "[0] hash mismatch (tampered)"]
    assert verify_chain([seal_event(_COMMIT_GOOD, "tpc/differential-commit-2")], scheme="tpc/differential-commit-1").errors[0] == (
        "[0] a commit with commit_schema 2 is tpc/differential-commit-2's")


def test_sort_keys_deep_orders_keys_as_javascript_does():
    """Array-index keys first in numeric order, UTF-16 order, __proto__ dropped: the TypeScript test pins the same string."""
    from qlm_measure.schemes import sort_keys_deep
    text = '{"b":1,"10":2,"9":3,"!":4,"1":5,"\\uff61":6,"\\ud83d\\ude00":7,"4294967295":8,"01":9,"a":{"2":10,"__proto__":{"x":1},"z":[{"y":1,"0":2}]}}'
    assert js_json_dumps(sort_keys_deep(json.loads(text))) == (
        '{"1":5,"9":3,"10":2,"!":4,"01":9,"4294967295":8,"a":{"2":10,"z":[{"0":2,"y":1}]},"b":1,"\U0001F600":7,"｡":6}')


def test_acted_without_commit_is_a_skip_reason():
    def skip(reason):
        return seal_event({"type": "commit_skipped", "learner": "l", "encounter": "e", "checkpoint": "post_history", "reason": reason,
                           "prev_hash": "genesis"}, "tpc/differential-commit-1")
    assert verify_chain([skip("acted_without_commit")], family="tpc/clinical").clean
    assert verify_chain([skip("nope")], family="tpc/clinical").errors == ["[0] invalid reason: nope"]


def test_commit_chain_across_the_switch_is_not_mixed():
    across = json.loads((VEC / "tpc-differential-commit-1-to-2.json").read_text())
    r = verify_chain(across["events"], family="tpc/clinical")
    assert r.clean and not any(e.startswith("mixed") for e in r.errors)
    old = json.loads((VEC / "tpc-differential-commit-1.json").read_text())
    assert verify_chain(old["events"], family="tpc/clinical").clean


def test_array_replacer_semantics_match_javascript():
    """JSON.stringify(value, ["b", "a"]) keeps listed keys in list order at every depth (tpc/yardstick-record-1)."""
    from qlm_measure.schemes import js_json_dumps_property_list
    value = {"a": 1, "b": {"c": 2, "a": [{"b": 3, "z": 4}, 5]}, "z": 6}
    assert js_json_dumps_property_list(value, ["b", "a"]) == '{"b":{"a":[{"b":3},5]},"a":1}'


def test_yardstick_record_1_is_payload_blind_and_2_is_not():
    from qlm_measure.schemes import compute_event_hash
    base = {"sequence": 0, "type": "protocol_commit", "studyId": "s", "timestamp": "t", "payload": {"title": "A"}, "prevDigest": "0" * 64}
    edited = {**base, "payload": {"title": "B"}}
    assert compute_event_hash(base, "tpc/yardstick-record-1") == compute_event_hash(edited, "tpc/yardstick-record-1")
    assert compute_event_hash(base, "tpc/yardstick-record-2") != compute_event_hash(edited, "tpc/yardstick-record-2")


def test_builtin_digests_match_typescript():
    from qlm_measure.schemes import djb2_hex, fnv1a64_hex
    assert fnv1a64_hex("") == "cbf29ce484222325" and fnv1a64_hex("a") == "af63dc4c8601ec8c"
    assert djb2_hex("") == "00001505" and djb2_hex("abc") == "0b885c8b"
    assert fnv1a64_hex("\U0001F600") != fnv1a64_hex("\ud83d")  # two UTF-16 units, as charCodeAt sees it


def test_journal_implicit_link_and_truncated_content_hash():
    with pytest.raises(ValueError, match="prev is required"):
        seal_event({"seq": 0, "eventType": "tick", "data": {}}, "tpc/dse-journal-1")
    v = json.loads((VEC / "tpc-dse-journal-1.json").read_text())
    edited = [dict(e) for e in v["events"]]
    edited[1]["data"] = {"changed": True}
    assert verify_chain(edited, scheme="tpc/dse-journal-1").stats["tampered"] == 1
    ms = json.loads((VEC / "play-measure-session-1.json").read_text())
    assert all(len(e["event_hash"]) == 32 for e in ms["events"])
    assert verify_chain([ms["events"][0], ms["events"][0]], scheme="play/measure-session-1").stats["duplicates"] == 1


def test_dp_first_event_absent_prev_and_yardstick_text_forms():
    v = json.loads((VEC / "dp-ledger-v3.json").read_text())
    assert "previousEventHash" not in v["events"][0]
    assert verify_chain(v["events"], scheme="dp/ledger-v3").clean
    assert any("must be absent" in e for e in verify_chain([{**v["events"][0], "previousEventHash": "genesis"}], scheme="dp/ledger-v3").errors)
    e = {"enrollment_id": "e1", "item_id": "i1", "response": "B", "correct": True, "previous_hash": ""}
    assert get_scheme("yardstick/spine-1").canonical(e, None) == ":e1:i1:B:True"
    assert get_scheme("yardstick/spine-1").canonical({**e, "previous_hash": None}, None) == "None:e1:i1:B:True"


def test_v4_canonical_and_applies_and_coexistence():
    base = {"type": "clinical_evidence", "learner": "l", "encounter": "e", "turn": 0, "construct": "c", "signal": "partial",
            "scaffold": 1, "extractor": "x", "confidence": 0.5, "prev_hash": "genesis"}
    proc = {**base, "event_kind": "chart.item", "payload": {"z": 1, "a": {"y": [3, {"q": 1, "p": 2}], "x": None}}}
    assert get_scheme("tpc/clinical-v4").canonical(proc) == (
        '["clinical_evidence","l","e",0,"c","partial",1,"x",0.5,"genesis",null,null,null,"chart.item",{"a":{"x":null,"y":[3,{"p":2,"q":1}]},"z":1}]')
    for sid in ("tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3"):
        assert not get_scheme(sid).applies(proc)
    assert not get_scheme("tpc/clinical-v4").applies(base)
    bad = seal_event({**proc, "event_kind": "Chart", "payload": []}, "tpc/clinical-v4")
    assert verify_chain([bad], scheme="tpc/clinical-v4").errors == ["[0] invalid event_kind: Chart", "[0] payload must be an object"]
    v = json.loads((VEC / "tpc-clinical-v3-v4-coexist.json").read_text())
    r = verify_chain(v["events"], family="tpc/clinical")
    assert r.clean and r.stats["hash_scheme"] == "tpc/clinical-v4" and not any(e.startswith("mixed") for e in r.errors)


def test_mixed_chain_is_rejected_unless_allowed():
    v1 = json.loads((VEC / "tpc-clinical-v1.json").read_text())["events"]
    v2 = json.loads((VEC / "tpc-clinical-v2.json").read_text())["events"]
    tail = seal_event({**v2[0], "prev_hash": v1[-1]["hash"], "turn": 6}, "tpc/clinical-v2")
    r = verify_chain(v1 + [tail], family="tpc/clinical")
    assert not r.clean and r.stats["hash_scheme"] == "mixed"
    assert r.stats["schemes"] == {"tpc/clinical-v1": 6, "tpc/clinical-v2": 1}
    assert r.errors[-1].startswith("mixed hash schemes")
    assert verify_chain(v1 + [tail], family="tpc/clinical", reject_mixed=False).clean


def test_gap_duplicate_genesis_and_schema_errors():
    v2 = json.loads((VEC / "tpc-clinical-v2.json").read_text())["events"]
    assert verify_chain([v2[0], v2[2]], scheme="tpc/clinical-v2").stats["gaps"] == 1
    dup = verify_chain([v2[0], v2[0]], scheme="tpc/clinical-v2")
    assert dup.stats["duplicates"] == 1 and dup.stats["gaps"] == 1
    assert verify_chain([v2[1]], scheme="tpc/clinical-v2").errors[0] == '[0] first event prev_hash must be "genesis"'
    bad = seal_event({**v2[0], "signal": "nope", "scaffold": 9, "confidence": 2}, "tpc/clinical-v2")
    r = verify_chain([bad], scheme="tpc/clinical-v2")
    assert r.stats["schema_errors"] == 3 and r.stats["tampered"] == 0


def test_play_canonical_sorts_keys_recursively():
    e = {"hash": "junk", "prevHash": "", "schemaVersion": "clin-1.0", "eventId": "e1", "ts": "t", "encounterId": "x", "actor": "a",
         "source": "s", "type": "encounter_start", "payload": {"b": 1, "a": [{"z": 1, "y": 2}]}, "consentRef": None}
    assert get_scheme("play/clinical-clin-1.0").canonical(e) == (
        '{"actor":"a","consentRef":null,"encounterId":"x","eventId":"e1","payload":{"a":[{"y":2,"z":1}],"b":1},'
        '"prevHash":"","schemaVersion":"clin-1.0","source":"s","ts":"t","type":"encounter_start"}')


def test_js_json_dumps_number_edges():
    assert js_json_dumps([0.85, 1.0, 1e-7, 0.000001, 1e21, 1e20, -1.5, 5e-324]) == "[0.85,1,1e-7,0.000001,1e+21,100000000000000000000,-1.5,5e-324]"
    assert js_json_dumps({"s": "é\u2028\"\\\n", "n": None, "t": True}) == '{"s":"é\u2028\\"\\\\\\n","n":null,"t":true}'


def test_unknown_scheme_or_family():
    with pytest.raises(ValueError, match="unknown chain scheme"):
        get_scheme("nope")
    with pytest.raises(ValueError, match="unknown chain family"):
        verify_chain([], family="nope")
    with pytest.raises(ValueError, match="pass family= or scheme="):
        verify_chain([])


def test_labpath_locale_key_order():
    e = {"event_id": "x", "hash": "junk", "prev_hash": None, "action": {"zeta": 1, "Alpha": 2, "_meta": 3}}
    assert get_scheme("labpath/learning-evidence-v1").canonical(e, None) == '{"action":{"_meta":3,"Alpha":2,"zeta":1},"event_id":"x","prev_hash":null}'
