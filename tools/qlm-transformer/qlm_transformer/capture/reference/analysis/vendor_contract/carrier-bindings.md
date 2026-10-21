# Draft assistance capture profile bindings

Learnlog is an assistance capture agreement for QLM Measure. These bindings carry that agreement through existing logging ecosystems. They do not replace xAPI or Caliper and do not show that a separate wire format is necessary. The original Learnlog core remains an optional legacy carrier with a sidecar when required.

External vendors need not emit Learnlog, xAPI or Caliper. Supported native exports can pass through a documented adapter into the agreement; relevant semantic review must be recorded separately rather than assumed. These binding functions accept an already assembled payload; they are not universal native adapters. Transformation preserves unknown or unlogged conditions rather than reconstructing them. QLM's internal instrumentation requirement is distinct from external translation.

The payload version remains `0.1.0-draft`. The corrected xAPI profile and binding version are `0.1.1-draft`, with independent identifiers. All `example.org` identifiers are reserved unpublished draft names, not reachable profile/schema registries. Existing `urn:learnlog:` identifiers are experimental, unregistered draft names. Assign governed persistent identifiers before a public interoperable release. This private draft remains mutable; freeze an archived release before distributing a public profile version. Rebuilding the fixture examples currently regenerates the profile creation metadata and examples together.

## Implemented importer-created observation mode

`carrier_bindings.py` emits complete records for a narrowly defined mode: importer software creates a digital record describing a source-bounded assistance observation. The host actor and timestamp concern that new record creation. The assistance event, available scoped subject information, source-time knowledge and unavailable states remain in the payload. Importer time never supplies missing historical event time; a software actor never supplies missing learner identity.

| Carrier | Host record and declared meaning | Payload location |
|---|---|---|
| xAPI1.0.3 | `Agent` software account **created** an assistance-capture-record `Activity`; `timestamp` is importer record creation time. | `context.extensions[https://example.org/learnlog/proposal/assistance-capture/0.1.0]` |
| Caliper1.2 | Generic `Event`, `GeneralProfile`: importer `SoftwareApplication` **Created** an observation `DigitalResource`; `eventTime` is importer record creation time. | Same extension key on `Event.extensions`. |
| Caliper envelope | Exactly `sensor`, `sendTime`, `dataVersion` and `data`; assistance metadata stays on each event. | No custom envelope properties. |
| Legacy Learnlog | Original fragment helper emits a sidecar with an explicit absolute `host_record_reference`. | `assistance_capture` on the sidecar; no core schema changes. |

Caliper GeneralProfile applies to this software-created observation-record interaction: ResourceManagementEvent requires a `Person`, while this interaction has a software actor. This does not imply that native assistance interactions should always use GeneralProfile. A native binding must select the applicable existing profile from actual actor/action/object evidence. No native learner-event binding is implemented here.

The xAPI target is **legacy1.0.3**; xAPI2.0 is not validated or claimed. The xAPI Profiles specification target is `https://w3id.org/xapi/profiles#1.0`. `learnlog-xapi-profile.json` contains:

- Profile `https://example.org/learnlog/proposal/assistance-capture-profile`.
- Version `https://example.org/learnlog/proposal/assistance-capture-profile/v/0.1.1-draft`.
- Statement template: that version plus `/templates/importer-created-observation`.
- One new record `ActivityType`, the full capture `ContextExtension`, and an importer-observation `ContextExtension`.

The template reuses `http://activitystrea.ms/schema/1.0/create`; it does not redefine that concept or mint assistance verbs. It constrains the verb through a JSONPath rule, avoiding a dangling Concept graph edge when its external vocabulary is not supplied as an extra profile. It does not assert request-response sequences, learner use, incorporation, independence or learning. TLA Toolbox, Rustici and GIFT already contain relevant assistance/adaptation vocabulary. Those learner-facing concepts are not synonyms for importer record creation.

## API and consistency checks

```python
from carrier_bindings import (
    xapi_statement, caliper_event, caliper_envelope,
    extract_xapi, extract_caliper, extract_caliper_envelope,
)

# Obtain actual identity and creation time from the running importer.
# These placeholder values explain the interface, not production observations.
importer_id = "https://example.org/my-unpublished-importer"
created_at = "2026-10-18T02:00:00.000Z"
statement = xapi_statement(capture, importer_id, created_at,
    account_homepage="https://example.org/my-synthetic-account-system",
    account_name="synthetic-importer")
event = caliper_event(capture, importer_id, created_at)
envelope = caliper_envelope([event], importer_id + "/sensor", created_at)
assert extract_xapi(statement) == capture
assert extract_caliper(event) == capture
assert extract_caliper_envelope(envelope) == [capture]
```

The caller supplies actual importer identity and record-creation time. The software rejects missing identities, missing/timezone-free times, submillisecond values that lose precision, and contradictory host actor/object/action/time/profile metadata. The importer clock is normalized to UTC milliseconds; source clocks are untouched. Normalized source clocks are limited to dates and precision exactly supported by Python datetime (no leap seconds, no nonzero digits beyond microseconds); original source strings can retain greater precision without a falsely normalized value. This is a bounded date-time subset, not all RFC3339 timestamps. Generated fixtures use the builder's execution clock for local construction. Their envelope `sendTime` is illustrative local envelope construction time; no HTTP Sensor API transmission occurred.

The contract is validated before encoding and after extraction. Companion checks cover evidence references, unavailable states, bounds and capture contradictions. Resource and binding identities derive from payload/importer metadata to detect mismatch. The digest is SHA-256 over Python JSON serialization with sorted keys, UTF-8, compact separators and finite values. It is an **implementation-specific representation**, not JCS/RFC8785, a signature or authenticity check. A malicious producer can forge a consistent claim or recompute a digest. Distinct import times create distinct host records for the same source observation. Analyses must deduplicate by reviewed source record identity, not host statement count.

The bounded xAPI reader accepts the generated shape plus optional `stored`, stable Statement `version` values `1.0.x` (including `1.0.0`), and a structurally checked single identified `Agent` authority. It deliberately refuses Group authorities and unsupported shapes; a full parser may accept valid records outside this subset. LRS fields never replace source assertions; authority authentication is not performed. The Caliper reader similarly checks the generated GeneralProfile subset, not all valid Caliper events or optional context properties.

## Schemas, examples and validation limits

xAPI extensions include inline draft-07 schemas. The builder translates this schema's common draft-07/2020-12 keyword subset (`$defs` to `definitions` and local references). It is not a general schema converter; payload version and meaning remain unchanged. Inline schema checks and companion consistency checks are both needed: requiring extension presence cannot validate its contents.

`examples/carriers/` contains complete xAPI statements, Caliper events and envelopes for three explicitly synthetic source fixtures. They are not vendor samples or research observations. The generation fixture deliberately has unknown native event time; its known importer clock demonstrates preservation of that unknown. `demo-bindings.json` contains the exact browser demonstration data and execution provenance; the UI does not reconstruct bindings.

```sh
python build_bindings.py
python -m unittest discover -s . -p 'test_*.py' -v
python verify_contract.py
```

Local checks establish construction, preservation and rejection of specified inconsistencies within the declared subset. Upstream validator results are reported separately with exact versions and scope. Neither proves live receiver interoperability, xAPI2.0 compatibility, Caliper certification, public identifier resolution, independent semantic review, truthful instrumentation or improved research decisions. These remain release and evaluation tasks.

## Primary sources and design decisions

- [ADL xAPI Data1.0.3](https://github.com/adlnet/xAPI-Spec/blob/1.0.3/xAPI-Data.md), sections2.4.2,2.4.6 and4.1: Agent systems, context and domain extensions. The [ADL version notice](https://github.com/adlnet/xAPI-Spec/blob/master/README.md) distinguishes current2.0 from legacy1.0.3.
- [ADL xAPI Profiles structure](https://github.com/adlnet/xapi-profiles/blob/master/xapi-profiles-structure.md), sections4–8: concepts, versions, extension schemas, templates and prohibition on redefining another profile's concepts.
- [Activity Streams schema](https://activitystrea.ms/specs/atom/1.0/): existing create vocabulary reused; no new create verb.
- [1EdTech Caliper1.2](https://www.imsglobal.org/spec/caliper/v1p2/), sections2.1,3.9,3.15,5.2,B.62,D.17: Event/Agent/Entity model, ResourceManagementPerson constraint, GeneralProfile applicability, envelope restrictions, SoftwareApplication and CreatedDigitalResource.
- [TLA Toolbox AI-Mediated Learning Interactions profile](https://tlatoolbox.com/profiles/89dbe88e-4c1f-462d-a024-dba07c348f7d.json): reviewed draft0.1.0 already defines prompt/response/scaffold/submission concepts and model/session context. These concern learner interactions, not importer creation.
- [Rustici AI/eLearning article](https://rusticisoftware.com/blog/you-cant-spell-xapi-without-ai/) and [author-linked archive](https://storage.pardot.com/492981/1778607007UY1HhNtB/AI_eLearning_Profile.zip): reviewed existing AI question/interaction/feedback/model/prompt definitions; not redefined here.
- [GIFT2025-1 xAPI documentation](https://www.gifttutoring.org/projects/gift/wiki/XAPI_Statements_2025-1): reviewed adaptation, learner-state and source/session/version conventions. No first-assistance-vocabulary or universal feature-absence claim is made.

Inspection is bounded to these versions and relevant sections. The accompanying standards audit records source reachability and scope; it does not establish that every existing profile lacks the proposed agreement.

## Correction on 20 October 2026

The capture schema remains `0.1.0-draft`. The corrected complete binding and draft xAPI profile use `0.1.1-draft`; the older binding is not silently reinterpreted. Callers must supply an account-system homepage URL and account name separately from importer software identity. This bounded implementation supports HTTP(S) homepages, not every possible IRL scheme. A software URN is retained as importer provenance and is never copied into `Account.homePage`. Ownership of an asserted account is not authenticated.

The constructor omits Statement.version. Legacy xAPI 1.0.3 requires providers that set it to use 1.0.0; LRS readers can encounter stable 1.0.x versions. That field is separate from the HTTP X-Experience-API-Version header. The additional xAPI importer_account metadata preserves the caller-supplied account assertion. Caliper metadata has no such required account field. The profile template and bounded validator supply carrier-specific requirements beyond the common metadata schema.

Invalid timezone-offset components such as `+00:60` are rejected before Python parsing. Source normalization retains the original string with unknown UTC instead of normalizing an invalid offset.
