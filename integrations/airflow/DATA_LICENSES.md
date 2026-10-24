# Published research data and attribution

The source code's MIT license does not relicense the following source excerpts.
The two research excerpts are redistributed under the publishers' **Creative
Commons Attribution 4.0 International** license:
<https://creativecommons.org/licenses/by/4.0/>. The Sandpiper fixture below is
synthetic and carries Sandpiper's MIT notice.
Preserve this attribution and the accompanying provenance when redistributing.

## TutorMoments-Preview

- Attribution: TutorMoments-Preview, Albert Zhang and colleagues, Allen
  Institute for AI and collaborators (2026).
- Source: <https://huggingface.co/datasets/allenai/tutormoments-preview>
- Revision: `3bb0c104d65e29facffca7ba864ef10fa22d0e78`.
- Included file: `samples/tutormoments-real-transcripts.jsonl`.
- Selection: complete original `transcripts.jsonl` lines 366 and 435. These two
  records preserve the source bytes, fields and newline bytes without changes.
- Sample SHA-256: `7df51fda0fff9c454ba14a33a0d2964d5e94b2556eff1d3897ec4f41373c8a66`.
- Full source file SHA-256: `34b5d4483302593043f3d9be3bf37f1cde6cba5b031fd2d20d75a15d5498f276`.
- Details: `provenance/tutormoments.json`.

These are released human tutoring transcripts, machine-transcribed with SUT
(Gemini 2.5 Pro), with publisher deidentification disclosed. They are not
verified verbatim audio. Relative offsets are retained; no absolute session
dates are created. Model-generated `enrichments` remain in the intact source
excerpt but are excluded from observed Learnlog events. The excerpts are a
purposive demonstration selection, not a representative sample or a test of
tutor quality. Do not attempt reidentification; follow the publisher's reporting
and redistribution guidance if residual personal information is found.

### Companion source-coded annotations

The scaffolding companion uses additional files from the same pinned
TutorMoments-Preview revision and CC BY 4.0 release. These are source coding
layers, not new observations of learner or tutor actions.

- `provenance/tutormoments-real-ground-truth.jsonl`: complete original
  `ground_truth.jsonl` lines 157 and 190, preserving their original bytes.
  Sample SHA-256:
  `cbfa7af79ce6145517003c931ff7dd3aba0bad656df1fc22bf940c8cdb203fa6`.
  Full source SHA-256:
  `9735b8c83575098dfac6928d1ff32a0aa283700651598ab9a7757879d6edcfda`.
- `provenance/tutormoments-real-human-annotations.jsonl`: 14 complete original
  annotation-pass JSONL records. The exact original line selections are listed
  in `provenance/scaffolding-evidence.json`.
  Sample SHA-256:
  `d2551b3b2073d6630de6d2908a28295b75e6df92c67af8f2c9e85bf37c2eb85b`.
  Full source SHA-256:
  `8a7adc65b8c63a78950a278eda5e4feaa5a093bab02d964bad1027468e18914f`.
- `provenance/scaffolding-evidence.json`: a QLM-organized derivative retaining
  the published categorical coding and selected situation/action/result text,
  with source hashes and selection metadata. It groups 60 selected source
  coding rows into ten exact-span intervals; repeated rows are not independent
  votes. The source's categorical labels are LLM-assisted. QLM ran no new
  semantic classifier.

The evidence JSON reorganizes the source content; it is not an unchanged
original source file. Retain the TutorMoments attribution, license link,
provenance and this description of the transformation when redistributing it
or derivative annotation reports. Faithful attribution and byte matching do
not establish semantic validity or tutoring effectiveness.

## OATutor participant data

- Attribution: Zachary Pardos and Shreya Bhandari (2023). *ChatGPT-generated help
  produces learning gains equivalent to human tutors on mathematics skills*.
  Figshare, version 1. <https://doi.org/10.6084/m9.figshare.23935269.v1>.
- Included file: `samples/oatutor-real-participants.csv`.
- Selection: exact original header and first 12 data records of `Participants.csv`,
  preserving original bytes and CRLF newlines. No values or columns are changed.
- Sample SHA-256: `26b98b6f5718f5c2f473d81ae1ad8e1817d18bada3ba7390d8e0ac445a8ad5a2`.
- Full source file SHA-256: `e6801fb72e0642df548d63fa75ec3487e3b4b283df5759ba2b70d7e2e41289c4`.
- Details: `provenance/oatutor.json`.

The published full file contains 274 participant summaries. This 12-row excerpt
contains assigned conditions and reported measures, not delivered-hint events.
The no-hint control still offered correctness feedback and an optional
bottom-out answer according to the associated paper; it is not labelled
unassisted here. Stored `learningGain` values are retained rather than
recomputed from rounded pre/post values.

## Sandpiper documentation examples (SYNTHETIC fixture, MIT)

`tests/fixtures/sandpiper-SYNTHETIC.csv` is not research data. It arranges
eight example utterances and one example annotation from the documentation of
Sandpiper, the National Tutoring Observatory's open-source annotation app, in
the layout of Sandpiper's PER_UTTERANCE utterances CSV. QLM did the arranging.
No National Tutoring Observatory data, real learner, real session or real
Sandpiper export is included.

- Source: <https://github.com/National-Tutoring-Observatory/sandpiper>, commit
  `28e0d25c069ce07c759d802184d4ab914e9cfe8b` (origin `main` when cloned on
  2026-10-24).
- Files used: `documentation/transcripts.md`,
  `documentation/schemas/examples/transcript-per-utterance.json`, and
  `app/functions/outputRunDataToCSV/app.ts` for the column layout.
- Fixture SHA-256: `d7b1a265f2e8abf37b0e070becc2e7c8a446576375de607322481c5015515ec0`.
- Profile: `profiles/sandpiper.json`.

Sandpiper is distributed under this license, which covers the example text:

> MIT License
>
> Copyright (c) 2025 National Tutoring Observatory
>
> Permission is hereby granted, free of charge, to any person obtaining a copy
> of this software and associated documentation files (the "Software"), to deal
> in the Software without restriction, including without limitation the rights
> to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
> copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all
> copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
> IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
> FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
> AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
> LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
> SOFTWARE.

## Transformed outputs

New source-specific adapter outputs retain original turn text, selected
non-identifier fields and original reported measures. Known subject identifiers
are HMAC pseudonymized in the Learnlog output. The original public excerpts are
intact, and free text is not automatically anonymized. Transformation is not a
new right to identify people or to redistribute unauthorized private uploads.
