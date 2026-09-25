# Chain schemes (0.4.1)

QLM products store one row per evidence event, each carrying its own hash and
a link to the previous event's hash. Before 0.4.0 every product computed that
hash with a private copy of the code, and verifiers drifted from sealers (on
2026-09-10 TeachProof's app moved from 10 to 12 hashed fields; its standalone
verifier did not, and every sealed chain read as "tampered").

`qlm-measure/schemes` is now the single definition of each scheme: exactly
which fields are hashed, in what canonical form, under which link convention.
The TypeScript module is pure (no Node or browser API), the Python module is a
byte-for-byte twin, and both are tested against `schema/vectors/chains/*.json`,
which were generated from verbatim copies of the original product functions.

| Scheme | Family | Since | Hash / link | Canonical form |
|---|---|---|---|---|
| `tpc/clinical-v1` | `tpc/clinical` | 2026-08-31 | `hash` / `prev_hash`, genesis `"genesis"` | `JSON.stringify([type, learner, encounter, turn, construct, signal, scaffold, extractor, confidence, prev_hash])` |
| `tpc/clinical-v2` | `tpc/clinical` | 2026-09-10 | same | v1 + `[triage_class ?? null, engine_version ?? null]` |
| `tpc/clinical-v3` | `tpc/clinical` | 2026-09-14 | same | v2 + `[mapping_version]`; applies only when `mapping_version` is present |
| `tpc/clinical-v4` | `tpc/clinical` | 2026-09-25 | same | v2 fields + `[mapping_version ?? null, event_kind, payload with keys sorted at every depth]`; applies only to events carrying `event_kind` (schema 0.4 process events); coexists with v3 in one chain, which then reports v4 |
| `play/clinical-clin-1.0` | `play/clinical` | 2026-08-16 | `hash` / `prevHash`, genesis `""` | `JSON.stringify` of `{eventId, ts, encounterId, actor, source, type, payload, consentRef, schemaVersion, prevHash}` with keys sorted recursively |

## Seal

```ts
import { sealEvent } from "qlm-measure";                 // Node: SHA-256 bound
const sealed = sealEvent(event, "tpc/clinical-v3");       // copy with `hash` set

import { sealEventWith } from "qlm-measure/schemes";      // browser: bring a hash
const sealed = sealEventWith(myHashFn, event, "play/clinical-clin-1.0");
```

```python
from qlm_measure.schemes import seal_event
sealed = seal_event(event, "tpc/clinical-v3")
```

## Verify

```bash
qlm-measure verify-chain events.json --family tpc/clinical      # detect per event, newest scheme first
qlm-measure verify-chain events.json --scheme tpc/clinical-v2   # require one scheme
qlm-measure verify-chain --list
```

The report says which scheme the chain was sealed under (`hash_scheme:`), and
a chain that mixes schemes fails unless `--allow-mixed` is given. A genuinely
edited event fails on that event alone. Exit codes: `0` clean, `1` not clean,
`2` usage or parse error. Output is `key: value` lines (or `--format json`).

## Adding a scheme

Add the definition next to its family in `src/schemes/index.ts` and
`python/qlm_measure/schemes.py`, generate a vector for it in
`tools/gen-chain-vectors.mjs` from the product's original function, and never
change an existing vector: a vector is a promise that chains sealed in
production keep verifying.
