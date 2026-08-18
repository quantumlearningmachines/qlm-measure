#!/usr/bin/env python3
"""
make_samples.py — builds the qlm-measure public sample bundle.

- Records are SYNTHETIC. No real learner data. Identifiers are pseudonymous by construction.
- Entry hashes are computed with the shipped verifier's own canonicalizer/hash
  (qlm_measure.verifier._hash_entry, 0.1.1), so `verify_record` accepts them today.
- Weights and posteriors are ILLUSTRATIVE values. The public verifier checks that
  posteriors chain (prior == previous updated); it does not check how they were computed.
- Expected reports are written in the report shape specified in Engineering Brief Item 1
  (schema/report.schema.json). Tests should compare everything except `tool` and `generated_at`.

Usage:
    python tools/make_samples.py [--out samples]

Regenerate after any change to canonicalization (Item 1, §2.2) — hashes will change.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from qlm_measure.verifier import _hash_entry, verify_record  # shipped 0.1.1 canonicalizer + verifier

TOOL = {"name": "qlm-measure", "version": "0.2.2", "language": "python", "catalog_version": "1"}
GENERATED_AT = "2026-08-18T00:00:00Z"  # fixed for determinism; ignore in comparisons

# Catalog v1 (Item 1 §4), shipped checks only, in report order.
CATALOG = [
    ("SCHEMA.REQUIRED", "Required fields present"),
    ("SCHEMA.TYPES", "Field types valid"),
    ("SCHEMA.TIMESTAMP_FORMAT", "Timestamp is ISO 8601"),
    ("VERSION.MONOTONIC", "Versions strictly increase"),
    ("TIMESTAMP.MONOTONIC", "Timestamps do not go backward"),
    ("ENUM.VALID", "Enum values permitted"),
    ("HASH.PREV_LINK", "Chain link valid"),
    ("HASH.ENTRY_RECOMPUTE", "Entry hash recomputes"),
    ("POSTERIOR.CHAIN", "Posterior chain consistent"),
    ("COMPACTION.BOUNDARY", "Compaction boundary intact"),
]

REQUIRED_NUMERIC = ("evidentialWeight", "priorPosterior", "updatedPosterior")


# ── record construction ──────────────────────────────────────────────────────

def ts(base: datetime, seconds: int) -> str:
    return (base + timedelta(seconds=seconds)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def build_record(scope: str, session: str, base: datetime, steps: list[dict], *,
                 level1: bool = False, compacted_before: dict | None = None) -> dict:
    """steps: list of dicts with keys t, scaffold, correct, rt, triage, mode?, w, prior, post, extra?"""
    entries = []
    prev_hash = compacted_before["summaryHash"] if compacted_before else ""
    start_version = (compacted_before["version"] + 1) if compacted_before else 1
    for i, s in enumerate(steps):
        event = {
            "studentId": scope,
            "sessionId": session,
            "source": "qlm-measure-samples",
            "timestamp": ts(base, s["t"]),
            "correct": s["correct"],
            "responseTimeMs": s["rt"],
            "domain": "math",
            "skillId": "fractions.equivalence",
            "scaffoldType": s["scaffold"],
            "ext": {"itemId": s["item"], "synthetic": True},
        }
        if s.get("misconceptionId"):
            event["misconceptionId"] = s["misconceptionId"]
        if s.get("mode"):
            event["epistemicMode"] = s["mode"]
        for k in ("isTransferProblem", "explanationQuality", "selfCorrected"):
            if k in s:
                event[k] = s[k]

        entry = {
            "version": start_version + i,
            "timestamp": event["timestamp"],
            "event": event,
            "scaffoldType": s["scaffold"],
        }
        if not level1:
            entry["triageResult"] = s["triage"]
            if s.get("mode"):
                entry["epistemicMode"] = s["mode"]
            entry["evidentialWeight"] = s["w"]
            entry["priorPosterior"] = s["prior"]
            entry["updatedPosterior"] = s["post"]
        entry["prevHash"] = prev_hash
        entry["entryHash"] = _hash_entry(entry)
        prev_hash = entry["entryHash"]
        entries.append(entry)

    rec = {"studentScopeId": scope, "schemaVersion": "0.2", "entries": entries}
    if compacted_before:
        rec["compactedBefore"] = compacted_before
    return rec


# One synthetic learner, one session, six interactions on fraction equivalence.
# Story: a misconception on the first item, a hint, then unscaffolded and transfer success.
BASE = datetime(2026, 8, 15, 14, 20, 0, tzinfo=timezone.utc)
STEPS_0042 = [
    dict(t=0,   item="FR-EQ-01", scaffold="none",    correct=False, rt=9200, triage="misconception",
         misconceptionId="sample:frac-add-across", mode="inference", w=1.00, prior=0.3500, post=0.0631),
    dict(t=41,  item="FR-EQ-02", scaffold="hint",    correct=True,  rt=6100, triage="correct",
         mode="inference", w=0.42, prior=0.0631, post=0.1124),
    dict(t=99,  item="FR-EQ-03", scaffold="none",    correct=True,  rt=4300, triage="correct",
         w=1.00, prior=0.1124, post=0.3630),
    dict(t=172, item="FR-EQ-04", scaffold="explain", correct=True,  rt=3800, triage="correct",
         mode="testimony", w=0.30, prior=0.3630, post=0.4723),
    dict(t=238, item="FR-EQ-05", scaffold="probing", correct=True,  rt=5200, triage="correct",
         mode="inference", explanationQuality=0.7, w=0.75, prior=0.4723, post=0.7344),
    dict(t=287, item="FR-EQ-06", scaffold="none",    correct=True,  rt=3100, triage="correct",
         isTransferProblem=True, w=1.00, prior=0.7344, post=0.9256),
]
STEPS_0043 = [
    dict(t=0,   item="FR-EQ-01", scaffold="none",    correct=True,  rt=5100, triage="correct", w=1.00, prior=0.3500, post=0.7079),
    dict(t=63,  item="FR-EQ-02", scaffold="none",    correct=True,  rt=4400, triage="correct", w=1.00, prior=0.7079, post=0.9161),
    dict(t=120, item="FR-EQ-03", scaffold="none",    correct=False, rt=2900, triage="slip",    w=1.00, prior=0.9161, post=0.5773),
    dict(t=201, item="FR-EQ-06", scaffold="none",    correct=True,  rt=3600, triage="correct", isTransferProblem=True, w=1.00, prior=0.5773, post=0.8601),
]
STEPS_0044 = [
    dict(t=0,   item="FR-EQ-01", scaffold="none",    correct=False, rt=7700, triage="misconception",
         misconceptionId="sample:frac-bigger-denominator", w=1.00, prior=0.3500, post=0.0631),
    dict(t=55,  item="FR-EQ-02", scaffold="explain", correct=True,  rt=5000, triage="correct", mode="testimony", w=0.30, prior=0.0631, post=0.0902),
    dict(t=118, item="FR-EQ-02", scaffold="hint",    correct=True,  rt=4700, triage="correct", w=0.42, prior=0.0902, post=0.1571),
    dict(t=190, item="FR-EQ-03", scaffold="none",    correct=False, rt=6800, triage="misconception",
         misconceptionId="sample:frac-bigger-denominator", w=1.00, prior=0.1571, post=0.0227),
    dict(t=260, item="FR-EQ-04", scaffold="probing", correct=True,  rt=6900, triage="correct", mode="inference", explanationQuality=0.4, w=0.75, prior=0.0227, post=0.0666),
]


# ── expected-report generation ───────────────────────────────────────────────

def parse_ts_ok(s: str) -> bool:
    try:
        datetime.fromisoformat(s.replace("Z", "+00:00"))
        return True
    except Exception:
        return False


def map_violation(v, entry_by_version: dict) -> str:
    cat, msg = v.category, v.message
    if cat == "schema":
        if "studentScopeId" in msg or "timestamp is required" in msg:
            return "SCHEMA.REQUIRED"
        if "must be a number" in msg:
            field = msg.split(" must be a number")[0]
            e = entry_by_version.get(v.version, {})
            return "SCHEMA.REQUIRED" if field not in e else "SCHEMA.TYPES"
        return "SCHEMA.TYPES"
    if cat == "version":
        return "VERSION.MONOTONIC"
    if cat == "timestamp":
        return "TIMESTAMP.MONOTONIC"
    if cat == "enum":
        return "ENUM.VALID"
    if cat == "hash":
        return "HASH.PREV_LINK" if "prevHash" in msg else "HASH.ENTRY_RECOMPUTE"
    if cat == "posterior":
        return "POSTERIOR.CHAIN"
    return "SCHEMA.TYPES"


def expected_report(path_name: str, file_bytes: bytes, records: list[dict]) -> dict:
    out_records = []
    tot = dict(run=0, passed=0, failed=0, na=0)
    for rec in records:
        res = verify_record(rec)
        entry_by_version = {e.get("version"): e for e in rec.get("entries", [])}
        violations = []
        counts: dict[str, list] = {cid: [] for cid, _ in CATALOG}
        for v in res.violations:
            cid = map_violation(v, entry_by_version)
            item = {"version": v.version, "check_id": cid, "category": v.category, "message": v.message}
            violations.append(item)
            counts[cid].append(item)
        # checks the 0.1.1 verifier does not emit explicitly
        for e in rec.get("entries", []):
            if not parse_ts_ok(e.get("timestamp", "")):
                item = {"version": e.get("version"), "check_id": "SCHEMA.TIMESTAMP_FORMAT",
                        "category": "schema", "message": "timestamp is not ISO 8601"}
                violations.append(item)
                counts["SCHEMA.TIMESTAMP_FORMAT"].append(item)
        checks = []
        for cid, _label in CATALOG:
            if cid == "COMPACTION.BOUNDARY" and not rec.get("compactedBefore"):
                status = "not_applicable"
            elif cid == "POSTERIOR.CHAIN" and not any(
                isinstance(e.get("updatedPosterior"), (int, float)) for e in rec.get("entries", [])
            ):
                status = "not_applicable"  # nothing to chain (Level 1 record); see README
            elif cid == "COMPACTION.BOUNDARY":
                # 0.1.1 surfaces a broken boundary as HASH.PREV_LINK/VERSION at the first entry
                first = rec["entries"][0] if rec.get("entries") else None
                broken = first is not None and (
                    first.get("prevHash") != rec["compactedBefore"].get("summaryHash")
                    or first.get("version", 0) <= rec["compactedBefore"].get("version", 0)
                )
                status = "fail" if broken else "pass"
            else:
                status = "fail" if counts[cid] else "pass"
            entry = {"id": cid, "status": status, "failures": len(counts[cid])}
            if counts[cid]:
                entry["first_failure"] = {"version": counts[cid][0]["version"], "message": counts[cid][0]["message"]}
            checks.append(entry)
            if status == "not_applicable":
                tot["na"] += 1
            else:
                tot["run"] += 1
                tot["passed" if status == "pass" else "failed"] += 1
        out_records.append({
            "studentScopeId": rec.get("studentScopeId"),
            "schemaVersion": rec.get("schemaVersion", "0.2"),
            "entries_checked": res.entries_checked,
            "valid": len(violations) == 0,
            "checks": checks,
            "violations": violations,
        })
    return {
        "tool": TOOL,
        "input": {"path": path_name, "sha256": hashlib.sha256(file_bytes).hexdigest(), "records": len(records)},
        "generated_at": GENERATED_AT,
        "records": out_records,
        "summary": {
            "records": len(records),
            "valid": sum(1 for r in out_records if r["valid"]),
            "invalid": sum(1 for r in out_records if not r["valid"]),
            "checks_run": tot["run"], "checks_passed": tot["passed"],
            "checks_failed": tot["failed"], "checks_not_applicable": tot["na"],
        },
    }


def render_text(report: dict) -> str:
    groups = [
        ("Schema", ["SCHEMA.REQUIRED", "SCHEMA.TYPES", "SCHEMA.TIMESTAMP_FORMAT"]),
        ("Sequence", ["VERSION.MONOTONIC", "TIMESTAMP.MONOTONIC"]),
        ("Enums", ["ENUM.VALID"]),
        ("Hash chain", ["HASH.PREV_LINK", "HASH.ENTRY_RECOMPUTE"]),
        ("Posterior chain", ["POSTERIOR.CHAIN"]),
        ("Compaction", ["COMPACTION.BOUNDARY"]),
    ]
    labels = dict(CATALOG)
    lines = [f"qlm-measure verify {report['input']['path']}",
             f"records: {report['input']['records']}", ""]
    for r in report["records"]:
        lines.append(f"record {r['studentScopeId']}  (schema {r['schemaVersion']}, {r['entries_checked']} entries)")
        by_id = {c["id"]: c for c in r["checks"]}
        for gname, ids in groups:
            lines.append(f"  {gname}")
            for cid in ids:
                c = by_id[cid]
                mark = {"pass": "✓", "fail": "✗", "not_applicable": "–"}[c["status"]]
                tail = ""
                if c["status"] == "fail":
                    tail = f"  ({c['failures']} failure{'s' if c['failures'] != 1 else ''}; first at v{c['first_failure']['version']}: {c['first_failure']['message']})"
                elif c["status"] == "not_applicable":
                    tail = "  (not applicable)"
                lines.append(f"    {mark} {labels[cid]}{tail}")
        n = len(r["violations"])
        lines.append(f"  violations: {n}")
        lines.append("  VERDICT: CLEAN — record is verifiable" if r["valid"]
                     else f"  VERDICT: NOT CLEAN — {n} violation(s); see report")
        lines.append("")
    s = report["summary"]
    lines.append(f"summary: {s['records']} record(s), {s['valid']} valid, {s['invalid']} invalid; "
                 f"checks run {s['checks_run']}, passed {s['checks_passed']}, failed {s['checks_failed']}, "
                 f"not applicable {s['checks_not_applicable']}")
    return "\n".join(lines) + "\n"


# ── mutations ────────────────────────────────────────────────────────────────

def tamper_value(rec: dict) -> dict:
    r = copy.deepcopy(rec)
    r["entries"][2]["updatedPosterior"] = round(r["entries"][2]["updatedPosterior"] + 0.1000, 4)  # v3 edited after hashing
    return r


def drop_entry(rec: dict) -> dict:
    r = copy.deepcopy(rec)
    del r["entries"][3]  # remove v4; v5 still links to v4's hash and prior
    return r


def reorder(rec: dict) -> dict:
    r = copy.deepcopy(rec)
    r["entries"][2], r["entries"][3] = r["entries"][3], r["entries"][2]  # swap v3 and v4
    return r


# ── main ─────────────────────────────────────────────────────────────────────

def dumps(obj) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="samples")
    args = ap.parse_args()
    out = Path(args.out)
    (out / "expected").mkdir(parents=True, exist_ok=True)

    clean = build_record("syn-8f2c-0042", "sess-2026-08-15-003", BASE, STEPS_0042)
    r43 = build_record("syn-8f2c-0043", "sess-2026-08-15-004", BASE + timedelta(minutes=35), STEPS_0043)
    r44 = build_record("syn-8f2c-0044", "sess-2026-08-15-005", BASE + timedelta(minutes=70), STEPS_0044)
    level1 = build_record("syn-8f2c-0042", "sess-2026-08-15-003", BASE, STEPS_0042, level1=True)
    summary_hash = hashlib.sha256(b"qlm-measure-samples:compaction-summary:syn-8f2c-0042:v4").hexdigest()
    compacted = build_record("syn-8f2c-0042", "sess-2026-08-15-003", BASE, STEPS_0042[4:],
                             compacted_before={"version": 4, "summaryHash": summary_hash})

    files: dict[str, tuple[str, list[dict]]] = {
        "clean.json": (dumps(clean), [clean]),
        "clean.jsonl": ("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in (clean, r43, r44)), [clean, r43, r44]),
        "tampered_value.json": (dumps(tamper_value(clean)), [tamper_value(clean)]),
        "dropped_entry.json": (dumps(drop_entry(clean)), [drop_entry(clean)]),
        "reordered.json": (dumps(reorder(clean)), [reorder(clean)]),
        "level1_only.json": (dumps(level1), [level1]),
        "compacted_clean.json": (dumps(compacted), [compacted]),
    }

    manifest = {"generated_at": GENERATED_AT, "generator": "tools/make_samples.py",
                "hashed_with": "qlm_measure 0.1.1 verifier._hash_entry (canonical JSON: sorted keys, no whitespace)",
                "files": {}}
    for name, (text, records) in files.items():
        data = text.encode("utf-8")
        (out / name).write_bytes(data)
        rep = expected_report(name, data, records)
        stem = name.replace(".jsonl", ".jsonl").rsplit(".", 1)[0] + ("_jsonl" if name.endswith(".jsonl") else "")
        (out / "expected" / f"{stem}.report.json").write_text(dumps(rep), encoding="utf-8")
        (out / "expected" / f"{stem}.txt").write_text(render_text(rep), encoding="utf-8")
        manifest["files"][name] = {"sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
                                   "records": len(records),
                                   "expected_valid": rep["summary"]["invalid"] == 0}
    (out / "MANIFEST.json").write_text(dumps(manifest), encoding="utf-8")

    for name, info in manifest["files"].items():
        print(f"{name:22s} records={info['records']} valid={info['expected_valid']}")


if __name__ == "__main__":
    main()
