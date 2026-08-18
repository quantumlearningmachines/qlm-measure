# qlm-measure

Open measurement SDK for education AI — evidence events, record verification, and dataset clients.

**Apache-2.0 · [Documentation](https://play.quantumlearningmachines.com/developer) · [JS package](https://www.npmjs.com/package/qlm-measure)**

## Limitations (read first)

- This SDK is the **public interface layer**, not the measurement engine. The estimation service (Bayesian posteriors, calibration) is QLM's hosted engine.
- The verifier checks **bookkeeping integrity**, not estimation correctness. It can tell you if a record was tampered with. It cannot tell you if the posteriors are accurate. That distinction is the design.
- Evidence event schemas are **v0.2** and may change in minor versions. Pin your dependency.
- `verify` makes no network calls. Records never leave your machine.

## What the verifier deliberately cannot check

- Whether posteriors are correctly computed (that requires the engine's update rule; see `ESTIMATE.REPRODUCE`, planned)
- Whether evidential weights are appropriate (those are calibrated server-side)
- Whether triage classifications are accurate (those use rules not in this package)

## Install

```bash
pip install qlm-measure
```

## Verify a file

```bash
qlm-measure verify record.json
qlm-measure verify records.jsonl --format json --report report.json
qlm-measure explain HASH.ENTRY_RECOMPUTE
qlm-measure version
```

Exit codes: `0` all valid, `1` at least one invalid, `2` usage or parse error.

### Report formats

**Text** (default):
```
record syn-8f2c-0042  (schema 0.2, 6 entries)
  Schema
    ✓ Required fields present
    ✓ Field types valid
    ✓ Timestamp is ISO 8601
  ...
  VERDICT: CLEAN — record is verifiable
```

**JSON** (`--format json` or `--report FILE`):
```json
{
  "tool": {"name": "qlm-measure", "version": "0.2.2", "language": "python"},
  "summary": {"records": 1, "valid": 1, "invalid": 0, "checks_run": 9, "checks_passed": 9}
}
```

## Verify in code

```python
from qlm_measure import verify_record

record = {"studentScopeId": "...", "entries": [...]}
result = verify_record(record)
if not result.valid:
    for v in result.violations:
        print(f"[{v.check_id}] v{v.version}: {v.message}")
```

## Check catalog

10 shipped checks, run by `verify`:

| ID | Label |
|----|-------|
| SCHEMA.REQUIRED | Required fields present |
| SCHEMA.TYPES | Field types valid |
| SCHEMA.TIMESTAMP_FORMAT | Timestamp is ISO 8601 |
| VERSION.MONOTONIC | Versions strictly increase |
| TIMESTAMP.MONOTONIC | Timestamps do not go backward |
| ENUM.VALID | Enum values permitted |
| HASH.PREV_LINK | Chain link valid |
| HASH.ENTRY_RECOMPUTE | Entry hash recomputes |
| POSTERIOR.CHAIN | Posterior chain consistent |
| COMPACTION.BOUNDARY | Compaction boundary intact |

5 planned checks (listed by `explain`, not yet run):
`ESTIMATE.REPRODUCE`, `TEMPORAL.T_DESIGN`, `TEMPORAL.T_RESULT`, `CONSENT.SCOPE`, `CONSENT.WITHDRAWAL`

Use `qlm-measure explain CHECK_ID` for details on any check.

## File formats

- `.json` — one record object, or an array of records
- `.jsonl` / `.ndjson` — one record per line
- `-` — stdin (format auto-detected)
- UTF-8, tolerates BOM. Parse errors report line number.

## Privacy

- `studentScopeId` is pseudonymous by contract. Never include PII.
- `--redact` replaces scope IDs with their SHA-256 prefix in output.
- The SDK does not store data, make network calls, or set cookies.

## Links

- [JS package: `npm install qlm-measure`](https://www.npmjs.com/package/qlm-measure)
- [Developer portal](https://play.quantumlearningmachines.com/developer)
- [Open Measurement Manifesto](https://play.quantumlearningmachines.com/resources/open-measurement-layer)

## License

Apache-2.0. See [LICENSE](../LICENSE).
