# Experimental QLM import events v0.2

Development schema URI: https://example.org/qlm-transformer/schemas/import-v0.2
Namespace: qlm_import. This URI MUST be replaced by a QLM-controlled immutable publication
before this development profile is promoted as an interoperability specification.

Both types use LearnLog draft-01 event envelopes and required random salt.

`qlm_import:summary_observed`: the importer observed a source report row, at the time of
import. Actor MUST be the importing software system. `data.provenance` MUST contain
platform, source_sha256, source_row (1-based data row), imported_at and mapping_sha256.
`data.reported_metrics` is an object of explicitly selected source metric values.
`data.missing_metrics` lists selected metric labels absent or blank in the source row.
`data.assistance` MUST be "unknown"; no completeness or independent-work claim follows.
Optional activity is the reported source activity, not a verified task execution.

`qlm_import:response_observed`: a source event reports a learner response.
`data.provenance` has the same required fields. `data.response` contains only the explicitly
mapped source response. Entry time is the source event time normalized to UTC, not import
time. No correctness, mastery, reasoning quality, or independence is inferred.

The built-in assist schema supplies the two help types. The importer adds `provenance` as
an extension to their data objects. These extension data members are covered by event hashes.
A supplied provider role/kind describes the source provider, not the importer. Mapping a
source event to help_requested/scaffold_provided requires documented semantics; opening a
hint button alone must not be mapped to scaffold_provided unless delivery was recorded.

A summary record is useful for uniform transport and source provenance but does not satisfy
an event-complete assistance logging requirement. Missing assistance is an explicit limit.

The optional proposed AI Use v0.1.0 context uses immutable `header.ai_context` and
`event.ai_context` links; see the bundled schemas and adapter documentation. It
requires explicit matching activity/version/session fields. It supplies policy
and producer-declared coverage, not observed use or verified completeness.
Condition judgments are separate hash-referenced sidecars, not learner events.
Imported sequence numbers describe input row order, not independently verified
observed chronology. C01 support is unavailable in the present adapter.
