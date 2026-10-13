#!/usr/bin/env python3
"""Vectors whose ORIGINAL sealer is Python. yardstick/project_spine/models.py
ResponseRecord.compute_chain_hash, copied verbatim below. Never edit an
existing vector."""
import hashlib, json, uuid
from pathlib import Path

def compute_chain_hash(previous_hash, enrollment_id, item_id, response, correct):
    payload = f"{previous_hash}:{enrollment_id}:{item_id}:{response}:{correct}"   # verbatim
    return hashlib.sha256(payload.encode()).hexdigest()

events = []; prev = ""
enr = uuid.UUID("11111111-2222-4333-8444-555555555555")
items = [uuid.UUID("aaaaaaaa-0000-4000-8000-00000000000%d" % i) for i in range(4)]
answers = [("B", True), ("D", False), ("A", True), ("café", False)]
for it, (resp, ok) in zip(items, answers):
    h = compute_chain_hash(prev, enr, it, resp, ok)
    events.append({"enrollment_id": str(enr), "item_id": str(it), "response": resp, "correct": ok, "previous_hash": prev, "chain_hash": h,
                   "latency_ms": 900, "evidence_weight": 1.0})
    prev = h
out = Path("schema/vectors/chains/yardstick-spine-1.json")
out.write_text(json.dumps({"scheme": "yardstick/spine-1", "family": "yardstick/spine",
    "source": "yardstick/project_spine/models.py ResponseRecord.compute_chain_hash (f-string, UTF-8, Python bool text)",
    "expect": {"clean": True, "hash_scheme": "yardstick/spine-1"}, "events": events}, indent=2) + "\n")
print("wrote yardstick-spine-1")

# ── yardstick packages/engine/studies/activity.py @ d4db650 — _canonical + _entry_hash, verbatim ──
GENESIS = "0" * 64

def _canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)

def _entry_hash(entry: dict, prev: str) -> str:
    body = {k: v for k, v in entry.items() if k != "hash"}
    return hashlib.sha256((prev + "\n" + _canonical(body)).encode("utf-8")).hexdigest()

entries = []; prev = GENESIS
rows = [("register", "nancy", "protocol frozen before enrollment", {"protocol.json": "ab" * 32}, "yardstick register sda-002", "POST /studies/sda-002/register"),
        ("collect", "nancy", "", {"data/collect-1.csv": "cd" * 32, "data/join.parquet": "ef" * 32}, "yardstick collect sda-002 --from classroom", ""),
        ("analyze", "kumar", "confirmatory run — résumé of \"pre-registered\" plan", {}, "", "POST /studies/sda-002/analyze")]
for i, (action, who, why, artifacts, cli, api) in enumerate(rows, start=1):
    entry = {"scheme": "yardstick-activity/1", "seq": i, "at": f"2026-09-26T1{i}:00:00Z", "who": who, "action": action, "why": why,
             "artifacts": artifacts, "cli": cli, "api": api, "prev": prev}
    entry["hash"] = _entry_hash(entry, prev); entries.append(entry); prev = entry["hash"]
Path("schema/vectors/chains/yardstick-activity-1.json").write_text(json.dumps({"scheme": "yardstick/activity-1", "family": "yardstick/activity",
    "source": "yardstick packages/engine/studies/activity.py _entry_hash (sha256 of prev + newline + json.dumps sorted/compact/ensure_ascii=False)",
    "expect": {"clean": True, "hash_scheme": "yardstick/activity-1"}, "events": entries}, indent=2, ensure_ascii=False) + "\n")
print("wrote yardstick-activity-1")

# ── yardstick packages/engine/depth_engine/depth_chain.py (Star Map E6) — the sealer, verbatim; the entries are
# tests/depth_engine/vectors/make_depth_vectors.py's. YardStick keeps the same two files as its pinned vectors. ──
import math as _math, re as _re  # noqa: E401
from decimal import Decimal
from typing import Any, Optional
math, re = _math, _re
SCHEME = "yardstick/depth-1"
GENESIS = "sha256:" + "0" * 64


def _js_number(n: float | int) -> str:
    """A number as ECMAScript Number::toString writes it (what JSON.stringify writes)."""
    if isinstance(n, bool):
        return "true" if n else "false"
    if isinstance(n, int):
        return str(n)
    if math.isnan(n) or math.isinf(n):
        raise ValueError("a number in the chain is finite")
    if n == 0:
        return "0"
    # repr() gives the shortest digits that round-trip, as JavaScript does; only where the point or the exponent
    # goes differs between the languages.
    sign, raw_digits, exp = Decimal(repr(n)).as_tuple()
    lead = "".join(map(str, raw_digits)).lstrip("0")
    js_n = len(lead) + exp
    digits = lead.rstrip("0") or "0"
    k = len(digits)
    if k <= js_n <= 21:
        s = digits + "0" * (js_n - k)
    elif 0 < js_n <= 21:
        s = digits[:js_n] + "." + digits[js_n:]
    elif -6 < js_n <= 0:
        s = "0." + "0" * (-js_n) + digits
    else:
        e = js_n - 1
        mant = digits[0] + ("." + digits[1:] if k > 1 else "")
        s = f"{mant}e{'+' if e >= 0 else '-'}{abs(e)}"
    return ("-" if sign else "") + s



def _js_string(s: str) -> str:
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch in _ESCAPES:
            out.append(_ESCAPES[ch])
        elif o < 0x20 or 0xD800 <= o <= 0xDFFF:
            out.append(f"\\u{o:04x}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)



def _rfc8785(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return _js_number(value)
    if isinstance(value, str):
        return _js_string(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_rfc8785(v) for v in value) + "]"
    if isinstance(value, dict):
        if not all(isinstance(k, str) for k in value):
            raise TypeError("an object's keys are strings")
        # Sorted as JavaScript's sort() sorts strings: by UTF-16 code units (RFC 8785, 3.2.3).
        keys = sorted(value, key=lambda k: k.encode("utf-16-be", "surrogatepass"))
        return "{" + ",".join(_js_string(k) + ":" + _rfc8785(value[k]) for k in keys) + "}"
    raise TypeError(f"not JSON: {type(value).__name__}")



def canonical(entry: dict[str, Any]) -> str:
    """What is hashed: the entry without `hash`, in the RFC 8785 form."""
    return _rfc8785({k: v for k, v in entry.items() if k != "hash"})



def entry_hash(entry: dict[str, Any]) -> str:
    return "sha256:" + hashlib.sha256(canonical(entry).encode("utf-8")).hexdigest()



def seal_one(body: dict[str, Any], *, learner: str, seq: int, prev: str) -> dict[str, Any]:
    """One entry: the body with the scheme, the learner, its place and its link, hashed. The body is not changed."""
    entry = {k: v for k, v in body.items() if k not in ("hash", "prev", "seq", "scheme", "learner")}
    entry.update(scheme=SCHEME, learner=learner, seq=seq, prev=prev)
    entry["hash"] = entry_hash(entry)
    return entry



def tail(chain: list[dict[str, Any]]) -> str:
    """The chain's last hash: the ledger hash. The genesis value for a learner with no entries."""
    return chain[-1]["hash"] if chain else GENESIS

_ESCAPES = {'"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t"}


class dc:  # the module's names, as make_depth_vectors.py calls them
    seal_one, tail, GENESIS = staticmethod(seal_one), staticmethod(tail), GENESIS


LEARNER = "learner-1"
EQ, CMP = "frac.equivalence", "frac.compare"
DECISION = "sha256:" + "9c" * 32
PLAN = "sha256:" + "ab" * 32


def evidence(event, construct, item, at, session, correct, weight, prior, posterior, scaffold="none",
             directiveness=0, is_probe=False, params=None):
    body = {"kind": "evidence", "event": event, "construct": construct, "item": item, "at": at, "session": session,
            "correct": correct, "weight": weight, "prior": prior, "posterior": posterior, "scaffold": scaffold,
            "directiveness": directiveness, "is_probe": is_probe}
    if params:
        body["params"] = params
    return body


def verification(event, check, construct, item, at, answered, fired, source, outcome, helped, need_id=None,
                 plan_hash=None, tier_checked=None, misconception=None):
    return {"kind": "verification", "event": event, "check": check, "construct": construct, "item": item, "at": at,
            "answered": answered, "fired": fired, "source": source, "outcome": outcome, "helped": helped,
            "decision_hash": DECISION, "need_id": need_id, "plan_hash": plan_hash, "tier_checked": tier_checked,
            "misconception": misconception}


BODIES = [
    evidence("0b6f1c2e-0000-4000-8000-000000000001", EQ, "labpath:fraction-lab:eq-1", "2026-10-01T15:00:00.000000Z",
             "lps-1", True, 0.42, 0.35, 0.5032),
    evidence("0b6f1c2e-0000-4000-8000-000000000002", EQ, None, "2026-10-01T15:01:30.250000Z", "lps-1", False, 0.1,
             0.5032, 0.4625, scaffold="hint", directiveness=1),
    evidence("0b6f1c2e-0000-4000-8000-000000000003", EQ, None, "2026-10-01T15:02:00.000000Z", "lps-1", True, None,
             None, None),
    evidence("0b6f1c2e-0000-4000-8000-000000000004", EQ, "labpath:fraction-lab:eq-2", "2026-10-02T09:00:00.000001Z",
             "séance-2", True, 1e-7, 0.999999, 1.0, is_probe=True),
    evidence("0b6f1c2e-0000-4000-8000-000000000005", CMP, "labpath:fraction-lab:cmp-1", "2026-10-09T15:00:00.000000Z",
             "lps-3", True, 0.85, 0.35, 0.6421, params={"slip": 0.05, "guess": 0.25}),
    verification("0b6f1c2e-0000-4000-8000-000000000005", "6f1c2b9e-0000-4000-8000-00000000000a", CMP,
                 "labpath:fraction-lab:cmp-1", "2026-10-09T15:00:00.000420Z", "2026-10-09T15:00:00.000000Z",
                 "2026-10-09T14:58:00.000000Z", "program", "pass", False, tier_checked="reporting"),
    evidence("0b6f1c2e-0000-4000-8000-000000000006", EQ, "labpath:fraction-lab:eq-7", "2026-10-10T16:00:00.000000Z",
             "lps-4", False, 0.85, 0.4383, 0.0889),
    verification("0b6f1c2e-0000-4000-8000-000000000006", "6f1c2b9e-0000-4000-8000-00000000000b", EQ,
                 "labpath:fraction-lab:eq-7", "2026-10-10T16:00:00.000300Z", "2026-10-10T16:00:00.000000Z",
                 "2026-10-10T15:59:00.000000Z", "need", "fail", False, need_id="n-7f3a", plan_hash=PLAN,
                 tier_checked="placement", misconception="mc.frac.bigger-denominator-bigger-fraction"),
    evidence("0b6f1c2e-0000-4000-8000-000000000007", CMP, "labpath:fraction-lab:cmp-4", "2026-10-11T10:00:00.000000Z",
             "lps-5", True, 0.85, 0.6421, 0.8812, params={"slip": 0.05, "guess": 0.25}),
    verification("0b6f1c2e-0000-4000-8000-000000000007", "6f1c2b9e-0000-4000-8000-00000000000c", CMP,
                 "labpath:fraction-lab:cmp-4", "2026-10-11T10:00:00.000150Z", "2026-10-11T10:00:00.000000Z",
                 "2026-10-11T09:57:00.000000Z", "program", "pass", True, tier_checked="reporting"),
]



def _depth_chain():
    out, answers = [], {}
    for body in BODIES:
        body = dict(body)
        if body["kind"] == "verification":
            body["answer"] = answers[body["event"]]
        entry = dc.seal_one(body, learner=LEARNER, seq=len(out) + 1, prev=dc.tail(out))
        if entry["kind"] == "evidence":
            answers[entry["event"]] = entry["hash"]
        out.append(entry)
    return out


def _write_depth(name, events, expect):
    Path("schema/vectors/chains/" + name).write_text(json.dumps({
        "scheme": "yardstick/depth-1", "family": "yardstick/depth",
        "source": "yardstick packages/engine/depth_engine/depth_chain.py seal_one (sha256 of the RFC 8785 form of the "
                  "entry without hash; prev, seq, scheme and learner inside; \"sha256:\" prefix)",
        "expect": expect, "events": events}, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print("wrote", name)


_depth = _depth_chain()
_write_depth("yardstick-depth-1.json", _depth, {"clean": True, "hash_scheme": "yardstick/depth-1"})
_tampered = json.loads(json.dumps(_depth))
_tampered[5]["outcome"] = "fail"
_write_depth("yardstick-depth-1-tampered.json", _tampered,
             {"clean": False, "hash_scheme": "yardstick/depth-1", "tampered": 1, "tampered_index": 5})
