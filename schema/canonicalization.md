# Canonicalization Spec — qlm-measure

## Schema 0.2 (current, legacy)

### Rule

Python: `json.dumps(obj, sort_keys=True, separators=(",",":"), default=str)`
JS: Custom recursive serializer matching Python's output for the hashable subset.

### Known limits of 0.2 canonicalization

JSON has no int/float distinction. Python's `json.dumps` formats `int(1)` as `1` and `float(1.0)` as `1.0`, but after a JSON round-trip through JS, the type information is lost. This makes byte-identical cross-language canonicalization **impossible in general** for schema 0.2 records.

The JS implementation handles the three hashable float fields (`evidentialWeight`, `priorPosterior`, `updatedPosterior`) by post-processing, but **cannot** handle:

| Case | Python | JS | Impact |
|------|--------|-----|--------|
| Non-ASCII event text | `\u00e9` | `é` | Hash mismatch if event contains accented or non-Latin characters |
| Integer float inside event | `1.0` (for `float`) | `1` | Hash mismatch for `score: 1.0` or similar inside the event object |
| Values under 1e-4 | `3e-05` | `3.0000000000000004e-05` (floating-point noise) | Hash mismatch on very small posteriors or weights |
| JS→Python direction | JS Recorder writes `weight: 1` | Python reads as int, hashes as `1` not `1.0` | Hash mismatch on records produced by JS, verified by Python |

**Consequence:** Schema 0.2 cross-language verification is reliable for records containing only ASCII text, standard-range posteriors (above 1e-4), and consistent emitter/verifier language. It is **not reliable** for the general case.

Records produced and verified within the same language are always correct.

### Recommendation

Use schema 0.3 (when available) for cross-language interoperability. Schema 0.3 adopts RFC 8785 (JSON Canonicalization Scheme), which specifies number formatting unambiguously.

### Float tolerance

- Posterior chain consistency: absolute `1e-9`, identical in both languages.
- ESTIMATE.REPRODUCE: absolute `1e-4`, configurable per rule.

---

## Schema 0.3 (planned)

Adopts RFC 8785 (JSON Canonicalization Scheme) for all hashes. Number formatting is specified by the standard:
- No positive sign
- No leading zeros
- No trailing zeros after decimal
- `0` for zero (no negative zero)
- Scientific notation for |n| >= 10^21 or |n| < 10^-6 with specific formatting

The verifier selects canonicalizer by `schemaVersion`. 0.2 records continue to use the legacy canonicalizer. 0.3 records use RFC 8785.

Golden vectors for 0.3 will be in `schema/vectors/canonicalization-0.3.json` and `schema/vectors/entry-hash-0.3.json`, CI-gated in both languages.
