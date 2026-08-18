"""
Structured report and text formatter for verification results.

Report schema matches schema/report.schema.json.
Text format mirrors the published card: checks grouped by category,
checkmarks, counts, verdict line.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from . import __version__
from .checks import SHIPPED_CHECKS, SHIPPED_CHECKS_V03, CATALOG_BY_ID, CATEGORIES, CATEGORIES_V03, CheckDef
from .verifier import VerificationResult, Violation


def _input_sha256(path: str) -> str:
    """SHA-256 of the input file. Returns empty string for stdin."""
    if path == "-" or path == "<stdin>":
        return ""
    try:
        with open(path, "rb") as f:
            return hashlib.sha256(f.read()).hexdigest()
    except OSError:
        return ""


def _redact_scope_id(scope_id: str) -> str:
    return hashlib.sha256(scope_id.encode()).hexdigest()[:12]


def build_report(
    path: str,
    records: list[dict],
    results: list[VerificationResult],
    redact: bool = False,
) -> dict[str, Any]:
    """Build the structured JSON report."""
    record_reports = []
    total_checks_run = 0
    total_passed = 0
    total_failed = 0
    total_na = 0
    n_valid = 0
    n_invalid = 0

    for record, result in zip(records, results):
        scope_id = record.get("studentScopeId", "")
        if redact:
            scope_id = _redact_scope_id(scope_id)
        schema_version = record.get("schemaVersion", "0.2")
        is_v03 = record.get("schemaVersion") == "0.3" or "evidence" in record
        checks_list = SHIPPED_CHECKS_V03 if is_v03 else SHIPPED_CHECKS
        has_compaction = record.get("compactedBefore") is not None or (record.get("evidence", {}).get("compactedBefore") is not None if is_v03 else False)
        has_posteriors = any(
            isinstance(e.get("updatedPosterior"), (int, float))
            for e in record.get("entries", [])
        )

        # Build per-check results
        check_results = []
        violations_by_check: dict[str, list[Violation]] = {}
        for v in result.violations:
            check_id = v.check_id if hasattr(v, "check_id") else _infer_check_id(v.category)
            violations_by_check.setdefault(check_id, []).append(v)

        for check_def in checks_list:
            vlist = violations_by_check.get(check_def.id, [])
            # Compaction check is not_applicable when no compaction
            if check_def.id == "COMPACTION.BOUNDARY" and not has_compaction:
                status = "not_applicable"
                total_na += 1
            elif check_def.id == "POSTERIOR.CHAIN" and not has_posteriors:
                status = "not_applicable"
                total_na += 1
            elif vlist:
                status = "fail"
                total_failed += 1
            else:
                status = "pass"
                total_passed += 1
            total_checks_run += 1

            entry: dict[str, Any] = {
                "id": check_def.id,
                "status": status,
                "failures": len(vlist),
            }
            if vlist:
                entry["first_failure"] = {
                    "version": vlist[0].version,
                    "message": vlist[0].message,
                }
            check_results.append(entry)

        # Build violations list
        violation_dicts = []
        for v in result.violations:
            check_id = v.check_id if hasattr(v, "check_id") else _infer_check_id(v.category)
            violation_dicts.append({
                "version": v.version,
                "check_id": check_id,
                "category": v.category,
                "message": v.message,
            })

        valid = result.valid
        if valid:
            n_valid += 1
        else:
            n_invalid += 1

        record_reports.append({
            "studentScopeId": scope_id,
            "schemaVersion": schema_version,
            "entries_checked": result.entries_checked,
            "valid": valid,
            "checks": check_results,
            "violations": violation_dicts,
        })

    return {
        "tool": {
            "name": "qlm-measure",
            "version": __version__,
            "language": "python",
            "catalog_version": "1",
        },
        "input": {
            "path": path.split("/")[-1] if "/" in path else path,
            "sha256": _input_sha256(path),
            "records": len(records),
        },
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "records": record_reports,
        "summary": {
            "records": len(records),
            "valid": n_valid,
            "invalid": n_invalid,
            "checks_run": total_checks_run - total_na,
            "checks_passed": total_passed,
            "checks_failed": total_failed,
            "checks_not_applicable": total_na,
        },
    }


def _infer_check_id(category: str) -> str:
    """Map old-style category to check ID for backwards compatibility."""
    mapping = {
        "schema": "SCHEMA.REQUIRED",
        "version": "VERSION.MONOTONIC",
        "timestamp": "TIMESTAMP.MONOTONIC",
        "enum": "ENUM.VALID",
        "hash": "HASH.ENTRY_RECOMPUTE",
        "posterior": "POSTERIOR.CHAIN",
        "compaction": "COMPACTION.BOUNDARY",
    }
    return mapping.get(category, f"UNKNOWN.{category.upper()}")


def format_text(
    path: str,
    records: list[dict],
    results: list[VerificationResult],
    redact: bool = False,
) -> str:
    """Format verification results as human-readable text."""
    lines = []
    filename = path.split("/")[-1] if "/" in path else path
    lines.append(f"qlm-measure verify {filename}")
    lines.append(f"records: {len(records)}")

    total_valid = 0
    total_invalid = 0
    total_checks_run = 0
    total_passed = 0
    total_failed = 0
    total_na = 0

    for record, result in zip(records, results):
        scope_id = record.get("studentScopeId", "?")
        if redact:
            scope_id = _redact_scope_id(scope_id)
        schema_version = record.get("schemaVersion", "0.2")
        n_entries = len(record.get("entries", []))
        is_v03_t = record.get("schemaVersion") == "0.3" or "evidence" in record
        checks_list_t = SHIPPED_CHECKS_V03 if is_v03_t else SHIPPED_CHECKS
        categories_t = CATEGORIES_V03 if is_v03_t else CATEGORIES
        entries_t = record.get("entries", []) or (record.get("evidence", {}).get("entries", []) if is_v03_t else [])
        has_compaction = record.get("compactedBefore") is not None or (record.get("evidence", {}).get("compactedBefore") is not None if is_v03_t else False)
        has_posteriors_t = any(
            isinstance(e.get("updatedPosterior"), (int, float))
            for e in entries_t
        )
        n_entries = len(entries_t)

        lines.append("")
        lines.append(f"record {scope_id}  (schema {schema_version}, {n_entries} entries)")
        # Override n_entries for header (was computed from entries_t above)

        # Group violations by check_id
        violations_by_check: dict[str, list[Violation]] = {}
        for v in result.violations:
            check_id = v.check_id if hasattr(v, "check_id") else _infer_check_id(v.category)
            violations_by_check.setdefault(check_id, []).append(v)

        # Print by category
        for category in categories_t:
            lines.append(f"  {category}")
            category_checks = [c for c in checks_list_t if c.category == category]
            for check_def in category_checks:
                vlist = violations_by_check.get(check_def.id, [])
                if check_def.id == "COMPACTION.BOUNDARY" and not has_compaction:
                    lines.append(f"    \u2013 {check_def.label}  (not applicable)")
                    total_na += 1
                elif check_def.id == "POSTERIOR.CHAIN" and not has_posteriors_t:
                    lines.append(f"    \u2013 {check_def.label}  (not applicable)")
                    total_na += 1
                elif vlist:
                    first = vlist[0]
                    detail = f"{len(vlist)} failure{'s' if len(vlist) > 1 else ''}; first at v{first.version}: {first.message}"
                    lines.append(f"    \u2717 {check_def.label}  ({detail})")
                    total_failed += 1
                else:
                    lines.append(f"    \u2713 {check_def.label}")
                    total_passed += 1
                total_checks_run += 1

        n_violations = len(result.violations)
        lines.append(f"  violations: {n_violations}")
        if result.valid:
            lines.append("  VERDICT: CLEAN \u2014 record is verifiable")
            total_valid += 1
        else:
            lines.append(f"  VERDICT: NOT CLEAN \u2014 {n_violations} violation(s); see report")
            total_invalid += 1

    lines.append("")
    checks_run_display = total_checks_run - total_na
    lines.append(
        f"summary: {len(records)} record(s), {total_valid} valid, {total_invalid} invalid; "
        f"checks run {checks_run_display}, passed {total_passed}, failed {total_failed}, "
        f"not applicable {total_na}"
    )
    return "\n".join(lines) + "\n"
