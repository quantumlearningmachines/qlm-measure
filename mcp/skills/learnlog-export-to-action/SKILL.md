---
name: learnlog-export-to-action
description: Take a tutoring or learning export (TutorMoments, OATutor, explicit help events, or a Sandpiper run), convert it to Learnlog on this computer, say what it records about help and what it can't show, then name likely misconceptions and the LabPath worlds that work on them.
---

# From an export to what to check first

Use this when someone gives you an export file, or asks what their logs say about help.

## What you need
- The Learnlog MCP (`npx -y @qlm/learnlog-mcp`). The conversion runs on this computer; nothing is uploaded.

## Steps
1. **Know the format.** Call `learnlog_formats` if you're unsure which format the file is. Ask if it isn't one of the listed formats; don't guess a mapping.
2. **Convert it.** Call `learnlog_transform` with the format and the file's full path. Don't ask for the whole document; the summary, unknowns and preview are enough.
3. **Take stock of help.** Call `assistance_inventory` with the same format and path.
4. **Report, stage by stage**: requested, offered, generated, transmitted, displayed, accepted. For each one, say whether the file records it and how many. Then give the unknowns the records keep, and what the file can't show.
5. **Check a saved file** with `learnlog_validate` when someone gives you a Learnlog file instead of an export.

## Keep these straight
- One stage never implies the next. A request isn't help given, and a display isn't help read.
- "Not recorded" is never "none", and never zero.
- Observed, self-reported and inferred are different. Codes or labels added by a model or a person are inferred.
- A bundled sample marked SYNTHETIC is not learner data; say so.

## Then: misconceptions and LabPath worlds
Always finish here.
1. **Pick the topic.** Use what the person named, or the data's own labels (an ASSISTments skill, a Sandpiper code about a student error, a standard, an activity id). Say where the topic came from. If you inferred it from the text, say that it's your inference.
2. **Name the likely beliefs.** Call `qlm_misconceptions` with words from the topic, and a domain when it's clear. For the top two or three matches give the student belief, one way to check for it (its diagnostic question when it has one), and its teacher intervention.
3. **Suggest LabPath worlds.** Each match lists its `worlds`. Suggest them by name, with each world's link exactly as the tool gives it. Never write a link the tool didn't return. For a science topic, `qlm_learning_graph` on a world says what to do before and after it.
4. **Say what this is.** These are research-based possibilities to check with the students, not a diagnosis of them.
5. **Stay at the class level.** Answer for the class or group the data covers: what to check first, the likely misconceptions, one teacher move from QLM's dataset and the worlds to use. Don't plan for an individual student, put lessons in order, or say what to do if a move doesn't work. Each learner's next move, and checking later that a fix held, is QLM's Q-core engine. It isn't part of this MCP. If someone asks for that, say so in one line.
