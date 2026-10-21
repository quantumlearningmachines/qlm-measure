#!/usr/bin/env python3
"""Validate assistance captures, load private SQLite, publish aggregate SQL only.

No source-specific JSON is parsed here. The same query is executed after capture
extraction from the direct profile, draft xAPI binding or draft Caliper binding.
Raw payloads and scoped local identities remain in memory or caller's private DB.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import hashlib
import importlib
import json
from pathlib import Path
import sqlite3
import sys
from uuid import uuid4

ROOT = Path(__file__).resolve().parent


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def load_contract(contract_dir):
    directory = Path(contract_dir).resolve()
    if not (directory / "validate_contract.py").is_file() or not (directory / "carrier_bindings.py").is_file():
        raise ValueError("--contract-dir must contain the shipped capture validator and draft bindings")
    # Prevent silently reusing a same-named module from a different contract.
    for name in ("validate_contract", "carrier_bindings", "carrier_fragments"):
        existing = sys.modules.get(name)
        if existing and Path(existing.__file__).resolve().parent != directory:
            raise ValueError("A different contract module is already loaded; use a fresh process")
    sys.path.insert(0, str(directory))
    return importlib.import_module("validate_contract"), importlib.import_module("carrier_bindings")


def open_database(path=":memory:"):
    connection = sqlite3.connect(str(path), isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    connection.execute("""CREATE TABLE IF NOT EXISTS captures (
        scope TEXT NOT NULL,
        local_id TEXT NOT NULL,
        payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
        PRIMARY KEY (scope, local_id),
        CHECK(scope = json_extract(payload_json, '$.record_id.scope')),
        CHECK(local_id = json_extract(payload_json, '$.record_id.local_id'))
    ) WITHOUT ROWID""")
    return connection


@contextmanager
def atomic_batch(connection):
    # Savepoints also work inside a caller's transaction. Any invalid or
    # conflicting later row rolls back every earlier row in THIS batch.
    savepoint = "capture_batch_" + uuid4().hex
    connection.execute("SAVEPOINT " + savepoint)
    try:
        yield
    except BaseException:
        connection.execute("ROLLBACK TO " + savepoint)
        connection.execute("RELEASE " + savepoint)
        raise
    else:
        connection.execute("RELEASE " + savepoint)


def load_records(connection, records, validate):
    inserted = replayed = 0
    with atomic_batch(connection):
        for record in records:
            validate(record)
            encoded = canonical(record)
            scope, local_id = record["record_id"]["scope"], record["record_id"]["local_id"]
            existing = connection.execute(
                "SELECT payload_json FROM captures WHERE scope=? AND local_id=?", (scope, local_id)
            ).fetchone()
            if existing:
                if existing["payload_json"] != encoded:
                    raise ValueError("Conflicting payload for an existing scoped release occurrence; batch rolled back")
                replayed += 1
            else:
                connection.execute("INSERT INTO captures(scope,local_id,payload_json) VALUES (?,?,?)", (scope, local_id, encoded))
                inserted += 1
    return {"inserted": inserted, "identical_replays_skipped": replayed}


def reject_nonfinite(value):
    raise ValueError("JSON must not contain nonfinite numeric constants")


def unique_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("JSON object contains duplicate keys")
        result[key] = value
    return result


def read_jsonl(path, extract):
    with Path(path).open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                raise ValueError("Blank JSONL record at line " + str(line_number))
            value = json.loads(line, parse_constant=reject_nonfinite, object_pairs_hook=unique_keys)
            yield extract(value)


def run_query(connection, query_path=ROOT / "query.sql"):
    sql = Path(query_path).read_text(encoding="utf-8")
    return [dict(row) for row in connection.execute(sql)]


def query_representation(paths, extract, validator, database=":memory:"):
    connection = open_database(database)
    try:
        inserted = replayed = 0
        # All supplied files comprise ONE atomic load. A later file's conflict
        # cannot leave a half-loaded new cohort in the private database.
        records = (record for path in paths for record in read_jsonl(path, extract))
        stats = load_records(connection, records, validator)
        inserted += stats["inserted"]
        replayed += stats["identical_replays_skipped"]
        rows = run_query(connection)
        return {"load": {"inserted": inserted, "identical_replays_skipped": replayed}, "query_rows": rows}
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--contract-dir", type=Path, required=True)
    parser.add_argument("--capture-jsonl", type=Path, action="append", required=True)
    parser.add_argument("--xapi-jsonl", type=Path, action="append", default=[])
    parser.add_argument("--caliper-jsonl", type=Path, action="append", default=[])
    parser.add_argument("--output", type=Path, required=True, help="Aggregate-only JSON output; never a row export")
    args = parser.parse_args()
    validator, bindings = load_contract(args.contract_dir)
    representations = {
        "direct_capture": query_representation(args.capture_jsonl, lambda record: record, validator.validate)
    }
    if args.xapi_jsonl:
        representations["recovered_xapi"] = query_representation(args.xapi_jsonl, bindings.extract_xapi, validator.validate)
    if args.caliper_jsonl:
        representations["recovered_caliper"] = query_representation(args.caliper_jsonl, bindings.extract_caliper, validator.validate)
    expected = representations["direct_capture"]["query_rows"]
    if any(value["query_rows"] != expected for value in representations.values()):
        raise ValueError("The shared SQL query differs across representation recoveries")
    output = {
        "analysis": "One product-agnostic SQL query after documented native-format mapping",
        "query_sha256": hashlib.sha256((ROOT / "query.sql").read_bytes()).hexdigest(),
        "sqlite_version": sqlite3.sqlite_version,
        "metric": "Recorded help-request observations in the selected releases",
        "unit": "Source-scoped release occurrence, not a distinct real action or learner",
        "representations": representations,
        "shared_query_results_identical": True,
        "limitations": [
            "Only the adapters interpret native labels; the SQL query uses validated shared fields.",
            "NULL generation/display values mean no corresponding eligible observations were supplied; they do not assert zero real events.",
            "Unknown source capture completeness prevents actual help totals and rates.",
            "Source scopes and original labels remain separate; pedagogical or population equivalence is not established.",
            "This is a reproducible descriptive aggregation, not a superiority test, causal estimate, live-LRS test or Caliper certification."
        ]
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "representations": list(representations), "shared_query_results_identical": True}))


if __name__ == "__main__":
    main()
