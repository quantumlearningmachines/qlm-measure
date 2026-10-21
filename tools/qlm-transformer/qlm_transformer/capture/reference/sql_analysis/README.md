# One SQL query across transformed scaffolding records

This executable example adds a downstream consumer of the proposed assistance
capture profile. Source-specific adapters first interpret two different native
formats. This loader does **not** interpret either format: it validates shared
capture records, loads them into SQLite and runs `query.sql` unchanged.

The selected releases are a JetBrains Academy next-step hint study (Zenodo
17551130) and TutorTrace/IDETrace deployment 8. The common numerator is a recorded
learner help-request observation. Native labels and source-release scopes remain
separate strata. Adding their counts is descriptive arithmetic, not evidence
that their pedagogy, assistance opportunities or populations are equivalent.

Run after the adjacent `analysis/aggregate.py` pipeline has created its private
JSONL outputs. All paths are explicit and portable:

```bash
python sql_analysis/run_sql.py \
  --contract-dir analysis/vendor_contract \
  --capture-jsonl /your/private/capture.private.jsonl \
  --xapi-jsonl /your/private/xapi.private.jsonl \
  --caliper-jsonl /your/private/caliper.private.jsonl \
  --output sql_analysis/SQL_RESULTS.json

python -m unittest discover -s sql_analysis -p 'test_*.py' -v

python sql_analysis/verify_sql.py \
  --results sql_analysis/SQL_RESULTS.json \
  --aggregate-public analysis/results/aggregate.public.json \
  --output sql_analysis/SQL_VERIFICATION.json
```

The Python environment needs the adjacent vendored contract's requirements
(`jsonschema==4.26.0`). SQLite with JSON functions is required; the executed
SQLite version is recorded in the output. The CLI uses in-memory databases and
writes only aggregate query results. Multiple `--capture-jsonl` arguments are
allowed; equivalent lists can be supplied for the optional carrier inputs.

`(scope, local_id)` identifies a release occurrence. An identical replay is
ignored; a conflicting payload at the same identity aborts and rolls back the
entire load batch. Equal content at different release positions remains separate.
This prevents accidental replay double counting, while avoiding a claim that
release positions identify unique real actions or cross-product learners.

The same SQL query runs after extraction from the direct profile and the draft
xAPI/Caliper bindings. Matching results show these bounded bindings preserve the
fields needed for this calculation. They do not establish Learnlog superiority,
full standard conformance, an LRS round trip or Caliper certification.

Unknown capture coverage is retained. The query exposes unreviewed mappings and
unresolved lifecycle records. `NULL` generation/display counts mean no eligible
observations of that stage were supplied, **not** zero real events. Actual help
totals, rates and learning effects remain `NULL`: this analysis has no suitable
capture-completeness evidence, comparable denominator or causal study design.

Only aggregate factual results are distributed. The private JSONL, SQLite files,
learner rows, learner source code, prompts and scoped local record identifiers must not
be included in a release. Native labels in query outputs must be event-category
labels, never free-form learner text. Source licensing and consent caveats remain
in the adjacent source manifest and analysis report.

## Executed result

The shipped `SQL_RESULTS.json` records a run on 1,109 validated release
observations: 960 "Hint button is clicked" records and 90 "Hint retry is clicked"
records from Zenodo 17551130, plus 59 `CHAT_QUERY` records from TutorTrace
deployment 8. The same SQL query returned the same four result rows (three
source/label strata and one total) for direct captures and payloads recovered
from both draft carrier bindings. SQLite reported version 3.53.1.

All 1,109 records retained unknown capture coverage and unreviewed mapping
status. No generated/displayed observation records were supplied to this
particular analysis; the query returns `NULL` for those unavailable stage
counts and for actual request totals, rates and learning effects. Seventeen
synthetic tests cover the loader/query behavior, including replay, scope
collisions, conflict rollback, schema/state validation and carrier recovery.
