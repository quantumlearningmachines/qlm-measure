# SYNTHETIC files from `qlm-transformer convert`

These Learnlog files were written by `qlm-transformer convert` (qlm-transformer 0.3.0rc1 at qlm-measure aa91dc3, writer 0.2.1) from its own synthetic demo inputs (`qlm-transformer init-demo`). They hold no learner data. The pseudonym key was a fixed test key, `f` repeated 64 times.

| File | Input | Profile | Extra |
| --- | --- | --- | --- |
| `convert-mathia-summary-SYNTHETIC.learnlog.json` | `demo/examples/mathia.json` | `demo/profiles/mathia.json` | |
| `convert-explicit-events-SYNTHETIC.learnlog.json` | `demo/examples/explicit_events.json` | `demo/profiles/explicit_events.json` | `--platform mathia` |
| `convert-ai-events-SYNTHETIC.learnlog.json` | `demo/examples/ai_events.json` | `demo/profiles/ai_events.json` | `--platform mathia --ai-context demo/examples/ai_context.json` |

Every file was made with `--tenant synthetic-school --synthetic`, and each one passes `qlm-transformer verify FILE --checkpoint HEADS`, using the matching `.heads.json`.

They test issue #22. These files follow draft-srivastava-learnlog-03: timestamps with up to nine fractional digits, and no QLM semantic profile binding. The MCP used to reject them because it only knew the browser transformer's stricter profile.
