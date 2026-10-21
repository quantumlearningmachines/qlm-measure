# Release preparation validation

Prepared a private candidate for **qlm-transformer 0.3.0rc1**, **Airflow pipeline
0.5.0rc1** and the demo update targeting transformer.quantumlearningmachines.com.
The target qlm-measure repository is already public. No public release, registry
publication or production deployment was made during preparation.

The implementation commit is `d7f78dbc949a2170bdbd600dfd3d19cb6aa8fedf` against target base `41b41ba31be02ddfcde0b5be99b723d8749c6074`.
The companion JSON report records artifact hashes and exact execution evidence.

## Automated checks

| Suite | Passed |
| --- | ---: |
| transformer | 75 |
| capture-analysis | 35 |
| capture-contract | 73 |
| capture-sql | 17 |
| pipeline | 58 |
| demo | 138 |
| existing_sdk_python | 144 |
| existing_sdk_typescript | 175 |
| Total | 715 |

All listed suites passed. The existing SDK TypeScript typecheck passed. Wheel,
source-distribution and standalone ZIP installations were tested in fresh virtual
environments outside the checkout. Each passed dependency checks and ran the
capture CLI, contained-file convert/verify CLI and transcript/participant CLI.

The source release patch was applied to a clean target checkout and reproduced
the candidate Git tree exactly. Original CSV CRLF and source JSONL bytes are
preserved; whitespace must not be normalized when applying the patch.

## Research and Airflow execution

The pinned source files were re-read and hash-checked: 1,060,271 native Zenodo
rows plus 30,283 IDETrace rows. The retained inventory was 960 hint-button
requests, 90 retries and 59 chat queries: **1,109 selected released request
occurrences**. Direct capture, xAPI recovery and Caliper recovery produced the
same shared SQL results. No new download of those source releases is claimed.

Actual Airflow 3.3.2 task execution passed three cases: synthetic capture (three
tasks), transcript/participant import (five task instances including mapped
conversions), and pinned real-source capture (three tasks, 1,109 request records).
These used Airflow local test services via `dags test`, not a production
scheduler or remote-worker deployment. Later tests at the same logical date
replace earlier metadata; execution logs retain the synthetic run evidence.

The download manifest verifies 184 entries. Its vendored
transformer bytes match the canonical package. No raw Zenodo/IDETrace telemetry,
runtime outputs, private caches or credential files enter that archive. The
separately attributed TutorMoments/OATutor demonstration excerpts are retained.

Airflow ZIP SHA-256: `cbd6944bf02bfbf5aac7502385f1638cefec4490e75d93675c92c4ed1d34bc7d`.

## Remaining boundaries

Browser visual/interaction QA was unavailable because the managed environment
does not expose control-browser. Hosted GitHub CI has been prepared but has not
run. Vercel project-list metadata identifies the existing project; detailed
inspection returned 403 for a missing team grant. Git linkage and deployment
protection remain unverified, and no preview or production deployment was made.

Nested smoke-runner probes encountered `psutil.NoSuchProcess` in the managed
environment. Those runners are excluded; shipped CI uses the direct CLI
commands that passed. This is disclosed rather than counted as a passing check.

Candidate mappings still lack independent human review, and source capture
completeness is unknown. These checks do not establish measurement superiority,
learning effects, commercial product integration or standards certification.
