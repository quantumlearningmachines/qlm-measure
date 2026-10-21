# Learnlog assistance capture profile for QLM Measure

QLM's project motivation is measuring AI scaffolding through QLM Measure. Learnlog expresses the assistance definitions, capture requirements and unavailable-information rules required of QLM products. This project history is supplied by the project author; it does not prove every product already complies. Open source release is intended; this working repository remains private.

This executable **unpublished draft profile** has payload version `0.1.0-draft`, schema identifier `urn:learnlog:proposal:assistance-capture:0.1.0`. It includes bounded complete importer-created-observation bindings for xAPI1.0.3 and Caliper1.2. It is not an adopted standard, deployed instrumentation, independently reviewed mapping, or evidence of superiority. Existing Learnlog core and `qlm:assistance-context:0.1.0` remain unchanged; the standalone core is an optional legacy carrier requiring a separate adoption justification.

External vendors need not adopt Learnlog, xAPI or Caliper: adapters can translate supported native exports into this agreement. These new carrier functions take an already assembled capture payload; they are not universal vendor adapters. A transformer cannot recover unlogged facts or justify invented lifecycle, actor, coverage or clock assertions. QLM's internal capture requirement and external translation are separate adoption paths.

The proposed contribution is an explicit assistance capture agreement: what an observation asserts, what the instrument covers, which information was examined, and which facts remain unavailable. Existing logging ecosystems can carry the agreement. JSON syntax, extension transport, and assistance verbs alone do not establish achieved capture or scientific comparability.

## Assistance definitions and bounds

An event's vendor label, such as `hint`, is preserved separately from its explicitly supported lifecycle assertion. No lifecycle state implies any later state; missing intermediate events do not disprove a supported later event.

| Lifecycle | Bounded meaning | Does not establish |
|---|---|---|
| `requested` | The cited source explicitly records a request for assistance. The requesting actor is identified only if actually available. | Generation, delivery, or a learner-originated request without actor evidence. |
| `generated` | The cited source explicitly records creation of assistance output. | Transmission or display. |
| `transmitted` | The cited source explicitly records sending assistance across its stated transport boundary. | Receipt or rendering. |
| `displayed` | The cited source explicitly records the defined presentation/rendering event. The mapping must document its display criterion. | Visibility to a person, reading, understanding, or learning. |
| `accepted` | The cited source explicitly records the defined acceptance action. The mapping must document whose action and its operational criterion. | Incorporation, independent work, understanding, or benefit. |

An assistance ID can connect events only when the source supports that connection. Temporal proximity is not a request-response link. `derived_labels` contain separately identified computed labels with their method and evidence; they never silently replace lifecycle observations. Native hint depth and display order are different quantities.

## Epistemic states

Every knowledge object requires `state`, `reason`, and `evidence_refs`. `observed` requires a non-null typed `value` and at least one resolvable evidence reference. **Observed means a bounded assertion was found in the cited evidence**, not that the underlying product behaviour or evidence authenticity has been independently verified.

| State | Required interpretation and support |
|---|---|
| `observed` | A specific value is supported by the cited record, documentation or test. State the assertion's boundary in `reason`. |
| `not_collected` | Evidence explicitly establishes that the relevant instrument did not collect this field/event within the described scope. Requires evidence and `capture_basis`; absence of a row is insufficient. |
| `not_reported` | Bounded material was actually examined and the required information was not found there. Requires evidence and `review_scope` containing the examined evidence IDs and search description. A missing key in material not reviewed cannot justify this state. |
| `not_reviewed` | The relevant information has not been examined. This is neither a negative finding nor evidence of nonreporting. |
| `unknown` | The value remains unresolved; explain why. Use this when missingness cannot be classified more specifically. |
| `not_applicable` | The field does not apply under a documented scope/rule. Requires evidence and a reason; inconvenience or lack of data is insufficient. |

All unavailable states prohibit `value`. Missingness must not be converted into numeric zero, false, no assistance, independent work, or a negative finding. Schema validation can reject an explicit `unknown` paired with zero/false; it cannot discover a dishonest, well-formed `observed` value citing irrelevant evidence.

## Capture, identity, versions and provenance

Each observation carries an instrument ID, five capability declarations, a boundary listing systems/event classes/exclusions, an observation window and achieved-coverage assertion. A capability says a hook is declared instrumented; it is **not achieved coverage**. `complete_within_boundary` requires known window endpoints and declared capability for each event class within that boundary; these mechanical prerequisites do not verify completeness. Source testing and external checks remain necessary. Unrecorded assistance from another device or tool is outside capture unless separately instrumented.

An observed lifecycle outside declared event classes is rejected. An observed stage also cannot coexist with the same instrument explicitly declaring that stage uncollected or its hook absent. An unknown or unreviewed hook declaration stays unresolved. Where both window endpoints and normalized native event time are known, an event outside that window is rejected; unknown native time remains unknown. The window describes source observation, not the importer's clock. These checks enforce declared scope, not capture truth or completeness.

Original source time, normalized UTC time and clock basis remain separate. Unknown native time cannot be replaced with importer time. The validator accepts a timezone-bearing ISO/RFC3339-style subset (Python-supported dates, no leap seconds, values exactly representable at microsecond precision). Greater nonzero precision in normalized source time is rejected rather than silently truncated; the original source string may retain it. Importer binding clocks must be exactly millisecond-representable. This is not a general time-synchronization verifier. Absolute references are checked for bounded URI shape, not retrieval or trust.

Event and optional assistance/subject identifiers are explicitly scoped. Anonymous events are permitted; a learner ID must never be invented to fit an existing carrier. Scope does not establish that two records concern different people. Product version, model version, source revision, activity, phase, permission and mapping review each retain their own epistemic state. A version observed in a source is a reported version, not verified backend execution.

Provenance requires a native-record reference, mapping reference and mapping-review state. Evidence references must resolve inside the contract. No raw prompt, answer, learner name or conversation text is required. Adding raw content requires a separately reviewed extension and purpose/access/retention decisions; this prototype does not make records anonymous or establish consent.

## Measurement use

A common lifecycle vocabulary is necessary for the proposed measurements but does not authorize pooling. A research profile must separately define the question, unit, denominator, identity assumptions, coding method, time window, missingness treatment and review criteria. Identical stage names, hashes, or capture declarations do not establish construct equivalence, independent observations, causal validity, or transportability.

The three `examples/SYNTHETIC_hint_*.json` fixtures deliberately share the label `hint` but assert request, generation and display respectively. `SYNTHETIC_raw_records.json` exposes the corresponding illustrative raw declarations. They demonstrate distinctions the contract can represent, **not observed mistakes in research or real product data**. No counts from these fixtures belong in empirical studies.

## Existing implementation and carrier compatibility

The existing `qlm:assistance-context:0.1.0` profile uses `help_requested`, `help_generated`, `help_transmitted`, `help_displayed` and `learner_response_observed`. The first four correspond to the proposed stages only after their operational criteria are reviewed. `accepted` has no automatic one-to-one crosswalk to the broader `learner_response_observed`. Do not fabricate acceptance from any subsequent learner action.

The new typed states are richer than legacy null/`unknown` fields. Preserve the contract as a sidecar or documented extension; flattening all states to null loses meaning. An old writer requiring learner identity cannot faithfully represent an anonymous event by inventing an ID. This prototype leaves that writer unchanged.

See [carrier-bindings.md](carrier-bindings.md) for implemented draft bindings and [CHANGELOG.md](CHANGELOG.md) for changes. `carrier_bindings.py` emits complete records of importer software creating an observation record, using actual caller-supplied importer identity and creation time. Source uncertainty is preserved; no learner event is fabricated. `learnlog-xapi-profile.json` supplies the xAPI template and extension schemas. Caliper uses genericEvent/GeneralProfile and the standard envelope. Legacy fragments remain separately available in `carrier_fragments.py`. These bounded checks do not certify interoperability.

## Reproduce the checks

Use Python 3.11+ in a virtual environment and `pip install -r requirements.txt`, then run:

```sh
python build_schema.py
python build_examples.py
python build_bindings.py
python -m unittest discover -s . -p 'test_*.py' -v
python validate_contract.py examples/SYNTHETIC_hint_requested.json examples/SYNTHETIC_hint_generated.json examples/SYNTHETIC_hint_displayed.json
```

Tests cover typed unknowns, bounded nonreporting, evidence traceability, anonymous observations, capture prerequisites, clocks, derived methods, legacy fragments, complete carrier roundtrips and deliberate inconsistencies. Full examples in `examples/carriers/` are synthetic source observations. The generation fixture has unknown native event time; the known importer clock does not fill that gap. Governed public identifiers, native learner bindings, live receiver interoperability, certification, xAPI2.0 compatibility, independent semantic review, capture validation and effectiveness studies remain pending.
