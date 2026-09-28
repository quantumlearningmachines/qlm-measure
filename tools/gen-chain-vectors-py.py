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
