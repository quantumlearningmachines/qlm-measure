# Unreleased 0.3.0rc1 preparation

- Add assistance capture schema, bounded validators, current carrier bindings
  and shared SQL from the corrected research implementation.
- Add the `qlm-capture` CLI with an explicit synthetic example and pinned
  research reproduction; keep private telemetry out of release artifacts.
- Retain the 0.2.1 contained writer and distinguish its producer version from
  the distribution version. Preserve existing MIT and third-party notices.
- Prepare Airflow and demo integration in qlm-measure; no publication implied.

# 0.2.1 — experimental alpha (2026-10-16)

- Assign MIT terms to the QLM-authored transformer and QLM-authored companion AI
  Use profile; retain separate IETF draft and upstream dependency notices.
- Add package metadata and installed-wheel `init-demo` resources so synthetic
  quickstarts run outside a source checkout.
- Accept nonempty text and nonboolean integer pseudonymization IDs with decimal
  integer normalization; reject unsupported ID values and ambiguous malformed
  input through controlled errors.
- Reject timestamps beyond six fractional-second digits instead of silently
  reducing their precision; strengthen malformed structure validation.
- Document the alpha status, synthetic-only vendor mappings, unvalidated AI
  conditions and pending schema/interoperability work.

The schema URIs remain development placeholders. No live vendor integration,
real-vendor validation, independent interoperability check or legal provenance
audit is claimed. This preparation does not publish the package.

# 0.2.0

- Target the author's Learnlog revision -01; retain its unchanged wire format and hash formulas.
- Add optional immutable proposed AI Use v0.1.0 context to explicit event imports,
  with task/version/session/stage/policy binding and declared observation limits.
- Preserve explicitly mapped assistance content, answer-revelation flag and
  instrument provenance. No content classification or model call is performed.
- Create all C01-C16 as unreviewed sidecar items, and validate authored reviews
  against evidence references, reviewed coverage and comparator requirements.
- Keep unreviewed information separate from reviewed-but-unreported information,
  outside observation, prohibited assistance and unsupported condition absence.
- Expose `convert --ai-context`, `conditions`, and `verify --assessment` commands,
  plus Python `conditions_template`, `verify_conditions` and explicit custom-platform whitelist.
- Reject duplicate JSON keys, nonfinite JSON values, boolean sequence numbers,
  mixed AI scopes, dangling references and unsupported classifications.
- Add synthetic AI fixture, normative hash vectors and security/methodology mutation tests.

Five vendor mapping templates still require validation against actual exports.
The AI condition set is proposed and unvalidated; this release does not validate
study applicability, learning effects, authenticity or observation completeness.
