# qlm-measure

Open measurement SDK for education AI — evidence events, record verification, and dataset clients.

**Apache-2.0 · [Developer Portal](https://play.quantumlearningmachines.com/developer)**

## What this is

A typed evidence-event vocabulary, a hash-chained record format, and a verifier that checks bookkeeping integrity without containing any estimation mathematics. The verifier runs locally, makes no network calls, and records never leave your machine.

## What this is not

Not the estimation engine (that runs server-side). Not a learning analytics system. Not a replacement for the measurement service.

## Install

**Python:**
```bash
pip install qlm-measure
```

**JavaScript / TypeScript:**
```bash
npm install qlm-measure
```

## Verify a record

```bash
qlm-measure verify record.json
qlm-measure verify records.jsonl --format json --report report.json
qlm-measure explain HASH.ENTRY_RECOMPUTE
qlm-measure version
```

Exit codes: `0` all valid, `1` at least one invalid, `2` usage or parse error.

## Packages

- **[Python](python/README.md)** — `pip install qlm-measure`
- **[JavaScript/TypeScript](js/README.md)** — `npm install qlm-measure`

Both packages ship the same 10 checks, the same report schema, and produce byte-identical reports (minus the `tool` block). The check catalog, canonicalization spec, and golden vectors are shared.

## Limitations (read first)

- The verifier checks **bookkeeping integrity**, not estimation correctness. It can tell you if a record was tampered with. It cannot tell you if the posteriors are accurate.
- Evidence event schemas are **v0.2** and may change in minor versions. Pin your dependency.
- The estimation service requires the QLM API. The verifier does not.

## License

Apache-2.0. See [LICENSE](./LICENSE).
