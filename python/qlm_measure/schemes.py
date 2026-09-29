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
import json
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


def js_json_dumps_property_list(value: Any, keys: list[str]) -> str:
    """JSON.stringify(value, keys) with an ARRAY replacer: at every depth an
    object keeps only the listed keys, in list order (ES2023 §25.5.2.5)."""
    if isinstance(value, dict):
        return "{" + ",".join(js_string(k) + ":" + js_json_dumps_property_list(value[k], keys) for k in keys if k in value) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(js_json_dumps_property_list(v, keys) for v in value) + "]"
    return js_json_dumps(value)


_ARRAY_INDEX = re.compile(r"(?:0|[1-9][0-9]*)")


def _is_array_index(key: str) -> bool:
    """An ECMAScript array index: the canonical decimal form of an integer below 2**32 - 1."""
    return _ARRAY_INDEX.fullmatch(key) is not None and int(key) < 2 ** 32 - 1


def _utf16_order(key: str) -> bytes:
    """Sort key giving JavaScript's default string order (UTF-16 code units, not code points)."""
    return key.encode("utf-16-be", "surrogatepass")


def sort_keys_deep(value: Any) -> Any:
    """Recursively sort object keys; arrays keep their order. Twin of the TypeScript
    sortKeysDeep (Play's canonicalize) as JavaScript runs it: keys are sorted by UTF-16 code
    units and then enumerated as a JavaScript object orders them, array-index keys ("0",
    "10") first in numeric order; a "__proto__" key is dropped, because assigning it sets
    the object's prototype instead of a property."""
    if isinstance(value, dict):
        keys = sorted((k for k in value if k != "__proto__"), key=_utf16_order)
        ordered = sorted((k for k in keys if _is_array_index(k)), key=int) + [k for k in keys if not _is_array_index(k)]
        return {k: sort_keys_deep(value[k]) for k in ordered}
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
    prev_field: str | None
    genesis: str | None
    applies: Callable[[dict], bool]
    canonical: Callable[[dict, str | None], str]
    validate: Callable[[dict], list[str]]
    coexists: tuple[str, ...] = ()
    link: str | None = None          # "explicit" | "implicit" | "none"; default by prev_field
    digest: str = "sha256"           # "sha256" | "fnv1a64" | "djb2-32"
    truncate: int | None = None

    def link_of(self) -> str:
        return self.link or ("explicit" if self.prev_field else "none")


# ── Built-in non-cryptographic digests ─────────────────────────────────────

def _utf16_units(s: str):
    b = s.encode("utf-16-le", "surrogatepass")  # JS strings may hold lone surrogates
    for i in range(0, len(b), 2):
        yield b[i] | (b[i + 1] << 8)


def fnv1a64_hex(s: str) -> str:
    """FNV-1a 64-bit over UTF-16 code units (qlm-games hashSnapshotSync)."""
    h = 0xCBF29CE484222325
    for c in _utf16_units(s):
        h ^= c
        h = (h * 0x100000001B3) & 0xFFFFFFFFFFFFFFFF
    return format(h, "016x")


def djb2_hex(s: str) -> str:
    """djb2 with 32-bit wrap, unsigned hex padded to 8 (q-core hashString)."""
    h = 5381
    for c in _utf16_units(s):
        h = ((h << 5) + h + c) & 0xFFFFFFFF
    return format(h, "08x")


def digest_for(scheme: "ChainScheme", sha256: HashFn):
    base = fnv1a64_hex if scheme.digest == "fnv1a64" else djb2_hex if scheme.digest == "djb2-32" else sha256
    if scheme.truncate:
        return lambda c: base(c)[: scheme.truncate]
    return base


def js_string_of(v: Any) -> str:
    """JavaScript String(v) for JSON-shaped values."""
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return js_number(v)
    return str(v)


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


def _is_commit_event(e: dict) -> bool:
    """Commit/skip events share the clinical chain but have their own schemes (tpc/differential-commit-1 and -2)."""
    return e.get("type") in ("differential_commit", "commit_skipped")


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
                       canonical=lambda e, prev=None, v=variant: js_json_dumps(_tpc_array(e, v)), validate=validate, coexists=coexists)


TPC_CLINICAL_V1 = _tpc("tpc/clinical-v1", "2026-08-31", 1, lambda e: not _has_event_kind(e) and not _is_commit_event(e))
TPC_CLINICAL_V2 = _tpc("tpc/clinical-v2", "2026-09-10", 2, lambda e: not _has_event_kind(e) and not _is_commit_event(e))
TPC_CLINICAL_V3 = _tpc("tpc/clinical-v3", "2026-09-14", 3, lambda e: "mapping_version" in e and not _has_event_kind(e) and not _is_commit_event(e),
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
TPC_CLINICAL_V4 = _tpc("tpc/clinical-v4", "2026-09-25", 4, lambda e: _has_event_kind(e) and not _is_commit_event(e), validate=_tpc4_validate,
                       coexists=("tpc/clinical-v3",))

_PLAY_FIELDS = ("eventId", "ts", "encounterId", "actor", "source", "type", "payload", "consentRef", "schemaVersion", "prevHash")


def _play_canonical(e: dict, prev: str | None = None) -> str:
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



# ══════════════════════════════════════════════════════════════════════════
# Product envelopes (0.5.0) — twins of src/schemes/products.ts
# ══════════════════════════════════════════════════════════════════════════

def _missing_str(e: dict, fields) -> list[str]:
    return [f"missing {f}" for f in fields if not isinstance(e.get(f), str) or not e.get(f)]


PLAY_EMIT_1 = ChainScheme(
    id="play/emit-1", family="play/emit", since="2026-09-01", hash_field="chain_hash", prev_field="prev_hash", genesis="genesis",
    applies=lambda e: True,
    canonical=lambda e, prev=None: js_json_dumps({"student_id": e.get("student_id"), "product": e.get("product"), "construct": e.get("construct"),
                                                   "signal": e.get("signal"), "weight": e.get("weight"), "prev_hash": e.get("prev_hash") or "genesis"}),
    validate=lambda e: _missing_str(e, ("student_id", "product", "construct", "signal")))


def _first(e: dict, *names, default=None):
    for n in names:
        if e.get(n) is not None:
            return e[n]
    return default


PLAY_MEASURE_SESSION_1 = ChainScheme(
    id="play/measure-session-1", family="play/measure-session", since="2026-08-20", hash_field="event_hash", prev_field=None, genesis=None,
    link="none", truncate=32, applies=lambda e: True,
    canonical=lambda e, prev=None: js_json_dumps({
        "studyId": _first(e, "studyId", "study_id"), "sessionId": _first(e, "sessionId", "session_id"),
        "studentId": _first(e, "studentId", "student_id", default="unknown"), "timestamp": e.get("timestamp") if e.get("timestamp") is not None else "",
        "correct": e.get("correct"), "domain": e.get("domain") if e.get("domain") is not None else "",
        "responseTimeMs": _first(e, "responseTimeMs", "response_time_ms"), "sequenceNumber": _first(e, "sequenceNumber", "sequence_number")}),
    validate=lambda e: ([] if _first(e, "studyId", "study_id") else ["missing studyId"]) + ([] if _first(e, "sessionId", "session_id") else ["missing sessionId"]))

PLAY_ENCOUNTER_FNV64_1 = ChainScheme(
    id="play/encounter-fnv64-1", family="play/encounter", since="2026-08-16", hash_field="eventHash", prev_field="prevHash", genesis="",
    digest="fnv1a64", applies=lambda e: "eventHash" in e or e.get("schemaVersion") == "clin-1.0",
    canonical=lambda e, prev=None: js_json_dumps({k: e.get(k) for k in ("eventId", "ts", "encounterId", "actor", "source", "type", "payload", "consentRef", "prevHash") if k in e}),
    validate=lambda e: _missing_str(e, ("eventId", "ts", "encounterId", "type")))


def _provenance_canonical(e: dict, prev: str | None = None) -> str:
    d, r = e["designLayer"], e["runtimeLayer"]
    p, l = e.get("proofLayer"), e.get("lineageLayer")
    parts = [str(d.get("blueprintId", "")), js_json_dumps(d["auditResult"]["scores"]),
             js_string_of(r.get("worldId")) + js_string_of(r.get("eventCount")) + js_string_of(r.get("evidenceChainIntegrity"))]
    if p:
        parts.append(js_string_of(p.get("protocolCommitmentHash")) + js_string_of(p.get("bridgeCertificateHash")))
    if l:
        parts.append(js_string_of(l.get("closureRate")) + js_string_of(l.get("allLineagesClosed")))
    return "".join(parts)


PLAY_RESEARCH_PROVENANCE_1 = ChainScheme(
    id="play/research-provenance-1", family="play/research-provenance", since="2026-08-25", hash_field="chainHash", prev_field=None, genesis=None,
    link="none", applies=lambda e: isinstance(e.get("designLayer"), dict), canonical=_provenance_canonical,
    validate=lambda e: [m for m, ok in (("missing designLayer", e.get("designLayer")), ("missing runtimeLayer", e.get("runtimeLayer"))) if not ok])

QCORE_QINVERSE_DJB2_1 = ChainScheme(
    id="qcore/qinverse-djb2-1", family="qcore/qinverse", since="2026-08-10", hash_field="hash", prev_field="prevHash", genesis="genesis",
    digest="djb2-32", applies=lambda e: True,
    canonical=lambda e, prev=None: js_json_dumps({"eventId": e.get("eventId"), "type": e.get("type"), "data": e.get("data"), "prevHash": e.get("prevHash"),
                                                   "sequence": e.get("sequence"), "seed": e.get("seed")}),
    validate=lambda e: _missing_str(e, ("eventId",)) + ([] if _is_num(e.get("sequence")) else ["missing sequence"]))

_STUDIO_FIELDS = ("sessionId", "participantId", "stage", "event", "at", "payload")


def _studio_canonical(e: dict, prev: str | None = None) -> str:
    inp = {"prevHash": e.get("prevHash")}
    for f in _STUDIO_FIELDS:
        inp[f] = e.get(f)
    return js_json_dumps([[k, inp[k]] for k in sorted(inp.keys())])


STUDIO_LOOP_1 = ChainScheme(
    id="studio/loop-1", family="studio/loop", since="2026-09-05", hash_field="hash", prev_field="prevHash", genesis="genesis",
    applies=lambda e: True, canonical=_studio_canonical,
    validate=lambda e: _missing_str(e, ("sessionId", "participantId", "stage", "event", "at")))


def canonicalize_rfc8785(value: Any) -> str:
    """art-of-kings event-ledger canonicalize: sorted keys, JSON scalars, undefined/None → null."""
    if value is None or value is True or value is False or isinstance(value, (int, float)):
        return js_json_dumps(value)
    if isinstance(value, str):
        return js_string(value)
    if isinstance(value, list):
        return "[" + ",".join(canonicalize_rfc8785(v) for v in value) + "]"
    if isinstance(value, dict):
        return "{" + ",".join(js_string(k) + ":" + canonicalize_rfc8785(value[k]) for k in sorted(value.keys())) + "}"
    raise TypeError(f"Unserializable type: {type(value).__name__}")


_DP_EXCLUDED = {"eventHash", "eventSignature", "signatureKeyVersion", "receivedAt"}
_DP_FIELDS = ("eventId", "tenantId", "sessionId", "learnerId", "actorUserId", "actorRole", "eventSeq", "eventType", "occurredAt",
              "requestId", "idempotencyKey", "scenarioId", "scenarioVersion", "turnId", "checkpointId", "stateBeforeHash", "stateAfterHash",
              "knowledgeSnapshotId", "payloadSchema", "payloadVersion", "payload", "previousEventHash")


def _dp_canonical(e: dict, prev: str | None = None) -> str:
    rest = {k: e.get(k) for k in _DP_FIELDS}
    for k, v in e.items():
        if k not in _DP_EXCLUDED and k not in rest:
            rest[k] = v
    return (e.get("previousEventHash") or "") + canonicalize_rfc8785(rest)


DP_LEDGER_V3 = ChainScheme(
    id="dp/ledger-v3", family="dp/ledger", since="2026-08-28", hash_field="eventHash", prev_field="previousEventHash", genesis=None,
    applies=lambda e: True, canonical=_dp_canonical,
    validate=lambda e: _missing_str(e, ("eventId", "tenantId", "sessionId", "eventType")) + ([] if _is_num(e.get("eventSeq")) else ["missing eventSeq"]))

TPC_DSE_JOURNAL_1 = ChainScheme(
    id="tpc/dse-journal-1", family="tpc/dse-journal", since="2026-09-08", hash_field="hash", prev_field=None, genesis="", link="implicit",
    applies=lambda e: True,
    canonical=lambda e, prev=None: (prev or "") + js_json_dumps({"seq": e.get("seq"), "eventType": e.get("eventType"), "data": e.get("data")}),
    validate=lambda e: ([] if _is_num(e.get("seq")) else ["missing seq"]) + _missing_str(e, ("eventType",)))


def _py_text(v: Any) -> str:
    return "True" if v is True else "False" if v is False else "None" if v is None else str(v)


YARDSTICK_SPINE_1 = ChainScheme(
    id="yardstick/spine-1", family="yardstick/spine", since="2026-08-30", hash_field="chain_hash", prev_field="previous_hash", genesis="",
    applies=lambda e: True,
    canonical=lambda e, prev=None: f"{_py_text(e.get('previous_hash'))}:{_py_text(e.get('enrollment_id'))}:{_py_text(e.get('item_id'))}:{_py_text(e.get('response'))}:{_py_text(e.get('correct'))}",
    validate=lambda e: _missing_str(e, ("enrollment_id", "item_id")))


def _locale_key(k: str):
    """Emulates String.prototype.localeCompare (ICU root) for ASCII keys: punctuation
    < digits < letters at the primary level, case-insensitive, then lowercase
    before uppercase. Non-ASCII keys are compared by code point."""
    def cls(ch: str):
        if ch.isdigit():
            return 1
        if ch.isalpha():
            return 2
        return 0
    primary = tuple((cls(ch), ch.lower()) for ch in k)
    tertiary = tuple(0 if ch.islower() or not ch.isalpha() else 1 for ch in k)
    return (primary, tertiary)


def sort_object_locale(value: Any) -> Any:
    if isinstance(value, list):
        return [sort_object_locale(v) for v in value]
    if isinstance(value, dict):
        return {k: sort_object_locale(value[k]) for k in sorted(value.keys(), key=_locale_key)}
    return value


LABPATH_LEARNING_EVIDENCE_V1 = ChainScheme(
    id="labpath/learning-evidence-v1", family="labpath/learning-evidence", since="2026-09-12", hash_field="hash", prev_field="prev_hash", genesis=None,
    applies=lambda e: isinstance(e.get("event_id"), str),
    canonical=lambda e, prev=None: js_json_dumps(sort_object_locale({k: v for k, v in e.items() if k != "hash"})),
    validate=lambda e: _missing_str(e, ("event_id", "learner_id", "ts", "world_id", "session_id")))


def _transcript_canonical(e: dict, prev: str | None = None) -> str:
    t = e["transcript"]
    return js_json_dumps({"text": t.get("text"), "turns": t.get("turns"), "sourceType": t.get("sourceType"), "duration": t.get("duration")})


TPC_TRANSCRIPT_1 = ChainScheme(
    id="tpc/transcript-1", family="tpc/transcript", since="2026-08-20", hash_field="hash", prev_field="prev_hash", genesis=None,
    applies=lambda e: isinstance(e.get("transcript"), dict), canonical=_transcript_canonical,
    validate=lambda e: [] if isinstance(e.get("transcript"), dict) else ["missing transcript"])


def _commit_v1_list(e: dict) -> list:
    return ["differential_commit", e.get("learner"), e.get("encounter"), e.get("checkpoint"), e.get("rankedDifferential"), e.get("whyText"),
            e.get("nextAction"), e.get("discipline"), e.get("prev_hash")]


def _commit_canonical(e: dict, prev: str | None = None) -> str:
    if e.get("type") == "differential_commit":
        arr = _commit_v1_list(e)
    else:
        arr = ["commit_skipped", e.get("learner"), e.get("encounter"), e.get("checkpoint"), e.get("reason"), e.get("prev_hash")]
    return js_json_dumps(arr)


_COMMIT_SKIP_REASONS = ("skip", "timeout", "not_reached", "acted_without_commit")
# The fields version 2 appends to version 1's list, in hash order.
_COMMIT_V2_FIELDS = ("concepts", "statuses", "confidence", "evidenceLinks", "discriminator", "planLinks", "trigger", "captureSnapshot", "supersedes")


def _js_display(v: Any) -> str:
    """JavaScript String(v) for JSON-shaped values (``_MISSING`` is undefined), so error
    messages read the same in both languages. Messages only: hashes use js_string_of."""
    if v is _MISSING:
        return "undefined"
    if isinstance(v, list):
        return ",".join("" if x is None else _js_display(x) for x in v)
    if isinstance(v, dict):
        return "[object Object]"
    return js_string_of(v)


def _commit_validate(e: dict) -> list[str]:
    errors = _missing_str(e, ("learner", "encounter", "checkpoint"))
    if e.get("type") == "commit_skipped" and e.get("reason") not in _COMMIT_SKIP_REASONS:
        errors.append(f"invalid reason: {_js_display(e.get('reason', _MISSING))}")
    return errors


def _commit_v1_validate(e: dict) -> list[str]:
    """Version 1's checks. As the family's last scheme it also checks a commit record no
    scheme applies to, so it says why (twin of commitV1Validate)."""
    errors = _commit_validate(e)
    if "commit_schema" in e:
        schema = e["commit_schema"]
        if e.get("type") != "differential_commit":
            errors.append(f"{_js_display(e.get('type', _MISSING))} carries no commit_schema")
        elif _commit_schema_is_2(e):
            errors.append("a commit with commit_schema 2 is tpc/differential-commit-2's")
        else:
            errors.append(f"invalid commit_schema: {_js_display(schema)}")
    elif e.get("type") == "differential_commit":
        added = [f for f in _COMMIT_V2_FIELDS if f in e]
        if added:
            errors.append(f"fields without commit_schema 2: {', '.join(added)}")
    return errors


# 0.7.0: a record that carries commit_schema is never version 1's, so a
# version 2 commit's added fields are always covered, and a commit that
# carries those fields without commit_schema fails validation rather than
# verifying with them unhashed. Skip records stay here, and
# acted_without_commit joins the reasons (TPC-SPEC-002 E6). The canonical
# form is unchanged.
TPC_DIFFERENTIAL_COMMIT_1 = ChainScheme(
    id="tpc/differential-commit-1", family="tpc/clinical", since="2026-09-14", hash_field="hash", prev_field="prev_hash", genesis="genesis",
    applies=lambda e: _is_commit_event(e) and "commit_schema" not in e, canonical=_commit_canonical, validate=_commit_v1_validate,
    coexists=("tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3", "tpc/clinical-v4", "tpc/differential-commit-2"))

# tpc/differential-commit-2 — TPC-SPEC-002 E4 (see products.ts): version 1's
# list, then commit_schema and the E4 fields in a fixed order, each with its
# keys sorted at every depth. The objects inside take only their named keys,
# so every valid record hashes the same in JavaScript and Python.
_COMMIT_CHECKPOINTS = ("pre_brief", "post_history", "on_evidence", "pre_close")
_COMMIT_DISCIPLINES = ("OD", "RN", "GM")
_COMMIT_STATUSES = ("leading", "active", "ruled_out")
_DISCRIMINATOR_KINDS = ("question", "test", "finding", "time")
_MAX_RANKED = 5


def _non_empty(v: Any) -> bool:
    return isinstance(v, str) and v != ""


def _is_rank(v: Any, n: int) -> bool:
    """A 1-based position in rankedDifferential (Number.isInteger: 2.0 counts). Integers are
    compared as integers: a huge one must not be turned into a float (OverflowError)."""
    if isinstance(v, bool):
        return False
    if isinstance(v, int):
        return 1 <= v <= n
    return isinstance(v, float) and math.isfinite(v) and v.is_integer() and 1 <= v <= n


def _in(v: Any, allowed: tuple) -> bool:
    return isinstance(v, str) and v in allowed


def _only_keys(o: dict, keys: tuple) -> bool:
    """An object with no key but these (each still checked on its own)."""
    return all(k in keys for k in o)


def _commit_schema_is_2(e: dict) -> bool:
    return _is_num(e.get("commit_schema")) and e.get("commit_schema") == 2


def _is_commit_v2(e: dict) -> bool:
    return e.get("type") == "differential_commit" and _commit_schema_is_2(e)


def _commit_v2_canonical(e: dict, prev: str | None = None) -> str:
    return js_json_dumps(_commit_v1_list(e) + [e.get("commit_schema")] + [sort_keys_deep(e.get(f)) for f in _COMMIT_V2_FIELDS])


def _commit_v2_validate(e: dict) -> list[str]:
    errors = _commit_validate(e)
    if not _commit_schema_is_2(e):
        errors.append(f"invalid commit_schema: {_js_display(e.get('commit_schema', _MISSING))}")
    if _non_empty(e.get("checkpoint")) and e["checkpoint"] not in _COMMIT_CHECKPOINTS:
        errors.append(f"invalid checkpoint: {e['checkpoint']}")
    ranked = e.get("rankedDifferential")
    n = len(ranked) if isinstance(ranked, list) else 0
    if not isinstance(ranked, list) or n < 1 or n > _MAX_RANKED or not all(_non_empty(r) for r in ranked):
        errors.append(f"rankedDifferential must be 1 to {_MAX_RANKED} non-empty strings")
    if not isinstance(e.get("whyText"), str):
        errors.append("whyText must be a string")
    next_action = e.get("nextAction", _MISSING)
    if next_action is not None and not isinstance(next_action, str):
        errors.append("nextAction must be a string or null")
    if not _in(e.get("discipline"), _COMMIT_DISCIPLINES):
        errors.append(f"invalid discipline: {_js_display(e.get('discipline', _MISSING))}")

    def per_entry(f: str, what: str, ok: Callable[[Any], bool]) -> None:
        a = e.get(f)
        if not isinstance(a, list) or len(a) != n or not all(ok(v) for v in a):
            errors.append(f"{f} must hold one {what} per ranked entry")

    per_entry("concepts", "concept id or null", lambda c: c is None or _non_empty(c))
    per_entry("statuses", "of leading, active, ruled_out", lambda s: _in(s, _COMMIT_STATUSES))
    per_entry("confidence", "number 0 to 100 or null", lambda c: c is None or (_is_num(c) and 0 <= c <= 100))
    snap = e.get("captureSnapshot")
    snapshot = snap if isinstance(snap, list) and all(_non_empty(s) for s in snap) else None
    if snapshot is None:
        errors.append("captureSnapshot must be an array of non-empty strings")
    links = e.get("evidenceLinks")
    if not isinstance(links, list):
        errors.append("evidenceLinks must be an array")
    else:
        for i, link in enumerate(links):
            if (not isinstance(link, dict) or not _only_keys(link, ("rank", "ref", "direction")) or not _is_rank(link.get("rank"), n)
                    or not _non_empty(link.get("ref")) or not _in(link.get("direction"), ("for", "against"))):
                errors.append(f"invalid evidenceLinks[{i}]")
            elif snapshot is not None and link["ref"] not in snapshot:
                errors.append(f"evidenceLinks[{i}] ref not in captureSnapshot: {link['ref']}")
    d = e.get("discriminator", _MISSING)
    if d is not None and (not isinstance(d, dict) or not _only_keys(d, ("kind", "ref", "text")) or not _in(d.get("kind"), _DISCRIMINATOR_KINDS)
                          or (d.get("ref", _MISSING) is not None and not _non_empty(d.get("ref")))
                          or not isinstance(d.get("text"), str)):
        errors.append("invalid discriminator")
    plan = e.get("planLinks")
    if not isinstance(plan, list):
        errors.append("planLinks must be an array")
    else:
        for i, link in enumerate(plan):
            if (not isinstance(link, dict) or not _only_keys(link, ("rank", "ref")) or not _is_rank(link.get("rank"), n)
                    or not _non_empty(link.get("ref"))):
                errors.append(f"invalid planLinks[{i}]")
    trigger = e.get("trigger", _MISSING)
    if trigger is not None and not _non_empty(trigger):
        errors.append("trigger must be a non-empty string or null")
    elif e.get("checkpoint") == "on_evidence" and trigger is None:
        errors.append("on_evidence needs a trigger")
    supersedes = e.get("supersedes", _MISSING)
    if supersedes is not None and not _non_empty(supersedes):
        errors.append("supersedes must be a hash or null")
    return errors


TPC_DIFFERENTIAL_COMMIT_2 = ChainScheme(
    id="tpc/differential-commit-2", family="tpc/clinical", since="2026-09-28", hash_field="hash", prev_field="prev_hash", genesis="genesis",
    applies=_is_commit_v2, canonical=_commit_v2_canonical, validate=_commit_v2_validate,
    coexists=("tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3", "tpc/clinical-v4", "tpc/differential-commit-1"))


def _rct_canonical(e: dict, prev: str | None = None) -> str:
    dims = [{"dimension": d.get("dimension"), "treatmentN": d.get("treatmentN"), "controlN": d.get("controlN"), "treatmentMean": d.get("treatmentMean"),
             "controlMean": d.get("controlMean")} for d in e.get("dimensions", [])]
    return js_json_dumps({"studyId": e.get("studyId"), "nTreatment": e.get("nTreatment"), "nControl": e.get("nControl"),
                          "totalOutcomeEvents": e.get("totalOutcomeEvents"), "sourcePipes": e.get("sourcePipes"), "dimensions": dims})


TPC_RCT_INPUT_1 = ChainScheme(
    id="tpc/rct-input-1", family="tpc/rct-input", since="2026-09-22", hash_field="inputHash", prev_field=None, genesis=None, link="none",
    applies=lambda e: isinstance(e.get("dimensions"), list), canonical=_rct_canonical,
    validate=lambda e: _missing_str(e, ("studyId",)))

# ═══════════════════════════════════════════════════════════════════════════
# 0.6.0 — chains found by the 2026-09-27 audit (see products.ts for the sources)
# ═══════════════════════════════════════════════════════════════════════════

def _js_concat(e: dict, key: str) -> str:
    """What `e[key] + "..."` produced in the sealer: String(undefined) for a missing key."""
    return "undefined" if key not in e else js_string_of(e[key])


def _is_object(v: Any) -> bool:
    return isinstance(v, dict)


def _world_trace_validate(e: dict) -> list[str]:
    errors = [] if _is_num(e.get("seq")) else ["missing seq"]
    errors += _missing_str(e, ("type",))
    if not isinstance(e.get("prevHash"), str):
        errors.append("missing prevHash")
    if not _is_object(e.get("payload")):
        errors.append("payload must be an object")
    return errors


_WORLD_TRACE_TSIM_WORLDS = frozenset({"simpleforces", "soundlab", "statesofmatter"})
_WORLD_TRACE = dict(family="play/world-trace", hash_field="hash", prev_field="prevHash", genesis="00000000", digest="djb2-32",
                    validate=_world_trace_validate)


def _is_world_trace_2(e: dict) -> bool:
    return e.get("schemaVersion") == "world-trace/2"


def _is_tsim_world(e: dict) -> bool:
    return js_string_of(e.get("worldId")) in _WORLD_TRACE_TSIM_WORLDS


PLAY_WORLD_TRACE_IDENTITY_1 = ChainScheme(
    id="play/world-trace-identity-1", since="2026-09-24", applies=_is_world_trace_2,
    canonical=lambda e, prev=None: _js_concat(e, "prevHash") + js_json_dumps(
        [e.get("seq"), e.get("type"), e.get("payload"), {"missionId": e.get("missionId"), "band": e.get("band"), "seed": e.get("seed")}]),
    **_WORLD_TRACE)
PLAY_WORLD_TRACE_TSIM_1 = ChainScheme(
    id="play/world-trace-tsim-1", since="2026-09-24", applies=lambda e: not _is_world_trace_2(e) and _is_tsim_world(e),
    canonical=lambda e, prev=None: _js_concat(e, "prevHash") + js_json_dumps([e.get("seq"), e.get("type"), e.get("payload"), e.get("tSim")]),
    **_WORLD_TRACE)
PLAY_WORLD_TRACE_1 = ChainScheme(
    id="play/world-trace-1", since="2026-09-24", applies=lambda e: not _is_world_trace_2(e) and not _is_tsim_world(e),
    canonical=lambda e, prev=None: _js_concat(e, "prevHash") + js_json_dumps([e.get("seq"), e.get("type"), e.get("payload")]),
    **_WORLD_TRACE)

_YR_FIELDS = ("sequence", "type", "studyId", "timestamp", "payload", "prevDigest")
_YR_REPLACER = sorted(_YR_FIELDS)


def _yr_content(e: dict) -> dict:
    # JSON.stringify skips undefined-valued keys, which a missing key also is.
    return {f: e[f] for f in _YR_FIELDS if f in e}


def _yr_validate(e: dict) -> list[str]:
    errors = [] if _is_num(e.get("sequence")) else ["missing sequence"]
    errors += _missing_str(e, ("type", "studyId", "timestamp"))
    if not _is_object(e.get("payload")):
        errors.append("payload must be an object")
    return errors


_YR = dict(family="tpc/yardstick-record", hash_field="digest", prev_field="prevDigest", genesis="0" * 64, applies=lambda e: True, validate=_yr_validate)
TPC_YARDSTICK_RECORD_2 = ChainScheme(
    id="tpc/yardstick-record-2", since="2026-09-28",
    canonical=lambda e, prev=None: js_json_dumps(sort_keys_deep(_yr_content(e))), coexists=("tpc/yardstick-record-1",), **_YR)
TPC_YARDSTICK_RECORD_1 = ChainScheme(
    id="tpc/yardstick-record-1", since="2026-09-21",
    canonical=lambda e, prev=None: js_json_dumps_property_list(_yr_content(e), _YR_REPLACER), coexists=("tpc/yardstick-record-2",), **_YR)

TPC_INTERVENTION_1 = ChainScheme(
    id="tpc/intervention-1", family="tpc/intervention", since="2026-09-21", hash_field="hash", prev_field="prevHash", genesis="genesis",
    applies=lambda e: True,
    canonical=lambda e, prev=None: js_json_dumps([e.get(f) for f in ("type", "provenance", "flagId", "actor", "actionType", "constructId", "rationale", "timestamp", "prevHash")]),
    validate=lambda e: _missing_str(e, ("flagId", "actor", "actionType", "constructId", "timestamp")))

TPC_REHEARSAL_STAGE_1 = ChainScheme(
    id="tpc/rehearsal-stage-1", family="tpc/rehearsal-stage", since="2026-09-21", hash_field="hash", prev_field=None, genesis="genesis", link="implicit",
    applies=lambda e: True,
    canonical=lambda e, prev=None: js_json_dumps([e.get("stage"), e.get("passed"), e.get("timestamp"), prev if prev is not None else "genesis"]),
    validate=lambda e: _missing_str(e, ("stage", "timestamp")) + ([] if isinstance(e.get("passed"), bool) else ["missing passed"]))


def _activity_canonical(e: dict, prev: str | None = None) -> str:
    body = {k: v for k, v in e.items() if k != "hash"}  # verbatim: activity._entry_hash
    return str(e.get("prev")) + "\n" + json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


YARDSTICK_ACTIVITY_1 = ChainScheme(
    id="yardstick/activity-1", family="yardstick/activity", since="2026-09-26", hash_field="hash", prev_field="prev", genesis="0" * 64,
    applies=lambda e: True, canonical=_activity_canonical,
    validate=lambda e: ([] if _is_num(e.get("seq")) else ["missing seq"]) + _missing_str(e, ("at", "who", "action")))



PRODUCT_SCHEMES: tuple[ChainScheme, ...] = (PLAY_EMIT_1, PLAY_MEASURE_SESSION_1, PLAY_ENCOUNTER_FNV64_1, PLAY_RESEARCH_PROVENANCE_1,
                                            QCORE_QINVERSE_DJB2_1, STUDIO_LOOP_1, DP_LEDGER_V3, TPC_DSE_JOURNAL_1, YARDSTICK_SPINE_1,
                                            LABPATH_LEARNING_EVIDENCE_V1, TPC_TRANSCRIPT_1, TPC_DIFFERENTIAL_COMMIT_2, TPC_DIFFERENTIAL_COMMIT_1,
                                            TPC_RCT_INPUT_1,
                                            PLAY_WORLD_TRACE_IDENTITY_1, PLAY_WORLD_TRACE_TSIM_1, PLAY_WORLD_TRACE_1,
                                            TPC_YARDSTICK_RECORD_2, TPC_YARDSTICK_RECORD_1, TPC_INTERVENTION_1, TPC_REHEARSAL_STAGE_1,
                                            YARDSTICK_ACTIVITY_1)

_ALL: tuple[ChainScheme, ...] = (TPC_CLINICAL_V4, TPC_CLINICAL_V3, TPC_CLINICAL_V2, TPC_CLINICAL_V1, PLAY_CLINICAL_1_0, *PRODUCT_SCHEMES)
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
    return [{"id": s.id, "family": s.family, "since": s.since, "hash_field": s.hash_field, "prev_field": s.prev_field,
             "link": s.link_of(), "digest": s.digest} for s in _ALL]


# ── Sealing, detection, verification ───────────────────────────────────────

def compute_event_hash(event: dict, scheme_id: str, hash_fn: HashFn = sha256_hex, prev: str | None = None) -> str:
    scheme = get_scheme(scheme_id)
    return digest_for(scheme, hash_fn)(scheme.canonical(event, prev))


def seal_event(event: dict, scheme_id: str, hash_fn: HashFn = sha256_hex, prev: str | None = None) -> dict:
    """Return a copy of ``event`` with the scheme's hash field set. ``prev`` is
    required for implicit-link schemes (previous record's hash, genesis first)."""
    scheme = get_scheme(scheme_id)
    if scheme.link_of() == "implicit" and prev is None:
        raise ValueError(f"{scheme_id}: prev is required (implicit link)")
    rest = {k: v for k, v in event.items() if k != scheme.hash_field}
    return {**rest, scheme.hash_field: digest_for(scheme, hash_fn)(scheme.canonical(rest, prev))}


def detect_scheme(event: dict, family: str, hash_fn: HashFn = sha256_hex, prev: str | None = None) -> str | None:
    for s in family_schemes(family):
        if not s.applies(event):
            continue
        if event.get(s.hash_field) == digest_for(s, hash_fn)(s.canonical(event, prev)):
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
    link = candidates[0].link_of()
    events = list(events)
    errors: list[str] = []
    seen: set[str] = set()
    per_scheme: dict[str, int] = {}
    gaps = duplicates = tampered = schema_errors = 0
    for i, e in enumerate(events):
        prev = (genesis if genesis is not None else "") if i == 0 else str(events[i - 1].get(hash_field) or "")
        matched = None
        for s in candidates:
            if s.applies(e) and e.get(hash_field) == digest_for(s, hash_fn)(s.canonical(e, prev)):
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
        if link == "explicit" and prev_field:
            if i == 0:
                ok = (e.get(prev_field) is None) if genesis is None else (e.get(prev_field) == genesis)
                if not ok:
                    errors.append(f"[{i}] first event {prev_field} must be " + ("absent" if genesis is None else js_string(genesis)))
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
