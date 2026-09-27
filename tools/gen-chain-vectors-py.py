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
