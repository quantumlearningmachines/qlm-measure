"""
qlm-measure CLI — verify evidence records from the command line.

Entry point: qlm-measure (via pyproject.toml [project.scripts])

Commands:
  verify PATH [PATH ...] [--format text|json] [--report FILE] [--tolerance-ms N] [--redact] [--quiet]
  explain [CHECK_ID]
  version

verify makes no network calls. Records never leave your machine.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__
from .checks import CATALOG, CATALOG_BY_ID, SHIPPED_CHECKS, PLANNED_CHECKS
from .io import load_records, LoadError
from .report import build_report, format_text
from .verifier import verify_record


def cmd_verify(args: argparse.Namespace) -> int:
    """Verify one or more evidence record files. Returns exit code."""
    all_records: list[dict] = []
    all_results = []
    all_paths: list[str] = []

    for path in args.paths:
        try:
            records = load_records(path)
        except LoadError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2
        except FileNotFoundError:
            print(f"error: file not found: {path}", file=sys.stderr)
            return 2
        except OSError as e:
            print(f"error: {e}", file=sys.stderr)
            return 2

        for record in records:
            # Dispatch by schema version
            sv = record.get("schemaVersion", "0.2")
            if sv == "0.3" or "evidence" in record:
                from .verifier_v03 import verify_record_v03
                result = verify_record_v03(record, timestamp_tolerance_ms=args.tolerance_ms)
            else:
                result = verify_record(record, timestamp_tolerance_ms=args.tolerance_ms)
            all_records.append(record)
            all_results.append(result)

        all_paths.append(path)

    if not all_records:
        print("error: no records loaded", file=sys.stderr)
        return 2

    # Use the first path as the label (or combine for multi-path)
    label = all_paths[0] if len(all_paths) == 1 else f"{len(all_paths)} files"

    if args.format == "json" or args.report:
        report = build_report(label, all_records, all_results, redact=args.redact)
        report_json = json.dumps(report, indent=2)

        if args.report:
            Path(args.report).write_text(report_json + "\n")

        if args.format == "json":
            print(report_json)
        elif not args.quiet:
            print(format_text(label, all_records, all_results, redact=args.redact), end="")
    else:
        if not args.quiet:
            print(format_text(label, all_records, all_results, redact=args.redact), end="")

    any_invalid = any(not r.valid for r in all_results)
    return 1 if any_invalid else 0


def cmd_explain(args: argparse.Namespace) -> int:
    """Print check catalog or explain a single check."""
    if args.check_id:
        check = CATALOG_BY_ID.get(args.check_id)
        if not check:
            print(f"error: unknown check ID: {args.check_id}", file=sys.stderr)
            print(f"Available: {', '.join(c.id for c in CATALOG)}", file=sys.stderr)
            return 2
        print(f"{check.id} — {check.label}")
        print(f"  Status:    {check.status}")
        print(f"  Category:  {check.category}")
        print(f"  Scope:     {check.scope}")
        print(f"  Since:     {check.introduced_in}")
        print()
        print(f"  {check.description}")
        print()
        print(f"  How to pass: {check.how_to_pass}")
    else:
        print(f"qlm-measure check catalog (v1)")
        print()
        print("Shipped checks (run by verify):")
        for check in SHIPPED_CHECKS:
            print(f"  {check.id:<28s} {check.label}")
        print()
        print("Planned checks (listed, not run):")
        for check in PLANNED_CHECKS:
            print(f"  {check.id:<28s} {check.label}")
        print()
        print(f"Use 'qlm-measure explain CHECK_ID' for details on a specific check.")
    return 0


def cmd_import(args: argparse.Namespace) -> int:
    """Import xAPI/Caliper/CSV into Level 1 evidence records."""
    import os
    from .recorder import Recorder
    from .adapters.common import infer_sessions, ImportReport, salt_fingerprint
    from .verifier_v03 import verify_record_v03

    # Load salt
    salt = None
    if args.salt_file:
        with open(args.salt_file, "rb") as f:
            salt = f.read().strip()
    elif args.salt_env:
        salt = os.environ.get(args.salt_env, "").encode()
    if not salt:
        print("error: --salt-file or --salt-env is required for pseudonymization", file=sys.stderr)
        return 2

    # Parse session config
    session_method = "gap"
    session_gap = 30
    session_column = None
    if args.session.startswith("gap:"):
        session_gap = int(args.session.split(":")[1])
    elif args.session.startswith("column:"):
        session_method = "column"
        session_column = args.session.split(":", 1)[1]
    elif args.session == "registration":
        session_method = "registration"

    report = ImportReport(adapter=args.from_format, salt_fingerprint=salt_fingerprint(salt))

    # Load and convert events
    all_events = []
    total_items = 0

    for source_path in args.sources:
        if args.from_format == "xapi":
            from .adapters.xapi import load_xapi_statements, to_observation_event
            statements = load_xapi_statements(source_path)
            total_items += len(statements)
            for stmt in statements:
                event, skip_reason = to_observation_event(stmt, salt,
                    mapping=json.load(open(args.mapping)) if args.mapping else None)
                if event:
                    all_events.append(event)
                    report.mapped += 1
                else:
                    report.skipped[skip_reason] = report.skipped.get(skip_reason, 0) + 1

        elif args.from_format == "caliper":
            from .adapters.caliper import load_caliper_events, join_item_and_grade_events, to_observation_event as caliper_to_event
            raw_events = load_caliper_events(source_path)
            joined = join_item_and_grade_events(raw_events)
            total_items += len(raw_events)
            for ev in joined:
                event, skip_reason = caliper_to_event(ev, salt,
                    mapping=json.load(open(args.mapping)) if args.mapping else None)
                if event:
                    all_events.append(event)
                    report.mapped += 1
                else:
                    report.skipped[skip_reason] = report.skipped.get(skip_reason, 0) + 1

        elif args.from_format == "csv":
            if not args.mapping:
                print("error: --mapping is required for CSV import", file=sys.stderr)
                return 2
            from .adapters.csv_adapter import csv_to_events, load_mapping
            mapping = load_mapping(args.mapping)
            events, skipped = csv_to_events(source_path, mapping, salt)
            all_events.extend(events)
            report.mapped += len(events)
            for reason, count in skipped.items():
                report.skipped[reason] = report.skipped.get(reason, 0) + count
            total_items += len(events) + sum(skipped.values())

    if args.dry_run:
        print(f"Dry run: {report.mapped} events mapped, {sum(report.skipped.values())} skipped")
        for e in all_events[:20]:
            print(f"  {e.get('timestamp', '?')} correct={e.get('correct')} domain={e.get('domain')}")
        return 0

    # Session inference
    all_events = infer_sessions(all_events, method=session_method,
                                 gap_minutes=session_gap, column=session_column)

    # Group by learner, produce records
    by_learner: dict[str, list[dict]] = {}
    for e in all_events:
        lid = e.get("studentId", "unknown")
        by_learner.setdefault(lid, []).append(e)

    os.makedirs(args.out, exist_ok=True)
    all_records = []

    for learner_id, events in by_learner.items():
        rec = Recorder(scope_id=learner_id)
        for e in sorted(events, key=lambda x: x.get("timestamp", "")):
            # Remove internal fields
            clean = {k: v for k, v in e.items() if not k.startswith("_")}
            rec.append(clean)

        record = rec.export()
        # Add provenance
        record["evidence"]["provenance"] = "imported"
        record["evidence"]["import"] = {
            "adapter": args.from_format,
            "adapterVersion": "0.2.2",
            "saltFingerprint": salt_fingerprint(salt),
            "sessionInference": {"method": session_method, "gapMinutes": session_gap},
        }

        # Verify
        result = verify_record_v03(record)
        if result.valid:
            report.verified_clean += 1

        # Write
        out_path = os.path.join(args.out, f"{learner_id}.json")
        with open(out_path, "w") as f:
            json.dump(record, f, indent=1, default=str)
        all_records.append(record)

    # Write all.jsonl
    jsonl_path = os.path.join(args.out, "all.jsonl")
    with open(jsonl_path, "w") as f:
        for r in all_records:
            f.write(json.dumps(r, default=str) + "\n")

    report.records = len(all_records)
    report.sessions = {"method": session_method, "inferred": 0}

    print(f"Imported: {report.mapped} events -> {report.records} records")
    print(f"  Verified clean: {report.verified_clean}/{report.records}")
    print(f"  Skipped: {report.skipped}")
    print(f"  Output: {args.out}/")

    if args.report:
        with open(args.report, "w") as f:
            json.dump(report.to_dict(), f, indent=2)
        print(f"  Report: {args.report}")

    if not report.validate_counts(total_items):
        print(f"  WARNING: count mismatch — mapped ({report.mapped}) + skipped ({sum(report.skipped.values())}) != total ({total_items})")

    return 0 if report.verified_clean == report.records else 1


def cmd_version(args: argparse.Namespace) -> int:
    """Print version information."""
    print(f"qlm-measure {__version__}")
    print(f"schema version: 0.2")
    print(f"catalog version: 1")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="qlm-measure",
        description="Verify evidence records. Makes no network calls.",
    )
    subparsers = parser.add_subparsers(dest="command")

    # verify
    p_verify = subparsers.add_parser("verify", help="Verify evidence record file(s)")
    p_verify.add_argument("paths", nargs="+", metavar="PATH", help="Record file(s), or - for stdin")
    p_verify.add_argument("--format", choices=["text", "json"], default="text")
    p_verify.add_argument("--report", metavar="FILE", help="Write JSON report to FILE")
    p_verify.add_argument("--tolerance-ms", type=int, default=1000, help="Timestamp tolerance in ms (default: 1000)")
    p_verify.add_argument("--redact", action="store_true", help="Redact studentScopeId in output")
    p_verify.add_argument("--quiet", action="store_true", help="Suppress text output (use with --report)")
    p_verify.set_defaults(func=cmd_verify)

    # explain
    p_explain = subparsers.add_parser("explain", help="Explain a check or list all checks")
    p_explain.add_argument("check_id", nargs="?", default=None, metavar="CHECK_ID")
    p_explain.set_defaults(func=cmd_explain)

    # import
    p_import = subparsers.add_parser("import", help="Import xAPI/Caliper/CSV into records")
    p_import.add_argument("sources", nargs="+", metavar="SOURCE")
    p_import.add_argument("--from", dest="from_format", required=True, choices=["xapi", "caliper", "csv"])
    p_import.add_argument("--out", required=True, metavar="DIR", help="Output directory")
    p_import.add_argument("--salt-file", metavar="FILE", help="HMAC salt file (required)")
    p_import.add_argument("--salt-env", metavar="VAR", help="HMAC salt from env var")
    p_import.add_argument("--mapping", metavar="FILE", help="Column mapping (required for CSV)")
    p_import.add_argument("--session", default="gap:30", help="Session inference (gap:N, column:NAME, registration)")
    p_import.add_argument("--report", metavar="FILE", help="Write import report JSON")
    p_import.add_argument("--dry-run", action="store_true")
    p_import.set_defaults(func=cmd_import)

    # version
    p_version = subparsers.add_parser("version", help="Print version info")
    p_version.set_defaults(func=cmd_version)

    args = parser.parse_args(argv)
    if not args.command:
        parser.print_help()
        return 2

    return args.func(args)


def cli_entry():
    """Entry point for [project.scripts]."""
    sys.exit(main())


if __name__ == "__main__":
    sys.exit(main())
