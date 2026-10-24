# Changelog

## 0.1.0 (not yet published)

First release. Six read-only tools over stdio:

- `learnlog_formats`: the transformer's source formats and what each records at each of the six assistance stages.
- `learnlog_transform`: a local export, or a bundled public sample, into Learnlog records.
- `learnlog_validate`: replays a Learnlog file's hash chains and lists the unknowns each record keeps.
- `assistance_inventory`: what a dataset records about help, stage by stage, with counts and limits. Recomputes the Learnlog preprint's inventory and episode counts from your own copies of its three released datasets.
- `verify_evidence`: qlm-measure's verifier on a local evidence record or product hash chain.
- `verify_credential`: one request to app.qlmdev.com to verify a QLM credential.

Wraps, unchanged, the QLM transformer engine and the qlm-measure 0.9.0 verifier from qlm-measure commit 24419687cddf238030a918834fbb9ef079f2fc57. The preprint's counting rules are ported from its Python scripts and tested against them on the same files.
