# qlm-measure

Open measurement SDK for education AI — evidence events, record verification, and dataset clients.

**Apache-2.0 · [Documentation](https://play.quantumlearningmachines.com/developer) · [Python package](https://pypi.org/project/qlm-measure/)**

## Install

```bash
npm install qlm-measure
```

## Quickstart — produce a record from your own tool

See **[docs/recorder-quickstart.md](../docs/recorder-quickstart.md)** — ten lines, no QLM account, no network.

## Verify a file

```bash
npx qlm-measure verify record.json
npx qlm-measure verify records.jsonl --format json --report report.json
npx qlm-measure explain HASH.ENTRY_RECOMPUTE
npx qlm-measure version
```

Exit codes: `0` all valid, `1` at least one invalid, `2` usage or parse error.

`verify` makes no network calls. Records never leave your machine.

## Verify in code

```typescript
import { verifyRecord } from "qlm-measure/verifier";

const result = verifyRecord(record);
if (!result.valid) {
  for (const v of result.violations) {
    console.log(`[${v.checkId}] v${v.version}: ${v.message}`);
  }
}
```

## Check catalog

10 shipped checks. Use `qlm-measure explain` to list all, or `qlm-measure explain CHECK_ID` for details.

```typescript
import { SHIPPED_CHECKS, CATALOG_BY_ID } from "qlm-measure";

for (const check of SHIPPED_CHECKS) {
  console.log(`${check.id}: ${check.label}`);
}
```

## Update rule registry

```typescript
import { reproduce } from "qlm-measure";

const posterior = reproduce("tempered-bkt-1", { slip: 0.10, guess: 0.20 }, 0.35, true, 0.42);
// 0.5032
```

## Limitations (read first)

- The verifier checks **bookkeeping integrity**, not estimation correctness.
- `verify` makes no network calls. Records never leave your machine.
- Evidence event schemas are v0.2 and may change. Pin your dependency.

## What the verifier deliberately cannot check

- Whether posteriors are correctly computed (requires the engine's update rule; see `ESTIMATE.REPRODUCE`, planned)
- Whether evidential weights are appropriate (calibrated server-side)
- Whether triage classifications are accurate (uses rules not in this package)

## Privacy

- `studentScopeId` is pseudonymous by contract. Never include PII.
- `--redact` replaces scope IDs with their SHA-256 prefix in output.
- The SDK does not store data, make network calls, or set cookies.

## Links

- [Python package: `pip install qlm-measure`](https://pypi.org/project/qlm-measure/)
- [Developer portal](https://play.quantumlearningmachines.com/developer)

## License

Apache-2.0. See [LICENSE](./LICENSE).
