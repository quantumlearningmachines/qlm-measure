# Learnlog assistance episodes across three released datasets

Scripts and aggregate outputs for the episode analysis in the Learnlog preprint (version 0.6). Counts only; no learner data.

- `cross_source.py` → `cross_source_episodes.json`: Zenodo 17551130 v1 (next-step hints) and IDETrace deployment 8, pinned by SHA-256 in the output.
- `assistments_episodes.py` → `assistments_episodes.json`: ASSISTments 2012-13 School Data with Affect. The data were provided by the ASSISTments TestBed (WPI) and are not redistributed here; obtain them from ASSISTments under its terms of use. This script is published because those terms ask that algorithms used with the data be made public.

Rules for every count are in each script's docstring and in Supplement S1 of the preprint. Written with Claude (Anthropic) and run by the author on his own machine.

Correction (October 21, 2026): the Zenodo activity file is not in time order within a research ID, so `cross_source.py` now compares copy and paste timestamps instead of file positions. Pastes with no copy or cut in the 600 seconds before: 291 of 1,826 (295 in the earlier file-order version). No other count changed.
