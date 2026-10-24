# QLM Transformer Airflow release candidate

Pipeline distribution **0.5.0rc1** depends on **qlm-transformer 0.3.0rc1**.
The retained contained-file writer remains 0.2.1 and transcript adapters remain
0.4.0-research-adapters. Capture payload and carrier bindings are separate
draft components.

From the qlm-measure repository root:

```bash
python -m pip install ./tools/qlm-transformer ./integrations/airflow
```

The standalone ZIP vendors the same transformer source under `vendor/` and
generates a requirements file for that layout. The transcript guide below
describes that extracted ZIP, not a second tracked writer implementation.

## Assistance capture workflow

`dags/learnlog_recorded_requests.py` uses the corrected capture implementation
and shared SQL query in qlm-transformer. Its default
`config/capture-synthetic.json` has two synthetic requests and one synthetic
display. The separate `config/capture-research.example.json` references the
pinned Zenodo/IDETrace files documented in the transformer README. Obtain
those inputs separately; no raw telemetry is bundled.

Set `QLM_PIPELINE_ROOT` to this integration directory on each worker. Install
both packages with the Airflow constraints and add both DAG files to the DAG
directory. Trigger `learnlog_recorded_requests` with no configuration for the
synthetic case, or with
`{"manifest":"config/capture-research.example.json"}` after placing pinned
inputs at the configured private paths. Research opt-in is a software
safeguard, not data-use permission.

Outputs are under `outputs/capture-<run hash>/public` and `private`; do not
redistribute private artifacts. XCom carries only artifact location, a count
and verification status. Replay checks configuration and source/artifact
hashes. A local completion marker is bookkeeping, not a trust anchor.

## Transcript and participant workflow

The retained `qlm_transformer_exports` DAG and `qlm-pipeline` CLI use native
TutorMoments/OATutor adapters and preserve attribution. They represent dialogue
turns and participant summaries, not the Zenodo/IDETrace request inventory.
Their counting units must not be combined. The guide below describes these
source and data limits.

## Transcript importer guide

Import two published research sources into contained Learnlog records, verify
the generated hash chains, and aggregate structural coverage while retaining
the source, observation type and original measurement values.

This starter bundles **pipeline 0.5.0rc1**, **research adapters
0.4.0-research-adapters** and the unchanged **QLM-transformer 0.2.1 writer and
verifier**. The new source adapters use the writer's explicit custom-platform
interface and a research-event extension. They are not native product
integrations or evidence of compatibility with an unexamined vendor export.
Processing uses no LLM and makes no network requests. Apache Airflow runs in
your environment, separately from the Vercel-hosted browser demonstration.

Learnlog is a proposed Internet-Draft format. This importer implements a
contained-file subset and declares its additional source-specific events; it
is not a conformance certification or an adopted IETF standard.

## The actual sources

| Included source | Exact sample selection | What it supports |
| --- | --- | --- |
| [TutorMoments-Preview](https://huggingface.co/datasets/allenai/tutormoments-preview/tree/3bb0c104d65e29facffca7ba864ef10fa22d0e78) | Complete original JSONL lines 366 and 435: two released transcript sessions, 310 dialogue turns | Source speaker roles, turn text, turn numbers and relative offsets; selected session metadata |
| [OATutor participant data](https://doi.org/10.6084/m9.figshare.23935269.v1) | Exact original CSV header and first 12 participant rows from the 274-row published file | Assigned hint condition and the original pretest, posttest, session time, question-count and learning-gain fields |

Both sources are released under **CC BY 4.0**. Attribution, source revision,
original-file and sample SHA-256 hashes, and selected source line/row positions
are retained in the bundled source/provenance metadata. The supplied excerpts
preserve their original source bytes; the generated Learnlog output adds an
import representation and pseudonymizes known subject identifiers.

TutorMoments contains human tutor/student conversations. The selected released
transcript text was machine-transcribed using SUT (Gemini 2.5 Pro); this is transcription
provenance, not evidence that an AI tutor conducted those sessions. The
publisher uses surrogate identifiers and replaces personal details in text.
The public text can still contain apparent names, and the source describes
deidentification as imperfect. This starter is not a general anonymizer.
Model-generated visual/pause enrichments and annotation/taxonomy labels are
not converted into observed learner or assistance events.

OATutor's `condition` records **assignment**, not the delivery or use of a
specific hint. The CSV supplies no individual hint text, help request,
clickstream or original learner-event time. The included 12 rows contain four
assignments to each of `ChatGPT`, `Human tutor` and `No-hint control`; they are a
demonstration excerpt, not a representative sample or a new causal analysis.
The raw `Human tutor` label means human tutor-authored hints; `ChatGPT` means
pre-generated ChatGPT solution hints. Neither is a log of a live tutoring chat.
The associated paper reports correctness feedback and an optional bottom-out
answer in the no-hint control; that condition is not labelled unassisted.

## Run it now, without Airflow

Use Python 3.12 on Linux or macOS; Windows users can use WSL2. Extract the ZIP
and run these commands from its `qlm-transformer-airflow` directory:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip check
```

Generate a dedicated secret locally. This command prints nothing to the
terminal; its value stays in your shell environment. Store a stable
study-specific secret in your approved secret manager when repeatable
pseudonyms are needed. Never commit it.

```bash
export QLM_PSEUDONYM_KEY_B64="$(python -c 'import base64,secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())')"
qlm-pipeline --root "$PWD" --manifest config/demo.json --run-id demo
python -m unittest discover -s tests -v
```

The CLI invokes the same helper functions as the DAG. The bundled samples
produce **322 observations: 310 transcript turns and 12 participant summaries**,
held in **14 records: two session records and 12 participant-summary records**.
Those are different counting units. Fourteen records does not establish
fourteen unique people, and 322 observations does not mean 322 responses,
hints, assessments or independent measurements of learning.

A repeated run with the same run ID, source bytes, configuration, mappings and
secret reuses the verified Learnlog bytes without appending duplicate events.
Use a new run ID after changing inputs, mappings or the secret.

| Artifact | Purpose |
| --- | --- |
| `outputs/demo/<dataset>/learnlog.json` | Contained Learnlog records, declared research events and source provenance |
| `outputs/demo/<dataset>/checkpoint.json` | Record sequence/head hashes for this generated file |
| `outputs/demo/<dataset>/metadata.json` | Source/configuration/mapping bindings and observation-type notes |
| `outputs/demo/combined/observations.jsonl` | Common structure that keeps dialogue turns distinct from participant summaries |
| `outputs/demo/combined/original_metrics.csv` | Original metric names and values in long form, retaining source and participant-summary provenance |
| `outputs/demo/combined/metric_coverage.csv` | Reported/missing counts for each source-specific metric, without averaging values |
| `outputs/demo/combined/coverage.json` | Structural counts, assigned-condition coverage and interpretation limits |
| `outputs/demo/combined/scaffolding_measurement.json` | Source-coded interval counts, source eligibility and measurement limits |
| `outputs/demo/combined/scaffolding_intervals.csv` | One row per retained exact-span coded interval, with source provenance |
| `outputs/demo/combined/scaffolding_matrix.csv` | Descriptive cross-tabulation of the source's need/action categories |
| `outputs/demo/combined/COMPLETE.json` | Completion marker and SHA-256 checksums of the combined artifacts |

Checkpoints detect mismatches against the head values you trust. Keeping a
file and its checkpoint together does not authenticate its source, prove
complete logging, establish chronology or prevent replacement of both. Keep
approved checkpoints in separate controlled storage if a workflow relies on
them. Before using a combined export, read `COMPLETE.json` and verify the
listed file checksums.

## What the transformation preserves

The adapters retain the selected source field names, values and nested
structure where represented, with explicit provenance back to the untouched
input sample. Known subject identifiers receive scoped HMAC pseudonyms.
Identifiers in arbitrary free text are not automatically found or removed;
review any additional files before distributing their transformed output.
This is pseudonymization, not a guarantee of anonymization.

Published-source attribution is attached only when the input bytes match the
bundled sample hash. Other files are marked `unverified_user_input`; matching a
schema does not verify their origin. Every import event identifies the software importer as actor. Historical
speaker attribution remains in source dialogue data; for participant summaries it labels actual
help use `not_established_by_this_adapter`. Even a verified sample means a
source-byte match, not independent validation of what happened during learning.

A TutorMoments record corresponds to a **transcript session**, with the source
student identifier used for its scoped subject pseudonym. Each represented
turn is `qlm_import:dialogue_turn_observed`. Speaker labels and text are
retained as source observations; a Tutor role or question mark alone does not
become a verified scaffold, help request or productive-struggle classification.

An OATutor participant summary becomes
`qlm_import:participant_summary_observed`. Its source condition stays labelled
as assigned support. Actual hint use and assistance coverage remain unknown.
Neither a no-hint assignment nor missing assistance telemetry establishes that
external or unauthorized AI was absent.

Entry times identify **import time**. TutorMoments `start_seconds` and
`end_seconds` remain relative source offsets. The adapters do not invent
absolute session timestamps, convert offsets into wall-clock events, or treat
the dataset publication date as a learner-event date.

OATutor metrics retain their original names and strings. The three-item
pre/post scores are stored as `0`, `0.333`, `0.666` or `1`; they are not rescaled
to a new 0–100 score. `sessionTime` is described by the source as seconds.
`totalUniqueSteps` is a question count, not a hint count. The source's recorded
`learningGain` is preserved rather than recomputed from rounded pre/post
values. No cross-source means, pooled scores, effect sizes, product rankings
or causal comparisons are calculated.

## Run the Apache Airflow DAG

The DAG uses the public **Airflow 3 Task SDK**. The pinned setup below uses
**Airflow 3.3.2 / Python 3.12**. Use a separate virtual environment from the
CLI-only installation so Airflow can apply its tested dependency constraints.
Do not install `requirements.txt` over an existing Airflow environment; use the
constrained package installation below.

```bash
python3.12 -m venv .venv-airflow
source .venv-airflow/bin/activate
python -m pip install --upgrade pip
python -m pip install 'apache-airflow==3.3.2' --constraint 'https://raw.githubusercontent.com/apache/airflow/constraints-3.3.2/constraints-3.12.txt'
python -m pip install 'apache-airflow==3.3.2' ./vendor/qlm-transformer . --constraint 'https://raw.githubusercontent.com/apache/airflow/constraints-3.3.2/constraints-3.12.txt'
python -m pip check
export QLM_PIPELINE_ROOT="$PWD"
export QLM_PIPELINE_MANIFEST="config/demo.json"
export AIRFLOW_HOME="$PWD/.airflow"
export AIRFLOW__CORE__DAGS_FOLDER="$PWD/dags"
export AIRFLOW__CORE__LOAD_EXAMPLES=False
export QLM_PSEUDONYM_KEY_B64="$(python -c 'import base64,secrets; print(base64.b64encode(secrets.token_bytes(32)).decode())')"
airflow standalone
```

Open `http://localhost:8080`, use the generated local credentials, find
**qlm_transformer_exports**, unpause it and trigger a manual run. Standalone
mode is a local development setup. For an existing Airflow installation,
install the two bundled packages on its workers, add only the DAG file to its
configured DAG directory, and use that deployment's secrets and storage.

Four task definitions prepare configuration, return dataset IDs, map one
convert-and-verify task per configured source, and combine verified outputs.
Task returns contain only configuration paths, IDs and counts. Source rows,
transcript text, Learnlog documents and the pseudonym secret do not enter XCom.
The DAG accepts only an optional `manifest` relative path in run configuration,
for example `{"manifest":"config/synthetic-batch-1.json"}`. Normal path and
manifest validation still applies. It is manual (`schedule=None`) with at most
one active run; it does not
poll source repositories or vendor APIs.

If `QLM_PSEUDONYM_KEY_B64` is absent from the worker environment, the conversion
task requests Airflow Variable `qlm_transformer_pseudonym_key_b64` at execution
time. Configure your Airflow Secrets Backend to provide it. Keep the key out
of manifests, DAG parameters, task arguments, logs, screenshots and committed
`.env` files. The starter does not provision a secret-manager service.

All workers must see the same shared filesystem at the same absolute path.
The starter uses POSIX advisory locks and atomic renames. Isolated worker disks
require a shared volume; object storage requires adapting both artifact IO and
locking. Passing a worker-local path through XCom does not share the file.

## Use additional files from these sources

1. Place an authorized input inside the extracted package, for example under
   `inputs/`. Local relative paths are accepted; URLs are not fetched. The
   pipeline does not upload files to the browser demonstration.
2. Copy `config/demo.json` to `config/study.json`. Set your tenant, non-secret
   `key_id`, explicit import time and accurate source metadata. Keep the source
   revision, file/sample hashes, attribution and selection description aligned
   with the actual input bytes. Do not retain the bundled sample's hashes for a
   different file.
3. Select the source-specific adapter for the actual schema: OATutor's original
   participant CSV or TutorMoments' nested transcript JSONL. Keep field names
   and nesting intact. These adapters do not infer a mapping for an arbitrary
   CSV or a different tutoring platform.
4. Use unique filename-safe dataset IDs. Inputs and profiles must stay outside
   `outputs/` and within the package root; traversal, escaping symlinks and
   duplicate resolved input aliases are rejected. Source files and mappings
   must remain unchanged throughout a run.
5. Run `qlm-pipeline --root "$PWD" --manifest config/study.json --run-id study-001`.
   For Airflow, set `QLM_PIPELINE_MANIFEST=config/study.json` on every worker
   before triggering a new run.

Malformed input, duplicate JSON members, non-finite JSON numbers, changed
bindings or cached pseudonyms, broken chains and incomplete dataset sets cause
failure. The adapter selects its declared fields; it does not add inferred
learner states or establish that a transcript is error-free. A new source
schema needs an explicit reviewed adapter and tests.

## What a combined dataset can show

The common transport supports structural counts, source coverage, original
metric inspection and dataset preparation. It retains whether a row is a
transcribed conversational turn or a participant-level study summary. It does
not make those units interchangeable, infer shared participants, establish
independent performance or turn assigned support into observed assistance.

A product-agnostic study still needs aligned constructs, defensible measures,
a suitable design and measured exposure conditions. This release demonstrates
source-preserving transformation and aggregation, not that combining the
sources produces a valid new learning-effect estimate.

## Inspect source-coded scaffolding intervals

The companion analysis uses the published TutorMoments coding for the
two included sessions. It adds no observed events to their Learnlog records.
The original **322 observations and 14 records stay unchanged**.

`provenance/scaffolding-evidence.json` records the pinned source files, selected
line hashes, categorical labels and supporting situation/action/result text.
The evidence includes 60 selected `ground_truth.key_moments[]` rows with
`annotation_type=scaffolding`. Grouping the same transcript and exact start/end
turn span produces **10 distinct coded intervals**, some overlapping or nested.
Repeated source rows do not add intervals or independent votes. The 60 rows
are not 60 raters, independent tutoring actions or observed help events.

The source's hybrid process uses LLM-assisted categorical coding over human
commentary. The included commentary matches pinned raw annotation records;
that verifies text provenance, not semantic accuracy. QLM runs no new semantic
classifier for this analysis. Nine of the ten selected exact-span intervals
carry the source action label `scaffolding` or `both`. This is a count of
published codes in a purposive selection, not a help-effectiveness score, an
accuracy result or an estimate of scaffolding prevalence.
`mixed`, where present, is a retained source category, not a new QLM judgment.

The proposed measurement profile aligns the source's coded need/action
categories and exposes its denominator and exclusions. It is **not a validated
general measurement of scaffolding**, a causal test or a measure of learning
gain. The intervals come from one anonymized provider, `tutoring_provider_a`;
this is a cross-session baseline, not a cross-vendor impact comparison.
Uncoded turns and sources without compatible coding are unmeasured. OATutor's
participant summaries are excluded from the interval calculation, and altered
transcript bytes cannot inherit the published source codes.

## Verification and provenance

`VERIFICATION.json` records the checks completed for this download, including
which installed-package, annotation, DAG-import and execution checks were run.
The prior pipeline 0.3.0 reference workflow passed 33 installed-package tests
and completed an Airflow 3.3.2 DAG test and standalone scheduler/LocalExecutor
run. That historical result is not verification of the revised 0.4.0 lifecycle
adapter, compatibility screen or cumulative ledger. Read `VERIFICATION.json`
for the exact revised checks and execution status. Distributed-executor
operation remains outside the one-host reference design.

`vendor/PROVENANCE.json` identifies the unchanged writer/verification modules,
AI-profile resources and their pinned upstream commit and byte hashes. The
research adapters and minimal packaging wrapper are new. The vendored subset
omits the upstream CLI, tests, profiles/examples and Internet-Draft texts.
Installed third-party dependencies retain their upstream licenses and are not
bundled in the download.

The QLM-authored pipeline is provided under the included MIT license, with
upstream notices retained under `vendor/qlm-transformer`. The two research
sources retain CC BY 4.0 licensing and their source attributions. The research
event names identify this adapter's declared extension, not an official IANA
registration or a representation that an upstream product emits these events.

Official setup/API references checked 16 October 2026:

- [Airflow 3.3.2 installation](https://airflow.apache.org/docs/apache-airflow/3.3.2/installation/installing-from-pypi.html)
- [Public Airflow 3 interface](https://airflow.apache.org/docs/apache-airflow/3.3.2/public-airflow-interface.html)
- [TaskFlow](https://airflow.apache.org/docs/apache-airflow/3.3.2/tutorial/taskflow.html)
- [XCom](https://airflow.apache.org/docs/apache-airflow/3.3.2/core-concepts/xcoms.html)
- [Secrets backends](https://airflow.apache.org/docs/apache-airflow/3.3.2/security/secrets/secrets-backend/index.html)
- [Writer source](https://github.com/quantumkumar/specs/tree/debb84ee0ae10721dff9c3d7adf477f011f89c89/qlm-transformer)

Source attributions:

- TutorMoments-Preview, Albert Zhang and colleagues, Allen Institute for AI and
  collaborators (2026). [Pinned dataset](https://huggingface.co/datasets/allenai/tutormoments-preview/tree/3bb0c104d65e29facffca7ba864ef10fa22d0e78).
- Pardos, Zachary; Bhandari, Shreya (2023). *ChatGPT-generated help produces
  learning gains equivalent to human tutors on mathematics skills*. Figshare,
  dataset version 1. [DOI](https://doi.org/10.6084/m9.figshare.23935269.v1).


## Assistance context and meaning (0.4.0)

The versioned `qlm:assistance-context:0.1.0` application profile defines phase,
permitted assistance, observed-use scope, capture boundaries and source-reported
product/model versions. Its JSON and the event schemas are included both under
`schemas/` and as installed package resources. Canonical RFC 8785 digests bind
these resources inside each record header, alongside a mapping contract stating
source/target units, definitions, transformations, information loss, denominator,
coding, coverage and review status. Hashes identify exact interpretations; they
do not establish that those interpretations are correct.

The two research sources provide no compatible observed assistance lifecycle.
Their missing phase, permission and outside-help observations remain unknown.
The supplied mappings are implementation-checked and **not independently
reviewed**. `pooling_compatibility.json` exposes exclusions and incompatibilities.
A matching format cannot authorize pooling. Even fully specified, reviewed
compatible declarations only pass a conservative descriptive screen; they do
not establish causal comparability, construct validity or independence.

`profiles/explicit-assistance-events.json` describes an additional explicit input
contract, not a native vendor integration. It accepts source assertions of
`help_requested`, `help_generated`, `help_transmitted`, `help_displayed` and
`learner_response_observed` separately. Generated help does not imply
transmission; transmission does not imply display; display does not establish
reading, understanding or learning. A missing request link is unknown linkage;
only an explicit `request_origin=unsolicited` asserts unsolicited assistance.
`native_hint_depth` and `delivery_order` stay separate. No text classifier or
heuristic creates assistance events.

Each input must use one stable `source_id`, explicit text learner/activity IDs,
a stable native `event_id`, a nonnegative integer `source_revision`, and the
source event type. Optional source timestamps use UTC `Z` with at most three
fractional digits in this shared browser/Python input contract; an absent clock
stays null. Import entry time remains separate. Other source clocks need an
explicit reviewed adapter. Complete capture requires a declared boundary and
still says nothing about outside assistance. An explicit context value must be
an object; absent context defaults to unknown. Known learner IDs are HMAC scoped
to adapter, source ID, tenant and key. Event IDs, task labels and free text can
still contain identifying information: review authorized files before sharing.

Published-sample status additionally requires matching the release's independent
pinned source registry, not only a caller-editable profile hash. Modifying sample
hashes or publisher metadata cannot promote arbitrary data to a published sample.
An exact match verifies published bytes, not the underlying classroom activity.

## Sandpiper utterance exports (SYNTHETIC sample)

`profiles/sandpiper.json` reads the utterances CSV that Sandpiper, the National
Tutoring Observatory's open-source annotation app, writes for a PER_UTTERANCE
run: columns `_id, session_id, sequence_id, role, content, start_time,
end_time`, then annotation columns named `annotator[<name>][<index>]<field>`.
Any other column is refused. There is no public NTO dataset; the bundled
`tests/fixtures/sandpiper-SYNTHETIC.csv` is SYNTHETIC, built from Sandpiper's
documented example rows (MIT, see `DATA_LICENSES.md`).

- One record per `session_id`, with entries ordered by `sequence_id`. Each
  `sequence_id` must be a positive integer string, unique within its session.
  Sandpiper's human-annotation template documentation shows 0-based numbering;
  such files are refused, not renumbered.
- Each row is an observed dialogue turn. `role` is kept exactly as the source
  labels it, `content` is kept as text, and `start_time`/`end_time` stay the
  source's unparsed strings (an empty cell becomes null).
- Annotation codes are kept per utterance as inferred assertions: annotator
  name, column index, field values, and `identifiedBy` when a column carries
  it. Sandpiper's run export does not write `identifiedBy`, and the annotator
  name (for example `AI-0`) is kept as given, not read as model or person.
- No code sets a help stage. All six assistance stages are `not_recorded`
  for this source, and not recorded is never the same as none.
- Exports carry no learner identifier, so each record's subject is an HMAC
  pseudonym of its session, not of a person.

Run it through the pipeline with a manifest dataset such as
`{"id": "sandpiper_synthetic", "platform": "sandpiper", "input":
"tests/fixtures/sandpiper-SYNTHETIC.csv", "profile": "profiles/sandpiper.json",
"metric_notes": {}}`.

### Profile versions

Adding Sandpiper's mapping contract needed a new profile version,
`qlm:assistance-context:0.2.0`, because the contract is part of the hashed
profile. Version 0.2.0 equals 0.1.0 plus the `sandpiper` contract. Each
platform's records bind the version that introduced its contract: TutorMoments,
OATutor and the explicit lifecycle contract keep binding 0.1.0, and Sandpiper
binds 0.2.0. So documents and ledger payloads written before Sandpiper existed
keep their exact binding and still verify (see
`tests/test_pre_sandpiper_compat.py`). Sandpiper events use their own schema,
`schemas/sandpiper-utterance-v1.json`.

## Cumulative batches and corrections (SYNTHETIC software demonstration)

The three `config/synthetic-*.json` manifests read explicitly authored fixtures
under `tests/fixtures/`. These are **not research data**, observed learners or
product integrations; they demonstrate software behavior separately from the
322 genuine-source observations. Run the same CLI or DAG with these manifests
and keep the same pseudonym secret and `key_id` for all batches:

```bash
qlm-pipeline --root "$PWD" --manifest config/synthetic-batch-1.json --run-id synthetic-batch-1
qlm-pipeline --root "$PWD" --manifest config/synthetic-batch-2.json --run-id synthetic-batch-2
qlm-pipeline --root "$PWD" --manifest config/synthetic-batch-2.json --run-id synthetic-replay
qlm-pipeline --root "$PWD" --manifest config/synthetic-correction.json --run-id synthetic-correction
```

The active event counts are **2, 5, 5, 5**, and the final history contains six
revisions. The repeated second batch reuses its original immutable receipt.
The correction replaces one active event with a higher revision and preserves
the previous revision in inspectable history. No event deletion is inferred
from omission in another batch. Missing original request records remain an
unresolved source link, not a fabricated request event.

An optional manifest `cumulative` object supplies `ledger_id` and immutable
`batch_id`. State is stored at `outputs/cumulative/<ledger_id>/state.json`.
Identity is adapter + source ID + native event ID, never row order, import time
or a generated Learnlog record UUID. Highest numeric source revision is active;
a lower revision can enter history without replacing it. Identical revisions
reconcile; a different payload at the same revision rejects the whole batch.
Changing subject or activity under one native event identity also rejects the
batch. Research transcript positions and participant rows are not automatically
promoted to native event IDs; a cumulative manifest with only those sources fails.

The ledger binds tenant, key ID and a non-secret keyed fingerprint to detect key
changes. It stores pseudonymized subjects and selected source content, never the
pseudonym secret or source learner ID. It uses a POSIX advisory lock, atomic
rename and file/directory sync. Workers need shared POSIX storage; an object
store or separate worker-local disks is insufficient. All processes writing
this ledger must honor the lock. Compact receipts bind immutable history
prefixes, so a delayed retry reproduces its earlier snapshot after later batches
commit without storing full history in every state receipt.

`cumulative_ingestion.json` exports each committed receipt, active snapshot,
revision history, origin labels and exclusions; its checksum enters
`COMPLETE.json`. These totals describe recorded source assertions, not validated
pooled scaffolding measures. Synthetic origin stays explicit in standalone
receipts. The file ledger is a bounded reference implementation: at most 5,000
input events per batch, 50,000 retained revisions and 100 MB serialized state.
An oversized commit fails before replacing state. Larger deployments need a
transactional store and a reviewed migration and retention policy. Hashes do not
authenticate the original source or prove complete capture.


## Exact archive verification

The package's build-time verification file distinguishes current component
checks from historical execution. The final Airflow execution record is
published after packaging at
https://transformer.quantumlearningmachines.com/downloads/qlm-transformer-airflow-verification.json
and identifies the archive SHA-256. Compare that digest with the downloaded
ZIP. An older archive's successful run does not verify a changed archive.
