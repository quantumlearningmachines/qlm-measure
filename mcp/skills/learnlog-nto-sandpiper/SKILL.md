---
name: learnlog-nto-sandpiper
description: Bring a National Tutoring Observatory Sandpiper run export (coded tutoring transcripts) into Learnlog, keeping each turn as observed and every code as inferred with who coded it, then name likely misconceptions and the LabPath worlds that work on them.
---

# National Tutoring Observatory (Sandpiper) + Learnlog

Use this when someone has a per-utterance export from Sandpiper, the National Tutoring Observatory's open-source annotation app: an utterances CSV with `_id, session_id, sequence_id, role, content, start_time, end_time` and one column per code, named `annotator[<name>][<index>]<field>`.

## What you need
- The Learnlog MCP (`npx -y @qlm/learnlog-mcp`). The conversion runs on this computer.
- The export file. There's no public NTO dataset; the MCP's bundled `sandpiper` sample is SYNTHETIC, built from the example rows in Sandpiper's own documentation.

## Steps
1. **Convert it.** Call `learnlog_transform` with format `sandpiper` and the file's full path (or `use_sample: true` for the synthetic sample).
2. **Take stock.** Call `assistance_inventory` with format `sandpiper` and the same path.
3. **Report what's observed**: sessions, turns by speaker role, as Sandpiper labeled them.
4. **Report what's inferred**: codes by coder and by code, how many utterances carry codes, and who produced them (AI or a person) when the export says. Every code is an inference about a turn, not something the log observed.
5. **Report what isn't there**: all six help stages are "not recorded" for this source. A code such as praise or a question isn't a step of help.

## Keep these straight
- Speaker roles and times stay exactly as the export has them. Missing times stay missing.
- "Not recorded" is never "none", and never zero.
- Don't judge whether a code is right, and don't turn codes into help counts.

## Then: misconceptions and LabPath worlds
Always finish here.
1. **Pick the topic.** Use what the person named, or the data's own labels (an ASSISTments skill, a Sandpiper code about a student error, a standard, an activity id). Say where the topic came from. If you inferred it from the text, say that it's your inference.
2. **Name the likely beliefs.** Call `qlm_misconceptions` with words from the topic, and a domain when it's clear. For the top two or three matches give the student belief, one way to check for it (its diagnostic question when it has one), and its teacher intervention.
3. **Suggest LabPath worlds.** Each match lists its `worlds`. Suggest them by name, with each world's link exactly as the tool gives it. Never write a link the tool didn't return. For a science topic, `qlm_learning_graph` on a world says what to do before and after it.
4. **Say what this is.** These are research-based possibilities to check with the students, not a diagnosis of them.
