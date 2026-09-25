"""Chain schemes — Python twin of ``src/schemes/index.ts``.

Every QLM product seals per-event hash chains; each scheme here is a named,
versioned definition of exactly which bytes are hashed. The TypeScript module
is the reference; both are checked against ``schema/vectors/chains/*.json``.

The canonical forms are defined by JavaScript's ``JSON.stringify``, so this
module carries ``js_json_dumps``: a serializer that reproduces
``JSON.stringify`` output for JSON-shaped data (number formatting follows
ECMAScript ``Number::toString``, strings are not ASCII-escaped, separators
carry no whitespace).
"""
from __future__ import annotations

import hashlib
import math
import re
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Callable, Iterable

HashFn = Callable[[str], str]


def sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


# ── JSON.stringify-compatible serialization ────────────────────────────────

def js_number(n: float | int) -> str:
    """Format a number the way ECMAScript Number::toString does (used by JSON.stringify)."""
    if isinstance(n, bool):
        return "true" if n else "false"
    if isinstance(n, int):
        return str(n)
    if math.isnan(n) or math.isinf(n):
        return "null"  # JSON.stringify(NaN) === "null"
    if n == 0:
        return "0"  # JSON.stringify(-0) === "0"
    # repr() gives the shortest round-tripping digits, as JS does; only the
    # placement of the decimal point / exponent differs between the languages.
    sign, raw_digits, exp = Decimal(repr(n)).as_tuple()
    all_digits = "".join(map(str, raw_digits))
    lead = all_digits.lstrip("0")
    js_n = len(lead) + exp  # decimal exponent of the leading digit, plus one (ES2023 §6.1.6.1.20 "n")
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


def js_string(s: str) -> str:
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif ch == "\b":
            out.append("\\b")
        elif ch == "\f":
            out.append("\\f")
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\t":
            out.append("\\t")
        elif o < 0x20 or 0xD800 <= o <= 0xDFFF:
            out.append(f"\\u{o:04x}")
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def js_json_dumps(value: Any) -> str:
    """JSON.stringify for JSON-shaped values (dict insertion order preserved)."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, (int, float)):
        return js_number(value)
    if isinstance(value, str):
        return js_string(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(js_json_dumps(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(js_string(str(k)) + ":" + js_json_dumps(v) for k, v in value.items()) + "}"
    raise TypeError(f"not JSON-shaped: {type(value).__name__}")


def sort_keys_deep(value: Any) -> Any:
    """Recursively sort object keys; arrays keep their order (mirrors Play's canonicalize)."""
    if isinstance(value, dict):
        return {k: sort_keys_deep(value[k]) for k in sorted(value.keys())}
    if isinstance(value, list):
        return [sort_keys_deep(v) for v in value]
    return value


# ── Scheme definitions ─────────────────────────────────────────────────────

@dataclass(frozen=True)
class ChainScheme:
    id: str
    family: str
    since: str
    hash_field: str
    prev_field: str
    genesis: str
    applies: Callable[[dict], bool]
    canonical: Callable[[dict], str]
    validate: Callable[[dict], list[str]]
    coexists: tuple[str, ...] = ()


TPC_SIGNALS = ("demonstrated", "partial", "missed_opportunity", "not_observable")
_TPC_BASE = ("type", "learner", "encounter", "turn", "construct", "signal", "scaffold", "extractor", "confidence", "prev_hash")

_MISSING = object()


def _tpc_array(e: dict, variant: int) -> list:
    arr: list = [e.get(f) for f in _TPC_BASE]
    if variant >= 2:
        arr.append(e.get("triage_class") if e.get("triage_class") is not None else None)
        arr.append(e.get("engine_version") if e.get("engine_version") is not None else None)
    if variant == 3:
        arr.append(e.get("mapping_version"))
    if variant == 4:
        arr.append(e.get("mapping_version"))  # null when absent, like ?? null
        arr.append(e.get("event_kind"))
        arr.append(sort_keys_deep(e.get("payload") if e.get("payload") is not None else {}))
    return arr


def _has_event_kind(e: dict) -> bool:
    """A schema 0.4 event: one with event_kind. Only tpc/clinical-v4 seals it."""
    return "event_kind" in e


def _is_num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _tpc_validate(e: dict) -> list[str]:
    errors: list[str] = []
    if e.get("type") != "clinical_evidence":
        errors.append(f"invalid type: {e.get('type')}")
    if not e.get("learner"):
        errors.append("missing learner")
    if not e.get("encounter"):
        errors.append("missing encounter")
    if not _is_num(e.get("turn")) or e["turn"] < 0:
        errors.append(f"invalid turn: {e.get('turn')}")
    if not e.get("construct"):
        errors.append("missing construct")
    if e.get("signal") not in TPC_SIGNALS:
        errors.append(f"invalid signal: {e.get('signal')}")
    if not _is_num(e.get("scaffold")) or not (0 <= e["scaffold"] <= 3):
        errors.append(f"invalid scaffold: {e.get('scaffold')}")
    if not _is_num(e.get("confidence")) or not (0 <= e["confidence"] <= 1):
        errors.append(f"invalid confidence: {e.get('confidence')}")
    return errors


def _tpc(id_: str, since: str, variant: int, applies: Callable[[dict], bool],
         validate: Callable[[dict], list[str]] = _tpc_validate, coexists: tuple[str, ...] = ()) -> ChainScheme:
    return ChainScheme(id=id_, family="tpc/clinical", since=since, hash_field="hash", prev_field="prev_hash",
                       genesis="genesis", applies=applies,
                       canonical=lambda e, v=variant: js_json_dumps(_tpc_array(e, v)), validate=validate, coexists=coexists)


TPC_CLINICAL_V1 = _tpc("tpc/clinical-v1", "2026-08-31", 1, lambda e: not _has_event_kind(e))
TPC_CLINICAL_V2 = _tpc("tpc/clinical-v2", "2026-09-10", 2, lambda e: not _has_event_kind(e))
TPC_CLINICAL_V3 = _tpc("tpc/clinical-v3", "2026-09-14", 3, lambda e: "mapping_version" in e and not _has_event_kind(e),
                       coexists=("tpc/clinical-v4",))

_TPC_EVENT_KIND = re.compile(r"^[a-z]+\.[a-z_]+$")


def _tpc4_validate(e: dict) -> list[str]:
    errors = _tpc_validate(e)
    if not isinstance(e.get("event_kind"), str) or not _TPC_EVENT_KIND.match(e["event_kind"]):
        errors.append(f"invalid event_kind: {e.get('event_kind')}")
    if not isinstance(e.get("payload"), dict):
        errors.append("payload must be an object")
    return errors


# 2026-09-25 (teachproof schema 0.4, TPC-SPEC-002 A6): event_kind and the
# per-kind payload (keys sorted at every depth) join the hash after the v3
# fields (mapping_version null when absent). Only events with event_kind use
# it; the rest of the chain stays v3, and the two coexist in one chain.
TPC_CLINICAL_V4 = _tpc("tpc/clinical-v4", "2026-09-25", 4, _has_event_kind, validate=_tpc4_validate,
                       coexists=("tpc/clinical-v3",))

_PLAY_FIELDS = ("eventId", "ts", "encounterId", "actor", "source", "type", "payload", "consentRef", "schemaVersion", "prevHash")


def _play_canonical(e: dict) -> str:
    # JSON.stringify drops keys whose value is undefined; a key absent from the
    # event is undefined in the TS module, so it is dropped here too.
    picked = {f: e[f] for f in _PLAY_FIELDS if f in e}
    return js_json_dumps(sort_keys_deep(picked))


def _play_validate(e: dict) -> list[str]:
    errors: list[str] = []
    if e.get("schemaVersion") != "clin-1.0":
        errors.append(f"invalid schemaVersion: {e.get('schemaVersion')}")
    for f in ("eventId", "ts", "encounterId", "type"):
        if not isinstance(e.get(f), str) or not e.get(f):
            errors.append(f"missing {f}")
    return errors


PLAY_CLINICAL_1_0 = ChainScheme(id="play/clinical-clin-1.0", family="play/clinical", since="2026-08-16",
                                hash_field="hash", prev_field="prevHash", genesis="",
                                applies=lambda e: e.get("schemaVersion") == "clin-1.0",
                                canonical=_play_canonical, validate=_play_validate)

_ALL: tuple[ChainScheme, ...] = (TPC_CLINICAL_V4, TPC_CLINICAL_V3, TPC_CLINICAL_V2, TPC_CLINICAL_V1, PLAY_CLINICAL_1_0)
SCHEMES: dict[str, ChainScheme] = {s.id: s for s in _ALL}


def get_scheme(id_: str) -> ChainScheme:
    try:
        return SCHEMES[id_]
    except KeyError:
        raise ValueError(f"unknown chain scheme: {id_} (known: {', '.join(SCHEMES)})") from None


def family_schemes(family: str) -> list[ChainScheme]:
    out = [s for s in _ALL if s.family == family]
    if not out:
        raise ValueError(f"unknown chain family: {family}")
    return out


def list_schemes() -> list[dict]:
    return [{"id": s.id, "family": s.family, "since": s.since, "hash_field": s.hash_field, "prev_field": s.prev_field} for s in _ALL]


# ── Sealing, detection, verification ───────────────────────────────────────

def compute_event_hash(event: dict, scheme_id: str, hash_fn: HashFn = sha256_hex) -> str:
    return hash_fn(get_scheme(scheme_id).canonical(event))


def seal_event(event: dict, scheme_id: str, hash_fn: HashFn = sha256_hex) -> dict:
    """Return a copy of ``event`` with the scheme's hash field set."""
    scheme = get_scheme(scheme_id)
    rest = {k: v for k, v in event.items() if k != scheme.hash_field}
    return {**rest, scheme.hash_field: hash_fn(scheme.canonical(rest))}


def detect_scheme(event: dict, family: str, hash_fn: HashFn = sha256_hex) -> str | None:
    for s in family_schemes(family):
        if not s.applies(event):
            continue
        if event.get(s.hash_field) == hash_fn(s.canonical(event)):
            return s.id
    return None


@dataclass
class ChainVerification:
    clean: bool
    errors: list[str]
    stats: dict = field(default_factory=dict)


def verify_chain(events: Iterable[dict], *, family: str | None = None, scheme: str | None = None,
                 reject_mixed: bool = True, hash_fn: HashFn = sha256_hex) -> ChainVerification:
    if not family and not scheme:
        raise ValueError("verify_chain: pass family= or scheme=")
    candidates = [get_scheme(scheme)] if scheme else family_schemes(family)  # type: ignore[arg-type]
    hash_field, prev_field, genesis = candidates[0].hash_field, candidates[0].prev_field, candidates[0].genesis
    events = list(events)
    errors: list[str] = []
    seen: set[str] = set()
    per_scheme: dict[str, int] = {}
    gaps = duplicates = tampered = schema_errors = 0
    for i, e in enumerate(events):
        matched = None
        for s in candidates:
            if s.applies(e) and e.get(hash_field) == hash_fn(s.canonical(e)):
                matched = s
                break
        scheme_for_schema = matched or next((s for s in candidates if s.applies(e)), candidates[-1])
        for err in scheme_for_schema.validate(e):
            errors.append(f"[{i}] {err}")
            schema_errors += 1
        if matched:
            per_scheme[matched.id] = per_scheme.get(matched.id, 0) + 1
        else:
            errors.append(f"[{i}] hash mismatch (tampered)")
            tampered += 1
        h = e.get(hash_field)
        if i == 0:
            if e.get(prev_field) != genesis:
                errors.append(f"[{i}] first event {prev_field} must be {js_string(genesis)}")
                gaps += 1
        elif e.get(prev_field) != events[i - 1].get(hash_field):
            errors.append(f"[{i}] chain gap")
            gaps += 1
        if isinstance(h, str):
            if h in seen:
                errors.append(f"[{i}] duplicate hash")
                duplicates += 1
            seen.add(h)
    ids = list(per_scheme)
    # Schemes that declare they coexist do not make a chain mixed; the chain
    # reports the newest of them (family order is newest first).
    def coexist(a: str, b: str) -> bool:
        return b in get_scheme(a).coexists or a in get_scheme(b).coexists
    mixed = any(not coexist(a, b) for i, a in enumerate(ids) for b in ids[i + 1:])
    newest = next((s.id for s in candidates if s.id in ids), None)
    hash_scheme = "none" if not ids else ("mixed" if mixed else (ids[0] if len(ids) == 1 else newest))
    if mixed and reject_mixed:
        errors.append("mixed hash schemes: " + ", ".join(f"{per_scheme[i]} {i}" for i in ids))
    return ChainVerification(clean=not errors, errors=errors, stats={
        "total": len(events), "gaps": gaps, "duplicates": duplicates, "tampered": tampered,
        "schema_errors": schema_errors, "hash_scheme": hash_scheme, "schemes": per_scheme,
    })
