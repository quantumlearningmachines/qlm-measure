# QLM Transformer

Learnlog starts with assistance definitions, capture requirements and explicit
unknowns. QLM developed these rules while building QLM Measure to measure AI
scaffolding. A request, a generated answer and a displayed hint are different
observations. Missing records do not establish absent assistance.

This release candidate packages supported native-format mappings, local
validators, optional xAPI 1.0.3 and Caliper 1.2 bindings, and a shared SQL query.
Existing products can keep their exports; a documented mapping supplies the
interpretation. No QLM account, hosted estimation service or LLM is needed.

**Distribution 0.3.0rc1** is a prepared candidate, not a published PyPI release.
The retained contained-file writer identifies its implementation as 0.2.1.
The assistance capture payload is 0.1.0-draft; its carrier binding is
0.1.1-draft. Learnlog is a proposed Internet-Draft, not an adopted IETF standard.

## Install from the repository root

```bash
python3.12 -m venv .venv-transformer
source .venv-transformer/bin/activate
python -m pip install ./tools/qlm-transformer
python -m pip check
qlm-capture demo --output-dir outputs/teaching-public --private-dir outputs/teaching-private
```

The teaching example has two **synthetic** requests from two source namespaces
and one synthetic display. It checks capture validation, carrier recovery,
shared SQL and replay. It is not research evidence. Public and private output
directories must be separate, non-nested and new or empty.

## Reproduce the real-source inventory

Obtain the two native files separately, retaining attribution and applicable
data-use obligations. No raw Zenodo/IDETrace telemetry is bundled.

| Source | Selection | Pinned SHA-256 |
| --- | --- | --- |
| [Zenodo 17551130 v1](https://doi.org/10.5281/zenodo.17551130) | `ai_hints_interaction.zip` | `5527127f0a3c939601b17ef207ef8b34df7cad9159c9617f879efbf4e989d499` |
| [IDETrace / TutorTrace](https://github.com/divadbaroon/TutorTrace_dataset_and_benchmark/tree/bc7990370da18a611a122255ebc3e475bd8a3fc6) | `dataset/raw_telemetry/deployment_8.json` at the linked commit | `09972201c16a9f6def7d1e25a9b9e6827994601d720a37696afb0927168befc8` |

```bash
qlm-capture research \
  --zenodo-archive private-cache/zenodo17551130.private.zip \
  --tutortrace-json private-cache/tutortrace_deployment8.private.json \
  --allow-tutortrace-research \
  --output-dir outputs/research-public \
  --private-dir outputs/research-private
```

The pinned reproduction expects 960 hint-button requests, 90 retries and 59
chat-query records: **1,109 selected released request occurrences**. It does
not estimate all actual requests, comparable rates, distinct learners,
scaffolding quality or learning effects. Backend responses are excluded from
the request numerator. Source labels and strata remain separate. Independent
human mapping review remains pending; the mapping audit used AI assistance.

Research opt-in is a software safeguard, not a grant of data rights or an
ethics determination. No formal ethics determination was obtained for this
secondary analysis. Source-declared CC BY 4.0 terms do not establish consent
or remove privacy obligations. Do not redistribute private outputs.

## Inspect and reuse the rules

`qlm_transformer/capture/reference/analysis/vendor_contract/` contains the
schema, validator, carrier bindings, synthetic examples and regression tests.
`qlm_transformer/capture/reference/sql_analysis/query.sql` is the shared query.

- Instrument capability and achieved capture are separate declarations.
- `not_reviewed` and `not_reported` remain distinct. The latter requires a
  bounded documented review; schema validity does not authenticate that review.
- Provenance and candidate mapping references survive transformation. A
  validator pass does not verify upstream source truth or semantic agreement.
- Outer carrier actors and times describe the importer. Historical learner
  time stays inside the capture payload, with unresolved clocks explicit.

xAPI and Caliper already have extension mechanisms and can carry equivalent
requirements. The proposed contribution is the reusable assistance agreement
and its mappings. JSON encoding and aggregation are not novel by themselves.
Local carrier recovery is not live LRS interoperability, Caliper certification
or evidence of measurement superiority.

[Airflow](../../integrations/airflow/README.md) provides manual workflows for
the transcript/participant importer and the newer request analysis. They use
different units and are not pooled. The [demo](../../demo/transformer/README.md)
uses attributed research excerpts and a separate aggregate-facts view.
Branded profiles in the older writer are **synthetic templates**, not verified
commercial export formats; see [the contained-file guide](docs/contained-import.md).

## License and verification

The existing QLM MIT license and notices are retained inside the Apache-2.0
qlm-measure repository. Data, dependencies and specifications retain separate
terms. No Internet-Draft text is bundled or relicensed. Tests establish bounded
software behavior, not capture completeness, semantic validity or improved
research decisions. See [the release plan](../../docs/transformer/RELEASE_PLAN.md).
