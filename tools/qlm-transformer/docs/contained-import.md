# QLM-transformer 0.2.1

Experimental open-source alpha for local export-to-LearnLog conversion, targeting
`draft-srivastava-learnlog-01`. Author: Kumar Srivastava, Quantum Learning Machines.
The QLM-authored transformer and companion AI Use profile use the MIT License;
bundled Internet-Drafts and dependencies retain separate terms (see below).

## Readiness and scope

This package transforms authorized local CSV, JSON arrays and JSONL exports. It
has no live vendor integrations, login, scraping or undocumented API access.
The selected platform identifiers are Khan Academy, Carnegie Learning MATHia,
IXL, DreamBox Math and ALEKS; this is not a market-share ranking. Four profiles
are synthetic field-mapping templates. MATHia's profile uses documented Progress
Report columns but also needs validation against a real export. No real vendor
or customer dataset has been tested. Reports, roles and vendor revisions can
require different mappings. Export XLSX worksheets as CSV; unpivot wide score
grids before import.

The AI condition checklist is author-developed, proposed, unvalidated and
nonexhaustive. Hash verification checks integrity and supported structural
rules; it cannot establish observation completeness, source authenticity,
policy compliance, independent learning, learning effects or study applicability.
The schema URIs remain development placeholders. This alpha makes no complete
LearnLog interoperability or production-readiness claim.

## Installed-wheel quickstart

Python 3.10+ is required. Install the prepared wheel using its absolute path,
then run the demo from a fresh directory outside the source checkout:

```sh
python -m pip install /absolute/path/to/qlm_transformer-0.2.1-py3-none-any.whl
cd "$(mktemp -d)"
qlm-transformer init-demo --output-dir demo
# Generate once, keep securely and reuse within the same deployment.
export QLM_PSEUDONYM_KEY="$(python -c 'import secrets; print(secrets.token_hex(32))')"
qlm-transformer convert --platform mathia --input demo/examples/mathia.json \
  --profile demo/profiles/mathia.json --tenant synthetic-school \
  --output mathia.learnlog.json --checkpoint mathia.heads.json --synthetic
qlm-transformer verify mathia.learnlog.json --checkpoint mathia.heads.json
```

`init-demo` copies bundled synthetic examples and mapping templates for local
inspection and use. It does not fetch a dataset or contact a vendor. The source
package contains no full UCI dataset archive. To work from source instead,
install with `python -m pip install .`; run tests with
`python -m unittest discover -s tests -v`.

Keep checkpoint files independently of their logs. Without a trusted external
checkpoint, a valid chain does not detect tail removal or a complete rewrite.
The chain establishes integrity relative to supplied bytes and checkpoints,
not the truth of a vendor report. This implementation writes contained files,
one record per subject per conversion; it does not sign logs, verify signatures,
append to existing records or support truncated logs. Reimports create new
UUIDs and salts; ingestion deduplication is not implemented.

## Mapping and input rules

Copy a profile and map `fields.subject_id` to a stable learner identifier column,
not a name. Map metric labels to exact source columns, and define their units in
your documentation. A vendor-reported score stays a vendor-reported score;
metrics and units are not normalized across platforms. Raw names, emails and
unmapped columns are omitted, but mapped metric, activity, response or content
fields can still contain sensitive text. Configure mappings and retention for
your authorized use.

Identifiers accepted for pseudonymization are nonempty text or nonboolean
integers. Integers are normalized to decimal text: `42` and `"42"` identify the
same subject in the same platform and tenant scope. Types do not automatically
create disjoint ID namespaces; distinguish such namespaces in the source data
or mapping when needed. Floating-point, boolean, empty and container IDs are
rejected. Learner IDs are HMAC-SHA256 pseudonymized with platform and tenant
scope. Cross-platform identity linking is not inferred.

Summary mode records `qlm_import:summary_observed` at import time with the
importer as actor. It does not invent historical action times from date ranges.
Missing selected metrics are listed; assistance remains unknown. The source
file digest, row number, platform, mapping digest and import time are retained;
header provenance is hash-bound. Source hashes can reveal equality of exports
and do not authenticate their producer.

Event mode requires mapped event types and timezone-qualified observed times.
More than six fractional-second digits are rejected to avoid silent precision
loss. `demo/profiles/explicit_events.json` is a synthetic contract, not a vendor
API. Unknown types fail closed. `help_requested` maps to
`assist:help_requested`; `scaffold_provided` maps to
`assist:scaffold_provided` with an explicit provider. Responses use the
experimental `qlm_import:response_observed` extension. Summary hint counts are
never expanded into invented help events. Content is copied only through an
explicit `fields.content` mapping; a content reference can also be mapped.
`fields.reveals_answer` must be an explicit boolean. Input row order is retained;
times can be nonmonotonic, so sequence denotes import order rather than an
independently verified chronology.

JSON/JSONL, profile and review readers reject duplicate keys and NaN/Infinity.
Malformed input and validation failures produce controlled CLI errors without
echoing rejected learner values; Python callers receive exceptions they can
inspect locally. This error handling is not a claim that arbitrary untrusted
inputs have received a complete security audit.

## AI context and the 16 conditions

An authorized event feed can carry an explicit immutable task, stage, policy and
observation context. It records supplied policy and coverage declarations;
verification cannot establish their truth. Permission, actual use, compliance
and data-use consent are separate. External or unauthorized AI use remains
unknown without located evidence. Summary imports cannot receive event-level
AI context because they do not supply the required scoped events.

After the quickstart has created `demo` and set the pseudonym key:

```sh
qlm-transformer convert --platform mathia --input demo/examples/ai_events.json \
  --profile demo/profiles/ai_events.json --tenant synthetic-school \
  --imported-at 2026-10-11T18:00:00Z --ai-context demo/examples/ai_context.json \
  --output ai.learnlog.json --checkpoint ai.heads.json \
  --assessment-template ai.assessment.json --synthetic
qlm-transformer verify ai.learnlog.json --checkpoint ai.heads.json \
  --assessment ai.assessment.json
qlm-transformer conditions ai.learnlog.json --output review.assessment.json \
  --created 2026-10-11T18:01:00Z --synthetic
```

Every part of this example is constructed, including the model identifier and
configuration. It calls no model and represents no research participant,
learning gain or observed violation. `ai_model_config.json` retains the
configuration whose RFC 8785 bytes are hashed in the example instrument.
`ai_events.authored_gap.assessment.json` demonstrates a manual synthetic C16
review of a declared observation gap; the other 15 items stay unreviewed. It
does not assert that external AI was used.

The context must match each row's activity ID, activity version and session.
Its `observation.scope.session` must match the raw mapped session; the transformer
replaces that value with the same HMAC ID used on events. `first_seq` and
`last_seq` refer to imported row order within one subject's actual record. A
policy, stage, task or session change needs a separate conversion and immutable
record. Mixed scopes are rejected; per-row context switching is unsupported.

`conditions` creates exactly one unreviewed item, with no result, for each of
C01–C16. It infers no condition from policy, absent help events or product scores.
One report addresses one record; use `--record-id` with a multi-record file.
An authored review needs an assessor, method, scope, coverage, conclusion,
rationale and evidence references. `not_reported_after_review` requires actual
source and material review. Supported differences need a defined comparator;
supported absence needs bounded capture and full content review and cannot
establish absence of outside assistance. C01 support is rejected because row
order is not independently verified chronology. C06 needs applicable assessment
permission; C07 in this subset needs an assessment prohibition and cited model
assistance by a software actor. Restricted-policy interpretation remains a human
review task. Redacted, signed and truncated records are unsupported for condition
review, although hash-integrity verification permits redaction.

The original profile validator, schemas and registry are in
`qlm_transformer/ai_profile`, with source hashes in `PROVENANCE.json`. The adapter
uses its context and assessment rules for the supported `qlm_import` subset; it
does not call the original fixture-specific `verify_log`.

## Format and Python API

Contained LearnLog JSON uses RFC 8785 canonicalization, SHA-256, UUIDv4 record
IDs, random 16-byte base64url event salts and draft-01 hash formulas. The
verifier checks this implementation's structural subset and chain integrity;
it is not a complete CDDL conformance validator. Draft-01 retains draft-00's
wire format and hash formulas. Bundled draft text is work in progress, not an
adopted IETF standard.

`https://example.org/qlm-transformer/schemas/import-v0.2` is a development
placeholder, not a deployed schema or IANA registration. The companion profile
URIs are also unregistered. `spec/import-events.md` describes extension
semantics. Interoperability work still requires immutable schemas at controlled
URIs, independent CDDL validation, an independent verifier and real vendor
fixtures.

```python
from qlm_transformer import transform, verify, conditions_template, verify_conditions

log = transform(rows, "mathia", mapping, key, tenant, imported_at, source_sha256,
                ai_context=context)  # omit ai_context for summary imports
heads = verify(log)
report = conditions_template(log, created="2026-10-11T18:00:00Z", synthetic=True)
verify_conditions(log, report)
```

The positional `transform` arguments remain compatible with 0.1.0.
Keyword-only `custom_platforms=()` is an explicit whitelist for local mappings
outside the five selected identifiers; the identifier must match
`profile.platform`. It establishes no vendor contract or integration. The CLI
keeps the five selected platform choices.

## Licensing and remaining work

`LICENSE` grants MIT terms for QLM-authored transformer code, the QLM-authored
companion AI Use profile, documentation, mappings and synthetic examples.
The bundled `spec/draft-srivastava-learnlog-00.txt` and
`spec/draft-srivastava-learnlog-01.txt` are excluded from that grant and retain
their IETF Trust notices and Legal Provisions. `NOTICE` and
`THIRD_PARTY_NOTICES.md` identify the separate draft and dependency terms.
`rfc8785` uses Apache-2.0; `jsonschema` uses MIT. Dependencies are installed
separately. These licensing records do not constitute an independent legal
provenance audit.

Before production use: validate anonymized exports for each selected report,
maintain versioned report-specific profiles and regression fixtures, complete
the schema/interoperability work above, and connect authorized event-level
feeds where assistance evidence is available.

Mapping design references recorded on 2026-10-08:

- [Khan Academy assignment scores and skills exports](https://support.khanacademy.org/hc/en-us/articles/10743880066957-How-do-I-download-my-students-assignment-scores-and-skills-data)
- [MATHia Progress Report export](https://support.carnegielearning.com/help-center/math/mathia-reports/progress-reports/article/downloading-the-progress-report/)
- [IXL district analytics reports](https://blog.ixl.com/2023/04/22/ixl-district-analytics-two-new-reports/)
- [DreamBox report printing](https://dreamboxlearning.zendesk.com/hc/en-us/articles/27281723397395-DreamBox-Math-Trouble-Printing-Reports)
- [ALEKS Standards Report](https://www.mheducation.com/prek-12/support/knowledge/new-aleks---standards-report.html)
