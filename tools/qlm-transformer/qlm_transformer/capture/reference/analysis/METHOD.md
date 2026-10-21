# Aggregating recorded assistance requests across two source systems

The demonstration asks a bounded question: **How many released observations
record a learner asking the in-product assistance system for help?** It does not
ask how often students actually sought help, how much help they received or
whether any product improved learning.

The two selected releases are structurally different. The Zenodo next-step-hint
study supplies preprocessed HTML scenario reports containing a JSON `eventsData`
array. TutorTrace / IDETrace deployment 8 supplies a JSON object of source-scoped
records, each with an `events` array. Neither source has to change its export or
adopt Learnlog, xAPI or Caliper.

## Exact rules

| Selected source | Native inclusion condition | Preserved subtype | Excluded examples |
| --- | --- | --- | --- |
| [Zenodo 17551130 v1](https://zenodo.org/records/17551130) | `type == "Log"` and `description` is `Hint button is clicked` or `Hint retry is clicked` | Get Hint and Retry labels remain separate | Backend `Code hint requested`, generated hints, banner events and code-reveal clicks |
| [TutorTrace pinned deployment 8](https://github.com/divadbaroon/TutorTrace_dataset_and_benchmark/tree/bc7990370da18a611a122255ebc3e475bd8a3fc6) | `type == "CHAT_QUERY"` in each native `events` array | `CHAT_QUERY` | Chat typing, `CHAT_RESPONSE`, code edits and mouse events |

The TutorTrace README describes AI queries and responses and shows `CHAT_QUERY`
in its native schema example. The pinned author `prepare_data.py` also includes
`CHAT_QUERY` in `QUERY_TYPES`. These support a candidate submitted-query
interpretation. The 59 retained query events do not imply that all were
pedagogically equivalent to a Get Hint or Retry click. The shared metric is a
count of recorded request observations; source and request subtype remain
available strata. It is not a common help-seeking propensity scale.

The adapters are agent-authored and agent-audited. No independent human mapping
review has occurred. A separate checker written by another agent parses native
bytes and checks the resulting counts; that is software verification, not an
independent human semantic reference.

## Actual data path

`native release -> source-specific adapter -> assistance capture profile ->
complete importer-created xAPI statement / Caliper event -> recovered profile
-> source-stratified aggregation`

Every retained request is validated against the new assistance capture schema.
Both complete carriers are created and decoded for every record. Their actor
is the actual QLM importer software; their timestamp is the actual current
creation time of that importer record. They never pretend that a learner acted
at import time. This is a local carrier roundtrip, not a live LRS, Caliper Sensor
API interoperability test or certification exercise.

The source-native timestamp is preserved. An explicit timestamp offset may be
converted to UTC without inventing a timezone. TutorTrace numeric timestamps
are retained as native numbers while UTC remains unknown: the reviewed author
code calls them milliseconds but does not establish the epoch in the reviewed
material. Unsupported nonzero fractional precision is preserved in the
original field while UTC remains unknown; it is never silently truncated.

No native learner identity, authoritative request ID, response link or product
instrumentation identity is invented. `capture.instrument_id` identifies the
QLM release reader, with a boundary limited to the selected published release.
It does not identify a verified source-product sensor. Product/model version,
source instrumentation capabilities, achieved coverage and capture windows
remain explicitly unknown. Unreviewed context/policy fields are marked
`not_reviewed`, not `not_reported`.

## Identity, deduplication and accumulation

The identity scope contains the selected source revision and exact input-file
SHA-256. Its local ID is a SHA-256 of a JSON array containing the member location
and native array/row ordinal. The TutorTrace member location includes its native
top-level source-record key, used privately and never published.

Reimporting the same scoped release occurrence is idempotent. Changing its
capture payload while retaining its identity raises an error. Coincident local
IDs across different source namespaces remain separate. Equal-looking content
at different release positions remains separate: the unit is a published
record occurrence, not an inferred unique real-world action. Changed source
bytes fail their pinned checksum. Overlap, corrections and duplicate real
events across different releases are not resolved by this demonstration.

Aggregation is set-based across these scoped identities and invariant to input
order and batch boundaries. Cumulative counts mean adding selected source
releases, not a longitudinal growth curve or merging student identities.

## Metric-specific eligibility

Unknown coverage does not prohibit counting the records actually present in a
selected release. It does prohibit calling that count the total number of
requests made by its population. The analysis therefore permits the released
observation numerator while withholding actual request totals, request rates,
request-to-display rates, distinct cross-source people and educational effects.
The number `0` is never substituted for unknown delivery, unknown capture or
unknown learning.

The aggregate JSON includes source-specific request counts, original-label
strata, the cumulative sum, source pins, metric eligibility and machine-check
results. It contains no learner rows, prompts, code, learner identifiers or
per-record locators.

## Source caveats and redistribution

Zenodo declares CC-BY-4.0. IDETrace's pinned Croissant dataset declaration
also specifies CC-BY-4.0 and lists raw telemetry in its distribution. This is
the documented reuse basis for transformation and aggregate analysis. Retain
attribution, source pins and a licence link, and identify changes. Separate
author permission is not a prerequisite for licence-covered uses. Population
descriptions still conflict, so no verified learner-count claim is made.
This package retains explicit research opt-in as a deliberate data-access
safeguard and distributes aggregate factual counts only. It excludes learner
rows, prompts, code, identifiers and event-level transformed outputs. The opt-in
flag does not create rights or establish an ethics determination. See
`../source_audit/SOURCE_AUDIT.md` and `reuse_basis_20261020.json` in that directory.

These are selected research-system releases. They are not production
integrations with Khan Academy, MATHia, IXL or other named commercial products.
Successful arithmetic aggregation and lossless carrier recovery do not prove
that Learnlog is superior to an equally specified xAPI/Caliper profile, nor
that two assistance interventions have equivalent pedagogical meaning.

## Reproduce

The required QLM assistance-profile code/schema is supplied under
`vendor_contract/`, with hashes in `VENDOR_MANIFEST.json`. The correction uses
binding version 0.1.1-draft while retaining payload version 0.1.0-draft. It
separates the xAPI account homepage/name from importer identity, supports the
declared legacy Statement versions and rejects invalid numeric timezone offsets.
No prior workspace checkout is required. The correction run used Python 3.12.14;
`results/runtime.json` records the environment for this run, not the historical
preparation environment.

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m unittest discover -s . -p 'test_*.py' -v
.venv/bin/python fetch_sources.py --source both --cache-dir /your/private/cache --allow-tutortrace-research
.venv/bin/python aggregate.py --zenodo-archive /your/private/cache/zenodo17551130.private.zip --tutortrace-json /your/private/cache/tutortrace_deployment8.private.json --allow-tutortrace-research --output-dir results --private-dir /your/private/transformed-records
```

The final command writes aggregate-only JSON to `results` and private per-record
profile/carrier intermediates to the explicit private directory. It does not
send data to an external service or execute any downloaded HTML/source code.
