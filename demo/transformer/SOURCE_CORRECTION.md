# Sample authenticity correction — 17 October 2026

The first public demo used six authored synthetic rows with generic headers under Khan Academy, IXL, DreamBox Math and ALEKS. Its MATHia example used documented Progress Report headers with invented values. These fixtures did not establish vendor export compatibility. Internal transformation tests did not validate vendor authenticity.

This release removes all five branded examples and their downloadable synthetic fixtures. It uses two explicitly named public research sources: TutorMoments human tutoring transcripts and OATutor participant summaries. Their original inputs have different, preserved structures. Public samples are exact-byte excerpts with pinned source locations, full-file and excerpt hashes, selection rules and license attribution.

TutorMoments source turns contain actual released student/tutor dialogue, including requests for help and tutor questions. They are machine-produced transcripts of real sessions, not native clickstream logs or independently verified recordings. No generated enrichment is promoted to an observed event. OATutor condition assignment is retained as assignment, not hint delivery. Import times are identified as import times; relative source offsets are not converted into invented dates.

This is a source-adapter demonstration. It does not establish integration with the original five vendors, comparable outcome scales, learning effectiveness, independent learner performance or valid causal pooling.
