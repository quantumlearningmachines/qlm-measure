# Canonicalization Spec — qlm-measure 0.2.2

## Rule

Both Python and JS implementations produce the same canonical string and SHA-256 digest for the same input object. The canonical form is:

```
json.dumps(obj, sort_keys=True, separators=(",", ":"), default=str)   # Python
JSON.stringify(obj, sortedKeysReplacer)                                 # JS, with null coercion
```

### Key ordering

Keys are sorted lexicographically at every nesting level.

### Separators

No whitespace: `,` between items, `:` between key and value.

### Null vs undefined

Python serializes `None` as `null`. JS `JSON.stringify` omits `undefined`. All optional fields in the hashable subset MUST be set to `null` explicitly (not left undefined) before canonicalization. The JS SDK does this via `?? null` on every optional field in `hashEntry`.

### Number formatting

Python's `json.dumps` writes `1.0` for a float whose value is an integer. JS writes `1`. The JS SDK post-processes the canonical string to match Python's output for known numeric fields: `evidentialWeight`, `priorPosterior`, `updatedPosterior`, `score`, `difficulty`, `classifierConfidence`.

This is a targeted fix documented as a deviation. A future version may adopt RFC 8785 (JSON Canonicalization Scheme) which specifies number formatting unambiguously.

### Float tolerance

Posterior chain consistency is checked with absolute tolerance `1e-9` in both languages. This tolerance is documented and identical across implementations.

`ESTIMATE.REPRODUCE` (planned) uses absolute tolerance `1e-4`, configurable per rule.

### Known cross-language discrepancies (non-blocking)

4 of 12 canonicalization test vectors differ between Python and JS:

| Vector | Python | JS | Impact |
|--------|--------|-----|--------|
| `float_one` | `1.0` | `1` | None for records (numeric fields use the targeted `.0` fix) |
| `scientific_notation` | `1e-07` | `1e-7` | None (no record field produces this) |
| `negative_zero` | `-0.0` | `0` | None (no record field is negative zero) |
| `unicode_keys` | `\u00e9` | `é` | None (record keys are ASCII) |

These are fundamental differences in how Python and JS serialize JSON. They do NOT affect entry-hash parity because the hashable subset of evidence entries uses only ASCII keys and the targeted numeric-field fix handles integer-valued floats. All 7 fixture records verify identically in both languages.

A future version adopting RFC 8785 would resolve all 4 cases.

### Golden vectors

12 canonicalization vectors are in `schema/vectors/canonicalization.json`. 8 of 12 are parity-tested across languages; 4 are documented discrepancies (above). All entry-hash vectors pass in both languages.

12 entry-hash vectors for the `tempered-bkt-1` rule are in `schema/vectors/estimate-tempered-bkt-1.json`.
