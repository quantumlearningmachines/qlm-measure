## 0.1.1-draft binding correction on 20 October 2026

Separate software identity from the explicit xAPI account-system homepage and name. Reject URN account homepages in this HTTP(S) subset. Retain stable1.0.x Statement metadata and omit provider Statement.version. Reject invalid timezone-offset components before Python date parsing; native values outside the supported subset retain unknown UTC. Add regression coverage and regenerate synthetic fixtures and manifests. Capture payload0.1.0-draft is unchanged. Local checks remain distinct from interoperability or certification.

# Change log

## Unpublished assistance profile binding draft0.1.0

- Repositioned the agreement as an assistance capture profile for QLM Measure, carried through xAPI and Caliper. Original Learnlog core remains an optional legacy carrier.
- Added complete xAPI1.0.3 importer-created-observation statements, an xAPI Profile1.0 template/concepts/inline schemas, Caliper1.2 Event/GeneralProfile records and standard envelopes.
- Reused ActivityStreams create rather than defining duplicate assistance verbs. Reserved-domain and experimental Learnlog namespace identifiers remain unpublished draft names.
- Added exact roundtrips, batching/order checks and explicit actor/time/identity/digest/schema mismatch rejections. A source-time-unknown fixture retains that unknown despite the known importer clock.
- Assistance payload schema and version `0.1.0-draft` remain unchanged. Fixed bounded consistency validation: an observed stage cannot coexist with the same instrument explicitly declaring that stage uncollected or its capture hook absent.
- Fixed importer-clock precision handling beyond six fractional digits and source-window comparisons that could silently truncate submicrosecond values. Source normalized timestamps must be exactly microsecond-representable; importer timestamps exactly millisecond-representable. Original source strings may retain greater precision without being falsely normalized.
- Added bounded structural checks for optional identifiedAgent LRS authorities; Group authorities are deliberately unsupported by this reader.
- Existing native adapters can produce an assistance payload from supported exports; external vendors need not implement these carriers. These new carrier functions accept an already assembled payload, not arbitrary vendor data.
- Legacy fragment helpers remain distinct from full records. No public release, receiver interoperability, certification, xAPI2.0 compatibility, independent semantic review or superiority result is asserted.
