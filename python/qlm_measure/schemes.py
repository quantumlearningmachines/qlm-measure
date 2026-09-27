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
    """Commit/skip events share the clinical chain but have their own scheme (tpc/differential-commit-1)."""
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
    canonical=lambda e, prev=None: f"{e.get('previous_hash') or ''}:{_py_text(e.get('enrollment_id'))}:{_py_text(e.get('item_id'))}:{_py_text(e.get('response'))}:{_py_text(e.get('correct'))}",
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


def _commit_canonical(e: dict, prev: str | None = None) -> str:
    if e.get("type") == "differential_commit":
        arr = ["differential_commit", e.get("learner"), e.get("encounter"), e.get("checkpoint"), e.get("rankedDifferential"), e.get("whyText"),
               e.get("nextAction"), e.get("discipline"), e.get("prev_hash")]
    else:
        arr = ["commit_skipped", e.get("learner"), e.get("encounter"), e.get("checkpoint"), e.get("reason"), e.get("prev_hash")]
    return js_json_dumps(arr)


def _commit_validate(e: dict) -> list[str]:
    errors = _missing_str(e, ("learner", "encounter", "checkpoint"))
    if e.get("type") == "commit_skipped" and e.get("reason") not in ("skip", "timeout", "not_reached"):
        errors.append(f"invalid reason: {e.get('reason')}")
    return errors


TPC_DIFFERENTIAL_COMMIT_1 = ChainScheme(
    id="tpc/differential-commit-1", family="tpc/clinical", since="2026-09-14", hash_field="hash", prev_field="prev_hash", genesis="genesis",
    applies=_is_commit_event, canonical=_commit_canonical, validate=_commit_validate,
    coexists=("tpc/clinical-v1", "tpc/clinical-v2", "tpc/clinical-v3", "tpc/clinical-v4"))


def _rct_canonical(e: dict, prev: str | None = None) -> str:
    dims = [{"dimension": d.get("dimension"), "treatmentN": d.get("treatmentN"), "controlN": d.get("controlN"), "treatmentMean": d.get("treatmentMean"),
             "controlMean": d.get("controlMean")} for d in e.get("dimensions", [])]
    return js_json_dumps({"studyId": e.get("studyId"), "nTreatment": e.get("nTreatment"), "nControl": e.get("nControl"),
                          "totalOutcomeEvents": e.get("totalOutcomeEvents"), "sourcePipes": e.get("sourcePipes"), "dimensions": dims})


TPC_RCT_INPUT_1 = ChainScheme(
    id="tpc/rct-input-1", family="tpc/rct-input", since="2026-09-22", hash_field="inputHash", prev_field=None, genesis=None, link="none",
    applies=lambda e: isinstance(e.get("dimensions"), list), canonical=_rct_canonical,
    validate=lambda e: _missing_str(e, ("studyId",)))

PRODUCT_SCHEMES: tuple[ChainScheme, ...] = (PLAY_EMIT_1, PLAY_MEASURE_SESSION_1, PLAY_ENCOUNTER_FNV64_1, PLAY_RESEARCH_PROVENANCE_1,
                                            QCORE_QINVERSE_DJB2_1, STUDIO_LOOP_1, DP_LEDGER_V3, TPC_DSE_JOURNAL_1, YARDSTICK_SPINE_1,
                                            LABPATH_LEARNING_EVIDENCE_V1, TPC_TRANSCRIPT_1, TPC_DIFFERENTIAL_COMMIT_1, TPC_RCT_INPUT_1)

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
