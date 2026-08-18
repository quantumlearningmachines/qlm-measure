# Recorder quickstart — produce `record.json` from your own tool

Tested against `qlm-measure` 0.2.8 (PyPI and npm). QLM is not in the loop at any step. Everything below ran as written.

## Where it goes

Your app already has one place where it logs a student response: the tutor's answer handler, the LMS grade hook, the assessment engine's submit path. That is the event writer. The Recorder sits inside it. Each response becomes one appended, hashed entry; a learner's entries form one chain; `export()` gives you `record.json`.

## Python

```python
import json, hashlib, hmac, os
from qlm_measure.recorder import Recorder

SALT = os.environ["PSEUDONYM_SALT"]            # your secret; never stored in a record
def pseudonym(student_id):                       # HMAC, not a raw ID, not a plain hash
    return "L-" + hmac.new(SALT.encode(), student_id.encode(), hashlib.sha256).hexdigest()[:16]

recorders = {}                                   # one chain per learner; persist these (see below)

def on_student_response(student_id, session_id, item_id, skill, correct, ms, ts_iso, hint_used):
    sid = pseudonym(student_id)
    rec = recorders.setdefault(sid, Recorder(sid))
    rec.append({                                 # the ObservationEvent: this is all you record
        "studentId": sid,
        "sessionId": session_id,
        "source": "your-app-name",
        "timestamp": ts_iso,                     # RFC 3339, UTC, monotonic within the chain
        "correct": correct,
        "responseTimeMs": ms,
        "domain": "math",
        "skillId": skill,
        "scaffoldType": "hint" if hint_used else "none",
        "ext": {"itemId": item_id},
    })
    return rec

def export_record(sid, path):                    # end of session, on request, or for an audit
    json.dump(recorders[sid].export(), open(path, "w"), indent=2)
```

Then, from wherever you already handle responses:

```python
on_student_response("real-student-42", "sess-2026-08-18-001", "FR-EQ-01", "fractions.equivalence", False, 9200, "2026-08-18T14:00:00Z", False)
on_student_response("real-student-42", "sess-2026-08-18-001", "FR-EQ-02", "fractions.equivalence", True,  6100, "2026-08-18T14:00:41Z", True)
export_record("L-…", "record.json")
```

```
$ qlm-measure verify record.json
record L-f02144cc46a44610  (schema 0.3, 3 entries)
  …
  VERDICT: CLEAN — record is verifiable
```

## JavaScript / TypeScript

```js
import { Recorder } from "qlm-measure";
const rec = new Recorder(pseudonym(studentId));
rec.append({ studentId: sid, sessionId, source: "your-app-name", timestamp, correct, responseTimeMs, domain: "math", skillId, scaffoldType: hintUsed ? "hint" : "none", ext: { itemId } });
fs.writeFileSync("record.json", JSON.stringify(rec.export()));
```

`npx qlm-measure verify record.json` gives the same result. Records written by the JS Recorder verify with the Python CLI and the reverse.

## What the event must contain

Required: `studentId` (pseudonymous), `sessionId`, `source`, `timestamp`, `correct` (boolean), `domain`. Optional and useful: `responseTimeMs`, `skillId`, `scaffoldType` (`none`, `hint`, `explain`, `probing`, …), `score`, `isTransferProblem`, `ext` for anything of yours (item ids, your own fields). The Recorder validates the event and refuses invalid ones with the schema path.

Never put in an event: names, emails, raw account IDs, free-text answers. `studentId` is a salted HMAC of your ID; you keep the salt and the mapping, the record carries neither.

## Persist and resume

A Recorder is in-memory. Keep the chain state by keeping the exported record: `Recorder.from_record(json.load(open("record.json")))` continues the chain tomorrow with the next version number and the right `prevHash`. One recorder per learner; export whenever you like; a record is just JSON.

## Withdrawal

If a learner withdraws, `rec.redact(version)` replaces that entry's event with `{ "redacted": true, "eventHash": … }`. The chain still verifies, because entries hash a commitment to the event, not the event itself. Verified above: after redacting entry 2, `Event matches its hash` still passes and the verdict is CLEAN.

## What you get and don't get

A Level 1 record: what happened, when, in what order, provably unaltered since it was written. No estimates. If you want estimates on top of your evidence, `EstimateChain` lets you declare your own estimator, and if you publish its rule, the public verifier can reproduce it. If you don't, it shows as opaque. Same treatment QLM's estimator gets.

`rec.chain_head()` returns the last entry hash. Publishing it somewhere dated (a tweet, a commit, a mail to yourself) is optional and lets anyone later prove the chain existed by that time. No ledger, nothing hosted.

## Notes for the current release

- `evidence.provenance` is null in 0.2.8 exports; it becomes required (`live` for Recorder output) with the Item 5 amendment.
- Consent and attestation checks print as pass on records without consent or attestation data; they will report `not_applicable` after Item 3c.
