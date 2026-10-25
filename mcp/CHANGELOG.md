# Changelog

## 0.2.2 (October 25, 2026)

- The four skills stay at the class level: what to check first, the likely misconceptions, one teacher move and the worlds. They don't plan for an individual student, order lessons, or say what to do if a move doesn't work. Each learner's next move, and checking later that a fix held, is QLM's Q-core engine, which isn't part of this MCP.
- The Learning Commons skill names the argument `find_standard_statement` needs, `statementCode`. Without it an assistant could send `identifier` first and get "missing field `statementCode`".

## 0.2.1 (October 24, 2026)

The first release on npm, as `@qlm/learnlog-mcp`. 0.2.0 was never published.

- README: what to do when Claude Desktop can't start the server because it can't find Node (an app opened from the Dock on a Mac gets no `PATH`).

## 0.2.0 (not published)

Misconceptions and LabPath worlds by default:

- `qlm_misconceptions` gives each misconception's LabPath worlds with their names and public pages. `qlm_learning_graph` names every world in its answer the same way. A world gets a link only if it is in `data/labpath-worlds.json`, which `scripts/refresh-worlds.mjs` builds from the live world pages (100 of 100 checked on Oct 24, 2026).
- `assistance_inventory` on an ASSISTments file adds `assistments_requests_by_skill`: help requests on main problems, by the file's own skill labels (counts only, 15 most requested).
- An answer about some of the preprint's files lists only the cautions that apply to them.
- Four Claude skills ship in `skills/`, each ending on misconceptions and LabPath worlds.

Published as `@qlm/learnlog-mcp`, under QLM's npm account (it was `@quantumkumar/learnlog-mcp` before release).

A fourth format, `sandpiper`: the utterances CSV that Sandpiper, the National Tutoring Observatory's open-source annotation app, exports for a per-utterance run. `learnlog_formats` lists it stage by stage, and `learnlog_transform` and `assistance_inventory` accept it.

- One record per session, entries in `sequence_id` order. Each utterance is a dialogue turn; role and text are kept as the export has them, and start/end times stay unparsed strings.
- Annotation codes are kept as an annotator's inferred assertions. The inventory reports turns by role and counts codes by annotator and field, never as help. Every stage is not recorded.
- The bundled sample is SYNTHETIC, built from Sandpiper's documented example rows (MIT). There is no public NTO dataset in this package.
- Re-vendored the transformer from qlm-measure commit 68404b53d0584c9817346b83ee499a38b692adcd. Documents made by the previous engine still validate (tested with saved outputs), because existing formats keep their profile version, `qlm:assistance-context:0.1.0`; Sandpiper records bind `0.2.0`.
- Answers keep a member named `__proto__` as data instead of dropping it, since exported role and annotator names can be any text.

Two new read-only tools, which read QLM's public LabPath datasets (CC BY 4.0) from `https://play.quantumlearningmachines.com/api/labpath/dataset-export` with GET only, a timeout, no redirects and one request per dataset per session:

- `qlm_misconceptions`: searches the misconception dataset by words, domain, grade band or id. Evaluation-tier trigger patterns and diagnostic questions are never returned.
- `qlm_learning_graph`: what comes before or after a LabPath activity, from a mode id or a standard code, with teacher-facing reasons, linked misconception ids and aligned standards.

Every answer now fits what an assistant can take in at once (30,000 characters of JSON, under Claude Code's 10,000-token warning). Before this, two answers were far too large and Claude Code rejected them:

- `learnlog_transform` with `include_document` returns the whole document only when the answer fits. Otherwise it reports the document's size in `document_omitted`. A 91 KB tutoring export made a 1 MB document.
- `qlm_learning_graph` shows 10 links per direction by default (was 25), each edge's first 8 concepts (with `concepts_total`), full standards only for the asked-about activity and standard codes for linked ones (`linked_mode_standards`). If a limit still wouldn't fit, it is lowered and `limit_lowered` says so. The most it accepts is 50 (was 200).
- Any answer that still wouldn't fit is refused with its size and what to ask for instead.

## 0.1.0 (not published)

First release. Six read-only tools over stdio:

- `learnlog_formats`: the transformer's source formats and what each records at each of the six assistance stages.
- `learnlog_transform`: a local export, or a bundled public sample, into Learnlog records.
- `learnlog_validate`: replays a Learnlog file's hash chains and lists the unknowns each record keeps.
- `assistance_inventory`: what a dataset records about help, stage by stage, with counts and limits. Recomputes the Learnlog preprint's inventory and episode counts from your own copies of its three released datasets.
- `verify_evidence`: qlm-measure's verifier on a local evidence record or product hash chain.
- `verify_credential`: one request to app.qlmdev.com to verify a QLM credential.

Wraps, unchanged, the QLM transformer engine and the qlm-measure 0.9.0 verifier from qlm-measure commit 24419687cddf238030a918834fbb9ef079f2fc57. The preprint's counting rules are ported from its Python scripts and tested against them on the same files.
