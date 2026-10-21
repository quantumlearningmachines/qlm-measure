# Transformer and Airflow release preparation

The candidate targets `tools/qlm-transformer`, `integrations/airflow` and
`demo/transformer` in
[quantumlearningmachines/qlm-measure](https://github.com/quantumlearningmachines/qlm-measure).
That repository is already public. Opening even a draft PR there publishes
the new code. This preparation is staged privately; no registry publication,
GitHub release or production deployment is implied.

The contribution is reusable assistance definitions, capture requirements and
explicit unknowns across supported native exports and existing event carriers.
This does not demonstrate measurement superiority or better learning outcomes.

## Verification

From the repository root in an isolated Python 3.12 environment:

```bash
python -m pip install ./tools/qlm-transformer ./integrations/airflow build
python -m unittest discover -s tools/qlm-transformer/tests -v
python -m unittest discover -s tools/qlm-transformer/qlm_transformer/capture/reference/analysis -v
python -m unittest discover -s tools/qlm-transformer/qlm_transformer/capture/reference/analysis/vendor_contract -v
python -m unittest discover -s tools/qlm-transformer/qlm_transformer/capture/reference/sql_analysis -v
python -m unittest discover -s integrations/airflow/tests -v
python integrations/airflow/build_download.py
python demo/transformer/scripts/build_release_assets.py
node --test demo/transformer/tests/*.test.mjs
python -m build tools/qlm-transformer
python -m build integrations/airflow
```

Install built wheels and source distributions outside the checkout and run
their CLI entry points. Verify resources, license notices and download hashes.
Run Airflow 3.3.2 in a separate constrained environment: importing a DAG alone
does not demonstrate task execution. Reproduce the pinned-source inventory
separately; unit fixtures do not reproduce the 1,109 research observations.
Retain the existing SDK checks. Describe tests as passed only when the current
execution log supports the claim.

## Publication

Review the exact diff, data boundaries, licenses and residual human-review
limits. Apply the reviewed patch to current qlm-measure main, resolve any
intervening changes, open the public PR, run hosted CI and merge after review.
Tag transformer and pipeline separately. Registry publication and Zenodo
archiving are subsequent actions; no reserved package name or DOI is claimed.
EAR generators, private estimation code, credentials and raw Zenodo/IDETrace
telemetry are excluded. See [license scopes](LICENSING.md).

## Demo deployment

Preserve the existing Vercel project for
`transformer.quantumlearningmachines.com`. The prepared root is
`demo/transformer`, its output is `dist`, and Node tests are its build check.
Confirm team, project and Git linkage before changing Root Directory. Serve
the exact reviewed download and aggregate artifacts. Release metadata stays
`prepared` until publication; do not invent a tag or preprint DOI.

Stage and verify the reviewed build before promoting it. Preparation does not
change production or domain routing. Browser verification and hosted CI are
separate from local unit checks and must be reported accurately.
