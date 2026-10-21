"""POSIX cumulative ledger for explicitly identified assistance events.

The single atomically replaced state file is authoritative. Advisory locking
serializes processes on a shared POSIX filesystem; it is not an object-store or
distributed-lock implementation. Native event IDs and revisions are asserted by
the source, not inferred from row positions, timestamps or transcript text.
"""
from contextlib import contextmanager
from copy import deepcopy
import fcntl
import json
import os
from pathlib import Path
import tempfile

from qlm_transformer.core import digest

LEDGER_SCHEMA = "qlm-assistance-ingestion-ledger-0.1.0"
MAX_REVISIONS = 50_000
MAX_STATE_BYTES = 100_000_000


def _text(value, label):
    if not isinstance(value, str) or not value.strip() or len(value) > 512:
        raise ValueError(label + " must be nonempty text of at most 512 characters")
    return value


def _event(row):
    identity = row.get("native_identity")
    if not isinstance(identity, dict) or set(identity) != {"platform", "source_id", "event_id"}:
        raise ValueError("cumulative events require an explicit source-native identity")
    identity = {name: _text(identity[name], name) for name in ("platform", "source_id", "event_id")}
    if identity["platform"] != "explicit-assistance-events":
        raise ValueError("ledger supports only explicitly identified assistance lifecycle inputs")
    revision = row.get("source_revision")
    if type(revision) is not int or revision < 0:
        raise ValueError("source_revision must be a nonnegative non-boolean integer")
    payload = row.get("source_payload")
    if not isinstance(payload, dict):
        raise ValueError("cumulative events require a canonical source_payload")
    for field in ("scoped_subject", "activity_id"):
        _text(payload.get(field), "source_payload." + field)
    if payload.get("source_kind", "unverified_user_input") not in ("synthetic_fixture", "unverified_user_input", "verified_public_sample"):
        raise ValueError("unsupported cumulative source provenance kind")
    lifecycle = payload.get("lifecycle")
    if not isinstance(lifecycle, dict) or lifecycle.get("event_type") not in ("help_requested", "help_generated", "help_transmitted", "help_displayed", "learner_response_observed"):
        raise ValueError("source_payload requires an explicit valid lifecycle event_type")
    if lifecycle.get("source_id") != identity["source_id"] or lifecycle.get("event_id") != identity["event_id"] or type(lifecycle.get("source_revision")) is not int or lifecycle["source_revision"] != revision:
        raise ValueError("lifecycle identity/revision differs from its native identity")
    # In addition to excluding bool==int, digest checks the JSON domain.
    payload_hash = digest(payload)
    return {"identity": identity, "identity_sha256": digest(identity), "revision": revision,
            "source_payload": deepcopy(payload), "source_payload_sha256": payload_hash}


@contextmanager
def _locked(folder):
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    if folder.is_symlink():
        raise ValueError("ledger directory must not be a symlink")
    path = folder / ".lock"
    if path.is_symlink():
        raise ValueError("ledger lock must not be a symlink")
    with path.open("a", encoding="utf-8") as handle:
        fcntl.flock(handle, fcntl.LOCK_EX)
        yield


def _atomic(path, value):
    encoded = json.dumps(value, ensure_ascii=False, allow_nan=False, indent=2) + "\n"
    if len(encoded.encode("utf-8")) > MAX_STATE_BYTES:
        raise ValueError("cumulative demo ledger would exceed its 100 MB state limit; no state was changed")
    descriptor, temporary = tempfile.mkstemp(prefix=".ledger-", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as output:
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _checked_state(path, namespace):
    if not path.exists():
        return {"schema": LEDGER_SCHEMA, "namespace": namespace, "history": [], "batches": {}}
    if path.is_symlink() or path.stat().st_size > MAX_STATE_BYTES:
        raise ValueError("unsafe or oversized ledger state")
    state = json.loads(path.read_text(encoding="utf-8"))
    expected = state.pop("state_sha256", None)
    if expected != digest(state):
        raise ValueError("ledger state digest mismatch")
    if state.get("schema") != LEDGER_SCHEMA or state.get("namespace") != namespace:
        raise ValueError("ledger namespace differs; keep tenant, key and identity scope stable")
    if not isinstance(state.get("history"), list) or not isinstance(state.get("batches"), dict):
        raise ValueError("invalid ledger state")
    seen = set()
    for stored in state["history"]:
        checked = _event({"native_identity": stored.get("identity"), "source_revision": stored.get("revision"),
                          "source_payload": stored.get("source_payload")})
        if any(stored.get(key) != checked[key] for key in checked):
            raise ValueError("invalid ledger history binding")
        pair = stored["identity_sha256"], stored["revision"]
        if pair in seen:
            raise ValueError("duplicate revision in ledger history")
        seen.add(pair)
    return state


def _active(history):
    active = {}
    for event in history:
        key = event["identity_sha256"]
        if key not in active or event["revision"] > active[key]["revision"]:
            active[key] = event
    return [deepcopy(active[key]) for key in sorted(active)]


def _receipt(stored, history):
    """Reconstruct an immutable historical snapshot from an append-only prefix."""
    length = stored.get("history_revisions")
    if type(length) is not int or not 0 <= length <= len(history):
        raise ValueError("invalid cumulative receipt history length")
    prefix = deepcopy(history[:length])
    active = _active(prefix)
    if digest(prefix) != stored.get("history_sha256") or digest(active) != stored.get("active_snapshot_sha256"):
        raise ValueError("cumulative receipt snapshot binding mismatch")
    return {**deepcopy(stored), "active_snapshot": active, "history": prefix}


def _request_links(active):
    lookup = {(event["identity"]["platform"], event["identity"]["source_id"], event["identity"]["event_id"]): event for event in active}
    resolved, unresolved = 0, 0
    for event in active:
        payload = event["source_payload"]
        reference = payload["lifecycle"].get("request_event_id")
        if reference is None:
            continue
        _text(reference, "request_event_id")
        target = lookup.get((event["identity"]["platform"], event["identity"]["source_id"], reference))
        if target is None:
            unresolved += 1
            continue
        request = target["source_payload"]
        if request["lifecycle"]["event_type"] != "help_requested" or request["scoped_subject"] != payload["scoped_subject"] or request["activity_id"] != payload["activity_id"]:
            raise ValueError("active request link contradicts known source request type, learner or activity")
        resolved += 1
    return {"resolved_within_ledger": resolved, "unresolved_target_absent": unresolved,
            "interpretation": "Checks source-declared references only; unresolved targets do not create requests or prove unsolicited assistance."}


def ingest(folder, batch_id, namespace, observations):
    """Commit a batch once and return its immutable receipt and active snapshot.

    Revisions may arrive out of order. The highest revision is active; every
    distinct revision remains inspectable. A conflicting payload at the same
    revision or changing subject/activity under one native event ID fails the
    complete batch before state mutation. No deletion/tombstone semantics are
    inferred. Batch IDs must identify immutable batches.
    """
    folder = Path(folder)
    _text(batch_id, "batch_id")
    if not isinstance(namespace, dict) or not namespace:
        raise ValueError("ledger namespace is required")
    digest(namespace)
    if not isinstance(observations, list) or len(observations) > 5000:
        raise ValueError("cumulative batch must contain at most 5000 events")
    events = [_event(row) for row in observations]
    by_pair = {}
    for event in events:
        pair = event["identity_sha256"], event["revision"]
        if pair in by_pair and by_pair[pair]["source_payload_sha256"] != event["source_payload_sha256"]:
            raise ValueError("conflicting same revision inside batch")
        by_pair[pair] = event
    unique = [by_pair[key] for key in sorted(by_pair)]
    batch_hash = digest(unique)
    with _locked(folder):
        state_path = folder / "state.json"
        state = _checked_state(state_path, namespace)
        if batch_id in state["batches"]:
            stored = state["batches"][batch_id]
            if stored["batch_sha256"] != batch_hash:
                raise ValueError("batch_id already identifies different native events/revisions")
            return _receipt(stored, state["history"])
        history = deepcopy(state["history"])
        existing = {(e["identity_sha256"], e["revision"]): e for e in history}
        identities = {e["identity_sha256"]: e for e in history}
        added = 0
        for event in unique:
            key = event["identity_sha256"]
            pair = key, event["revision"]
            if pair in existing:
                if existing[pair]["source_payload_sha256"] != event["source_payload_sha256"]:
                    raise ValueError("conflicting payload for existing source event revision")
                continue
            if key in identities:
                old = identities[key]["source_payload"]
                new = event["source_payload"]
                for field in ("scoped_subject", "activity_id"):
                    if not isinstance(new.get(field), str) or new.get(field) != old.get(field):
                        raise ValueError("native event identity changed its subject or activity")
            event["first_batch_id"] = batch_id
            history.append(event)
            existing[pair] = event
            identities[key] = event
            added += 1
        if len(history) > MAX_REVISIONS:
            raise ValueError("cumulative demo ledger exceeds 50000 revision limit")
        active = _active(history)
        request_links = _request_links(active)
        counts = {}
        for event in active:
            kind = event["source_payload"]["lifecycle"]["event_type"]
            counts[kind] = counts.get(kind, 0) + 1
        source_kinds = sorted({event["source_payload"].get("source_kind", "unverified_user_input") for event in active})
        receipt = {"schema": "qlm-cumulative-batch-receipt-0.1.0", "batch_id": batch_id,
                   "batch_sha256": batch_hash, "input_events": len(events), "distinct_batch_revisions": len(unique),
                   "new_revisions": added, "active_events": len(active), "history_revisions": len(history),
                   "active_event_counts": counts, "active_snapshot_sha256": digest(active), "history_sha256": digest(history),
                   "request_link_checks": request_links,
                   "source_kinds": source_kinds, "scope": "synthetic_contract_test_only" if source_kinds == ["synthetic_fixture"] else "source_assertions_not_independently_validated",
                   "cross_source_learner_linkage": "not_performed",
                   "limitations": ["Counts describe explicit recorded source events, not help effectiveness or learning.",
                                   "Highest numeric source revision is active; older revisions remain in history.",
                                   "Source event identifiers and revisions must be stable and source-authoritative.",
                                   "No event deletion is inferred from absence in a later batch.",
                                   "Active event totals are structural transport counts; they do not establish compatible measurement across sources.",
                                   "This bounded file ledger rewrites its state; large studies require a transactional store and explicit migration.",
                                   "Stored hashes detect accidental alteration; they do not authenticate the source."]}
        state["history"] = history
        # Compact receipts bind an immutable history prefix. Delayed retries
        # reconstruct their original snapshot after subsequent batches commit,
        # without duplicating full history inside every stored batch receipt.
        state["batches"][batch_id] = receipt
        state["state_sha256"] = digest(state)
        _atomic(state_path, state)
        return _receipt(receipt, history)
