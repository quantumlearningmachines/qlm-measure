---
name: learnlog-assistments
description: Read an ASSISTments 2012-13 School Data with Affect file (your own copy) with the Learnlog MCP and say, stage by stage, what it records about help and what it can't show. Counts only; rows never leave the file.
---

# ASSISTments + Learnlog: what a hint log actually records

Use this when someone has the ASSISTments 2012-13 School Data with Affect CSV, or a file in the same layout, and asks what it says about help.

## What you need
- The Learnlog MCP (`npx -y @qlm/learnlog-mcp`).
- The person's own copy of the file. It isn't bundled anywhere: get it from ASSISTments under its terms of use (https://sites.google.com/site/assistmentsdata/datasets/2012-13-school-data-with-affect).

## Steps
1. Call Learnlog `assistance_inventory` with `assistments_csv` set to the file's full path. Nothing else is needed.
2. Report what the file records, stage by stage, from the tool's `stages.assistments`:
   - requested: the count, split into hints short of the answer, hints to the answer (bottom-out) and asking for steps;
   - offered: candidates only, by rule (steps likely given after a wrong first answer), not established offers;
   - generated, transmitted, accepted: not recorded;
   - displayed: not logged as its own event.
3. Give the denominators the tool gives: main problems, scaffolding logs, students, and students who ever asked.
4. If the tool says `is_the_preprint_release: false`, say the numbers are this file's, not the Learnlog preprint's. If it is the pinned release, report the comparison it returns.
5. Close with what the file can't show, from `cannot_conclude` and `does_not_show`.
6. For the topic in the last section, use the skills with the most requests from `assistments_requests_by_skill` (counts by the file's own skill labels). Many requests on a skill isn't evidence of a misconception; it's where to look first.

## Keep these straight
- Counts only. Never ask for, quote or reconstruct rows, IDs or answers.
- "Not recorded" is never "none", and never zero.
- The four affect values are detector inferences, not observations.
- Asking for a hint isn't evidence that a hint was read or helped.
- If the file is synthetic (made only in the same layout for a demo), say so in the first line of the answer.

## Then: misconceptions and LabPath worlds
Always finish here.
1. **Pick the topic.** Use what the person named, or the data's own labels (an ASSISTments skill, a Sandpiper code about a student error, a standard, an activity id). Say where the topic came from. If you inferred it from the text, say that it's your inference.
2. **Name the likely beliefs.** Call `qlm_misconceptions` with words from the topic, and a domain when it's clear. For the top two or three matches give the student belief, one way to check for it (its diagnostic question when it has one), and its teacher intervention.
3. **Suggest LabPath worlds.** Each match lists its `worlds`. Suggest them by name, with each world's link exactly as the tool gives it. Never write a link the tool didn't return. For a science topic, `qlm_learning_graph` on a world says what to do before and after it.
4. **Say what this is.** These are research-based possibilities to check with the students, not a diagnosis of them.
5. **Stay at the class level.** Answer for the class or group the data covers: what to check first, the likely misconceptions, one teacher move from QLM's dataset and the worlds to use. Don't plan for an individual student, put lessons in order, or say what to do if a move doesn't work. Each learner's next move, and checking later that a fix held, is QLM's Q-core engine. It isn't part of this MCP. If someone asks for that, say so in one line.
