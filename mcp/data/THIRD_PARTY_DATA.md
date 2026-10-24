# Published research data and attribution

The application's MIT code license does not relicense these data. Both supplied
excerpts are distributed under the publishers' **CC BY 4.0** grants. The original
publisher-deidentified data, citations, source restrictions and selection rules
are documented in each `dist/provenance/*.json` file. No original recording,
private export or personal identity mapping is included.

## TutorMoments-Preview

Albert Zhang and colleagues, *When Help is Unhelpful: Evaluating AI Tutors for
Productive Struggle* (2026 preview release). Ai2 and collaborators.

- Dataset: https://huggingface.co/datasets/allenai/tutormoments-preview
- Pinned revision: `3bb0c104d65e29facffca7ba864ef10fa22d0e78`
- Paper: https://tutormoments.allen.ai/static/paper/tutormoments-preview.pdf
- License: https://creativecommons.org/licenses/by/4.0/
- Supplied excerpt: complete `transcripts.jsonl` source lines 366 and 435,
  unchanged, with 149 and 161 turns respectively.

These are transcripts of real human tutoring sessions, machine-transcribed by
SUT (Gemini 2.5 Pro). The provider is anonymized. Publisher-generated surrogate
names/IDs are retained in the source excerpt. Absolute dates were removed by
the publisher. Relative offsets, transcript inaccuracies and source text are
not independently checked against a recording. The selected sessions contain
mathematics practice, explicit requests for help and tutor prompts; this is a
purposive demonstration subset, not a representative sample or quality rating.

Only released `turns[]` are mapped to observed transcript turns. Model-generated
`enrichments`, replay conversations and pedagogical labels are not promoted to
observed events. The Learnlog adapter omits known source ID fields from its
selected source-field payload and uses scoped pseudonyms; it is not a general
anonymizer for free text.

The companion scaffolding view uses exact original `ground_truth.jsonl` lines
157 and 190 and 14 complete original lines from `annotations.jsonl`, at the same
pinned revision and CC BY 4.0 license. The 60 included derived scaffolding rows'
situation/action/result strings match the raw human annotation release
verbatim. Their categorical need and action-direction labels are the source
publisher's LLM-assisted classifications, not new QLM classifications or
validated facts about assistance effectiveness. Sixty rows repeat labels for
ten distinct, sometimes overlapping intervals; each interval is counted once.
One raw human moment omitted by the publisher's derived release is not silently
added to the derived-label denominator. Source commentary can discuss context
beyond its marked interval, so the interval is not an exact assistance-event
boundary. `dist/provenance/scaffolding-evidence.json` records the source hashes,
line locators, labels, commentary and selection limits.

## OATutor help-condition study participant data

Zachary Pardos and Shreya Bhandari (2023), *ChatGPT-generated help produces
learning gains equivalent to human tutors on mathematics skills*, Figshare
dataset. The associated research article was published in PLOS ONE in 2024.

- Paper: https://doi.org/10.1371/journal.pone.0304013
- Archived dataset: https://doi.org/10.6084/m9.figshare.23935269.v1
- Original file: https://ndownloader.figshare.com/files/41974569
- License: https://creativecommons.org/licenses/by/4.0/
- Supplied excerpt: original CSV header and first 12 participant records,
  unchanged, with original column names and CRLF newlines.

This is a participant-level results table, not an event log. `condition` records
assigned ChatGPT, human-tutor or no-hint support; it does not establish actual
hint opening or receipt. The raw “Human tutor” condition refers to
human-authored hints, while “ChatGPT” refers to pre-generated solution hints;
these are not recordings of live tutor conversations. The paper reports correctness feedback and optional
bottom-out answers in the no-hint condition too; this label does not mean no
assistance. No timestamp, inquiry, hint text or event sequence is
supplied by that table. No learning effect is estimated by the demonstration.

## Separate cross-source request analysis: aggregate facts only

The cross-source panel adds **1,050** released Get Hint/Retry observations from
the JetBrains Academy plugin supplement to **59** `CHAT_QUERY` observations in
the selected TutorTrace / IDETrace deployment-8 file. These are source-native
request-record occurrences, not verified distinct human requests, pedagogical
quality labels or a complete assistance census. No raw learner rows, dialogue,
prompts, source-code payloads, event timestamps or linkable learner IDs from
these two additional releases are bundled with the website or its download.

JetBrains Academy supplement: Anastasiia Birillo, Aleksei Rostovskii, Yaroslav
Golubev and Hieke Keuning (2025), *Supplementary materials for the paper
“Understanding Student Interaction with AI-Powered Next-Step Hints: Strategies
and Challenges”*, v1, https://doi.org/10.5281/zenodo.17551130, CC BY 4.0. QLM
authored the transformations; no source-author endorsement is implied.

TutorTrace repository: `divadbaroon/TutorTrace_dataset_and_benchmark`, commit
`bc7990370da18a611a122255ebc3e475bd8a3fc6`, selected
`dataset/raw_telemetry/deployment_8.json`:
https://github.com/divadbaroon/TutorTrace_dataset_and_benchmark/tree/bc7990370da18a611a122255ebc3e475bd8a3fc6.
Its pinned `croissant.json` declares CC BY 4.0 with an anonymous creator. The
pinned datasheet is empty, GitHub reports no repository license, and published
population descriptions differ. No verified learner count, broad license-scope
claim or permission to redistribute the raw payload is inferred. The prepared
analysis distributes aggregate factual counts only. Source retrieval for
research reproduction requires the companion pipeline's explicit opt-in.

The generated `dist/examples/cross-source-analysis.json` retains source hashes,
release scopes, mappings, exclusions and metadata caveats. Candidate mappings
are agent-authored and agent-audited; independent human mapping review remains
pending. Raw source inputs and cached third-party code are excluded from the
prepared analysis archive.

## Original five branded examples

The original Khan Academy, MATHia, IXL, DreamBox Math and ALEKS synthetic
examples have been removed. They did not establish authentic vendor export
compatibility. See `SOURCE_CORRECTION.md`. No replacement dataset is relabeled
as one of those vendors. ASSISTments, DataShop and other investigated sources
are not bundled without established redistribution rights.
