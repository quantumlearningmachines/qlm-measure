---
name: learnlog-learning-commons
description: Turn a standard or a skill students are struggling with into its learning components, the standards that come before it, the likely misconceptions and a concrete teacher move. Use with the Learning Commons Knowledge Graph MCP and the Learnlog MCP side by side.
---

# Learning Commons + Learnlog: from a struggle to what to check first

Use this when someone names a standard (for example `7.RP.A.2` or `HS-PS2-1`) or describes what students are struggling with, and wants to know what to check first across the class.

## What you need
- The Learning Commons Knowledge Graph MCP (`https://kg.mcp.learningcommons.org/mcp`, an API key from Learning Commons, sent as the `x-api-key` header). It is in early access, so tool names may change.
- The Learnlog MCP (`npx -y @qlm/learnlog-mcp`).

## Steps
1. **Pin the standard.** Call Learning Commons `find_standard_statement` with the code. If the person described a struggle instead of a code, propose the most likely code and say it is your proposal. Keep the returned `caseIdentifierUUID`.
2. **Break it down (math).** Call `find_learning_components_from_standard` with that UUID. Learning components are available for math and K-2 ELA. For any other standard, say plainly that Learning Commons has no components for it.
3. **Look back (math).** Call `find_standards_progression_from_standard` with `direction: "backward"` to find unfinished learning that may sit underneath. Progressions are math only.
4. **Find the activities (science).** For a science standard, call Learnlog `qlm_learning_graph` with `standard` set to the code, to find the LabPath worlds aligned to it and what comes before and after them.
5. Finish with the last section below, using the standard and its components as the topic. Answer for the class: the standard in its official words, its components, the earlier standards that may sit underneath, what to check first, the likely misconception, one teacher move and the worlds to use.

## Keep these straight
- Learning Commons gives standards, components and progressions. QLM's dataset gives misconceptions and teacher moves. Say which source each part came from.
- QLM's misconceptions are not officially aligned to Common Core codes. Any link you draw between a misconception and a code is your reasoning; label it that way.
- Misconceptions are research-based descriptions, not observations of these students. Recommend checking with a diagnostic question before reteaching.
- Pass on each tool's `does_not_show` limits.
- When a source didn't capture something, "Not recorded" is never "none".

## Then: misconceptions and LabPath worlds
Always finish here.
1. **Pick the topic.** Use what the person named, or the data's own labels (an ASSISTments skill, a Sandpiper code about a student error, a standard, an activity id). Say where the topic came from. If you inferred it from the text, say that it's your inference.
2. **Name the likely beliefs.** Call `qlm_misconceptions` with words from the topic, and a domain when it's clear. For the top two or three matches give the student belief, one way to check for it (its diagnostic question when it has one), and its teacher intervention.
3. **Suggest LabPath worlds.** Each match lists its `worlds`. Suggest them by name, with each world's link exactly as the tool gives it. Never write a link the tool didn't return. For a science topic, `qlm_learning_graph` on a world says what to do before and after it.
4. **Say what this is.** These are research-based possibilities to check with the students, not a diagnosis of them.
5. **Stay at the class level.** Answer for the class or group the data covers: what to check first, the likely misconceptions, one teacher move from QLM's dataset and the worlds to use. Don't plan for an individual student, put lessons in order, or say what to do if a move doesn't work. Each learner's next move, and checking later that a fix held, is QLM's Q-core engine. It isn't part of this MCP. If someone asks for that, say so in one line.
