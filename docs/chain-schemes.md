# Chain schemes (0.5.1)

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

## Product envelopes (0.5.0)

Every other per-record hash a QLM product seals, defined once and generated
into vectors from the product's original function. `link` says how a record
binds to its predecessor: `explicit` (a stored link field), `implicit` (the
previous hash enters the canonical form but is not stored — the journal), or
`none` (a content hash; records are independent).

| Scheme | Product source | Digest | Link |
|---|---|---|---|
| `play/emit-1` | qlm-games `api/evidence/emit` `computeChainHash` | sha256 | `chain_hash` / `prev_hash`, genesis `"genesis"` |
| `play/measure-session-1` | qlm-games `api/measure/session` `computeEventHash` | sha256, first 32 hex | none (`event_hash`) |
| `play/encounter-fnv64-1` | qlm-games `credentials/platform/evidence-schema` via `hashSnapshotSync` | **FNV-1a 64** over UTF-16 units | `eventHash` / `prevHash`, genesis `""` |
| `play/research-provenance-1` | qlm-games `research/evidence-provenance-chain` `computeChainHash` | sha256 of concatenated layers | none (`chainHash`) |
| `qcore/qinverse-djb2-1` | qlm-games and crucible-teacher `q-core/qinverse/evidence-chain` | **djb2-32** | `hash` / `prevHash`, genesis `"genesis"` |
| `studio/loop-1` | qlm-studio `loop/evidence` `hashEvent` (sorted `[k,v]` pairs; `id` not hashed) | sha256 | `hash` / `prevHash`, genesis `"genesis"` |
| `dp/ledger-v3` | art-of-kings `engine/v3/event-ledger` `computeEventHash` (RFC 8785-style canonical; prev ‖ canonical; all 22 envelope keys, absent → null) | sha256 | `eventHash` / `previousEventHash`, absent on the first event |
| `tpc/dse-journal-1` | teachproof `tutor-lab/dse/journal` `computeEntryHash` (prev + content; `timestamp` not hashed) | sha256 | implicit, genesis `""` |
| `yardstick/spine-1` | yardstick `project_spine/models` `ResponseRecord.compute_chain_hash` (Python f-string, `True`/`False`) | sha256 | `chain_hash` / `previous_hash`, genesis `""` |
| `labpath/learning-evidence-v1` | qlm-games `ecogenesis/labpath/learning-evidence-event` `hashLearningEvidenceEvent` (whole draft, keys sorted with `localeCompare` at every depth) | sha256 | `hash` / `prev_hash`, `null` on the first event |

FNV-1a and djb2 are not collision resistant: those two chains are
order-evident, not tamper-evident. Verifying what was sealed needs these
definitions; a SHA-256 successor scheme for new events is each product's call
and would be a new scheme id, not an edit.

Implicit-link schemes take `prev` when sealing:

```ts
sealEvent(entry, "tpc/dse-journal-1", previousEntry?.hash ?? "");
```

## Adding a scheme

Add the definition next to its family in `src/schemes/index.ts` and
`python/qlm_measure/schemes.py`, generate a vector for it in
`tools/gen-chain-vectors.mjs` from the product's original function, and never
change an existing vector: a vector is a promise that chains sealed in
production keep verifying.
