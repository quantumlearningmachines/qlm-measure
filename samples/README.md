# qlm-measure — public sample bundle (Item 2 of 5)

Synthetic evidence records for the public verifier, with the expected result for each. Download, run the verifier, compare. Every record here is generated, not collected: no learner data of any kind. Identifiers are pseudonymous by construction (`syn-8f2c-0042`), and every event carries `ext.synthetic: true`.

Hashes were computed with the shipped verifier's own canonicalizer (`qlm_measure` 0.1.1, `verifier._hash_entry`), so `verify_record` accepts the clean records today. Weights and posteriors are illustrative values. The verifier checks that posteriors chain (each prior equals the previous updated posterior); it does not check how they were computed, and neither does this bundle.

## Files

| File | What it is | Expected |
|------|------------|----------|
| `samples/clean.json` | One record, one synthetic learner, one session, six interactions on fraction equivalence. Story: a misconception on the first item, a hint, then unscaffolded and transfer success. | CLEAN, 0 violations |
| `samples/clean.jsonl` | Three records (three synthetic learners), one per line. Exercises the multi-record path. | 3 of 3 CLEAN |
| `samples/tampered_value.json` | `clean.json` with one `updatedPosterior` edited after hashing (v3). | `HASH.ENTRY_RECOMPUTE` fails at v3; `POSTERIOR.CHAIN` fails at v4 |
| `samples/dropped_entry.json` | `clean.json` with v4 removed. | `HASH.PREV_LINK` fails at v5; `POSTERIOR.CHAIN` fails at v5. Versions still increase (5 > 3), so `VERSION.MONOTONIC` passes |
| `samples/reordered.json` | `clean.json` with v3 and v4 swapped. | `VERSION.MONOTONIC`, `TIMESTAMP.MONOTONIC`, `HASH.PREV_LINK`, `POSTERIOR.CHAIN` fail. Each entry's own hash still recomputes, because reordering breaks links, not entries |
| `samples/level1_only.json` | The same six events, hashed and chained, with no weights or posteriors. What a third-party tool would produce with no estimator in the loop. | Today: `SCHEMA.REQUIRED` fails (18 missing numeric fields); the hash chain passes. After Item 3: CLEAN, `POSTERIOR.CHAIN` not applicable |
| `samples/compacted_clean.json` | Two entries after a compaction boundary (`compactedBefore` v4). | CLEAN, 0 violations, compaction check applies |
| `samples/expected/*.report.json` | Expected report for each file, in the report shape from Engineering Brief Item 1 (`schema/report.schema.json`). | |
| `samples/expected/*.txt` | Expected text output, in the CLI text format from Item 1. | |
| `samples/MANIFEST.json` | SHA-256, byte count, record count, expected validity per file. | |
| `tools/make_samples.py` | Regenerates everything above. Run after any canonicalization change (Item 1 §2.2). | |

## Run it today (0.1.1, no CLI yet)

```python
import json
from qlm_measure.verifier import verify_record

rec = json.load(open("samples/clean.json"))
res = verify_record(rec)
print(res.valid, res.entries_checked, [(v.version, v.category, v.message) for v in res.violations])
```

`clean.json` prints `True 6 []`. `tampered_value.json` prints two violations, at v3 (`hash`) and v4 (`posterior`).

## Run it after Item 1 ships (0.2.2)

```
qlm-measure verify samples/clean.json
qlm-measure verify samples/tampered_value.json --report out.json
qlm-measure verify samples/clean.jsonl --format json
```

Exit codes: `0` all valid, `1` any invalid, `2` usage or parse error.

## Comparing against `expected/`

Compare everything except `tool` and `generated_at`. Field order is deterministic (catalog order, then record order). Numbers in violation messages are printed by the verifier as Python floats (`0.363`, not `0.3630`); the JS CLI must match that formatting or the parity test in Item 1 §3.3 will need a normalizer.

## Three things these samples show

1. Tampering shows up twice. Editing one posterior breaks that entry's hash and the next entry's prior. The chain is why a single edit is not deniable.
2. Reordering breaks links, not entries. Every entry still hashes correctly; only `prevHash` and the sequence checks fail. That is the difference between "this record was forged" and "this record was rearranged."
3. A record with no estimator is already hash-verifiable. `level1_only.json` passes every structural check and fails only the schema's numeric requirements. That is the case for the two-level record in Item 3: a stranger's tool can produce a tamper-evident chain today; only the schema stops the verifier from saying so.

## What is left out, on purpose

- No `depthLevel` and no `nonInterventionDecision`. Both are optional in the public schema and both hash as `null` when absent. Add them in the generator if you want them shown.
- No `misconceptionId` values from the real ontology. Sample IDs use the `sample:` namespace so nobody mistakes them for constructs in the published ontology.
- No estimator declaration and no reproduction of the update. That arrives with Item 3.

## Regenerate

```
pip install qlm-measure==0.1.1
python tools/make_samples.py --out samples
```

Regeneration is deterministic. If Item 1 adopts a new canonicalization, bump `hashed_with` in the generator and regenerate; every hash will change and that is expected.

## License

Sample data: to be confirmed (suggested CC0-1.0, so nobody has to think before using it in a test). Generator: Apache-2.0 with the SDK. Confirm before publishing.
