"""ASSISTments 2012-13 School Data with Affect: assistance episodes under the Learnlog stage rules. Counts only; nothing identifying is output.
Opportunity = one main-problem log (original == 1). Its scaffolding = original == 0 logs with the same user_id, assignment_id and assistment_id.
Help requested = hint_count > 0 on the main problem, or first_action == 2 (student asked for the problem to be broken into steps).
Answer revealed = bottom_hint == 1. Scaffolding after a wrong first attempt = scaffolding present and first_action == 0 and correct == 0
(system-triggered under the dataset's documentation). Display is not logged separately in this release (requesting a hint shows it).
Inferred states = the four detector confidences, reported as inferences: share of opportunities whose highest predicted state is each one,
split by whether help was requested. Usage: assistments_episodes.py <csv>  -> assistments_episodes.json beside the script."""
import csv, sys, json, hashlib
from collections import Counter, defaultdict
f = sys.argv[1]
h = hashlib.sha256()
with open(f, "rb") as fb:
    for chunk in iter(lambda: fb.read(1 << 22), b""): h.update(chunk)
scaff = Counter(); scaff_hint = Counter(); mains = []; rows = 0; rows_aff = 0
STATES = ("FRUSTRATED", "CONFUSED", "CONCENTRATING", "BORED")
with open(f, newline="", encoding="utf-8", errors="replace") as fh:
    for row in csv.DictReader(fh):
        rows += 1; rows_aff += all(row.get(f"Average_confidence({s})", "") for s in STATES)
        k = (row["user_id"], row["assignment_id"], row["assistment_id"])
        if row["original"] == "0":
            scaff[k] += 1; scaff_hint[k] += float(row["hint_count"] or 0) > 0; continue
        a = [row.get(f"Average_confidence({s})", "") for s in STATES]
        top = STATES[max(range(4), key=lambda i: float(a[i] or -1))].lower() if all(a) else None
        mains.append((k, int(float(row["hint_count"] or 0)), row["bottom_hint"], row["first_action"], row["correct"], top, row["user_id"]))
out = Counter(); top_by = defaultdict(Counter); users = set(); users_req = set(); users_req_incl_scaff = set(); sys_steps_with_scaff_hint = 0; both_hint_and_steps = 0
for k, hc, bh, fa, corr, top, u in mains:
    users.add(u); s = scaff.get(k, 0) > 0
    asked_hint = hc > 0; asked_steps = fa == "2"; req = asked_hint or asked_steps
    if req: users_req.add(u)
    if req or scaff_hint.get(k, 0) > 0: users_req_incl_scaff.add(u)
    both_hint_and_steps += asked_hint and asked_steps
    if asked_hint and bh == "1": c = "requested; hints to the answer (bottom-out)"
    elif asked_hint: c = "requested; hints short of the answer"
    elif asked_steps: c = "requested; asked for steps (scaffolding)"
    elif s and fa == "0" and corr in ("0", "0.0"):
        c = "not requested; system gave steps after a wrong first answer"; sys_steps_with_scaff_hint += scaff_hint.get(k, 0) > 0
    elif s: c = "not requested; scaffolding present, trigger unclear"
    else: c = "not requested; no help recorded"
    out[c] += 1
    if top: top_by["requested" if req else "not requested"][top] += 1
res = {"input_sha256": h.hexdigest(), "main_problem_opportunities": len(mains), "scaffolding_logs": sum(scaff.values()),
       "students": len(users), "students_who_ever_requested": len(users_req), "episodes": dict(out),
       "inferred_top_state_by_request": {k: dict(v) for k, v in top_by.items()},
       "checks": {"rows": rows, "rows_with_all_four_affect_values": rows_aff, "scaffolding_logs_with_hints": sum(scaff_hint.values()),
                  "main_problems_with_both_hint_and_first_action_steps": both_hint_and_steps,
                  "system_steps_problems_with_a_hint_inside_scaffolding": sys_steps_with_scaff_hint,
                  "students_who_ever_requested_including_hints_inside_scaffolding": len(users_req_incl_scaff)}}
json.dump(res, open(__file__.replace("assistments_episodes.py", "assistments_episodes.json"), "w"), indent=1)
print(json.dumps(res, indent=1))
