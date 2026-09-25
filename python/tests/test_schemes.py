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


@pytest.mark.parametrize("path", [p for p in VECTORS if "tampered" not in p.stem], ids=[p.stem for p in VECTORS if "tampered" not in p.stem])
def test_vector_reseals_byte_for_byte(path):
    v = json.loads(path.read_text())
    scheme = get_scheme(v["scheme"])
    for e in v["events"]:
        rest = {k: x for k, x in e.items() if k != scheme.hash_field}
        assert compute_event_hash(rest, v["scheme"]) == e[scheme.hash_field]
        assert seal_event(rest, v["scheme"])[scheme.hash_field] == e[scheme.hash_field]
        assert detect_scheme(e, v["family"]) == v["scheme"]


def test_registry_order_matches_typescript():
    assert [s["id"] for s in list_schemes()] == ["tpc/clinical-v3", "tpc/clinical-v2", "tpc/clinical-v1", "play/clinical-clin-1.0"]


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
