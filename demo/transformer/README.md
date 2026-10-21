# QLM Transformer demo release candidate

This prepared update targets `transformer.quantumlearningmachines.com` on the
existing Vercel project. It has not been deployed by this preparation.

The page leads with assistance definitions, capture requirements and explicit
unknowns. Users can inspect source formats, run supported transformations in
their browser, preserve source provenance, and download the matching Airflow
starter. Processing stays in the tab; there is no learner-data upload API.

## Distinct demonstrations

- The interactive importer uses attributed TutorMoments transcript excerpts
  and OATutor participant summaries. It does not represent five commercial
  product integrations. Assignment to a condition does not establish help use.
- The source-coded interval panel retains published, LLM-assisted scaffolding
  codes over two human tutoring sessions. It does not infer scaffolding from
  every tutor turn or measure intervals in the participant-summary dataset.
- The request-inventory panel presents aggregate facts from the pinned
  Zenodo/IDETrace analysis. Its 1,109 records retain source and native-label
  strata. Actual help totals, comparable rates and learning effects are unknown.
- Carrier teaching fixtures are synthetic and never enter empirical counts.

See `THIRD_PARTY_DATA.md`, `SOURCE_CORRECTION.md` and the bundled provenance for
the source declarations, exact excerpts, exclusions and data-use limits.
No raw Zenodo/IDETrace telemetry is included in this site or its downloads.
Known identifiers are pseudonymized in supported exports; free-text privacy
review is still required before sharing learner dialogue.

## Build the matching downloads and check the demo

From the qlm-measure repository root with Python 3.12 and Node 22:

```bash
python -m pip install ./tools/qlm-transformer ./integrations/airflow
python integrations/airflow/build_download.py
python demo/transformer/scripts/build_release_assets.py
node --test demo/transformer/tests/*.test.mjs
python demo/transformer/scripts/verify_semantic_parity.py
python demo/transformer/scripts/verify_scaffolding_parity.py
python demo/transformer/scripts/verify_profile_demo.py
```

`build_release_assets.py` derives ZIPs from the current capture implementation.
The Airflow bundle vendors the same canonical transformer package at build
time; no second writer source copy is tracked. `release-candidate.json` records
exact ZIP hashes and an explicit `prepared` state. It makes no public source,
preprint DOI, registry publication or hosted-CI claim.

To refresh empirical facts, first run `qlm-capture research` against the pinned
inputs outside the repository, then run:

```bash
python demo/transformer/scripts/build_cross_source_demo.py PATH_TO_AGGREGATE_PUBLIC_JSON
```

That packaging script accepts the bounded aggregate-facts schema and required
pipeline verification fields. It does not independently reproduce the source
run or validate the underlying research. To refresh synthetic carrier examples,
use `build_profile_examples.py` with the current reference contract's
`examples/carriers/demo-bindings.json`.

## Deployment preparation

The Vercel root for this candidate is `demo/transformer`, output directory
`dist`, with `npm test` as its build check. The existing project is
`qlm-transformer` (`prj_mzqznA27d4v3SK79RXxLQxNBceiq`) in team
`team_UoeCtnqdrONgbWwvjg11hw9N`. Project-list metadata identifies it; detailed
project inspection returned a 403 for a missing team grant. Current Git linkage,
Root Directory and deployment protection were therefore not verified. Do not
change routing or assume a preview is private without resolving that access.

This managed environment does not expose the required control-browser skill,
so no browser visual/interaction QA is claimed. Node contract checks and
Python/browser serialization parity are distinct from browser execution.
After publication approval, verify the exact reviewed Vercel build and download
bytes before promoting it. See `docs/transformer/RELEASE_PLAN.md` at repo root.
