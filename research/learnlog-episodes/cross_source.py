"""Cross-source assistance episodes for the Learnlog preprint v0.3 (labels and timestamps only; nothing identifying is output).
Episode = one help request (Zenodo: a scenario report starting with Get Hint or Retry; IDETrace: one CHAT_QUERY).
Shown = Zenodo: the first 'Code banner shown', 'Text banner shown', 'Show code hint is clicked' or 'Code hint is accepted' Log row; IDETrace: a CHAT_RESPONSE before the next query.
Asked again = the same learner record's next request within 300 s of the moment help was shown (denominator: all shown episodes).
Output: cross_source_episodes.json beside this script."""
import json, re, sys, zipfile, hashlib
from collections import Counter, defaultdict
from datetime import datetime
ZIP, IDE = sys.argv[1], sys.argv[2]
def sha(p): return hashlib.sha256(open(p, "rb").read()).hexdigest()
def zts(s): return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
dec = json.JSONDecoder(); z = zipfile.ZipFile(ZIP)
zeps = []; first_is_click = 0; clicks_per = Counter(); text_banner = 0; rated_only = 0
for n in sorted(x for x in z.namelist() if x.startswith("hints_dataset/") and x.endswith(".html")):
    h = z.read(n).decode("utf-8", "replace"); m = re.search(r"eventsData\s*=\s*", h); ev, _ = dec.raw_decode(h, m.end())
    logs = [e for e in ev if e.get("type") == "Log"]; d = [e["description"] for e in logs]; S = set(d)
    shown_t = next((zts(e["timestamp"]) for e in logs if e["description"] in ("Code banner shown", "Text banner shown", "Show code hint is clicked", "Code hint is accepted")), None)
    first_is_click += bool(d) and d[0] in ("Hint button is clicked", "Hint retry is clicked")
    clicks_per[sum(x in ("Hint button is clicked", "Hint retry is clicked") for x in d)] += 1
    text_banner += "Text banner shown" in S
    rated_only += (shown_t is not None and not (S & {"Code hint is accepted", "Show code hint is clicked"}) and bool(S & {"Like", "Dislike"}))
    if "Code hint is accepted" in S: o = "shown_acted_accepted"
    elif "Show code hint is clicked" in S: o = "shown_acted_revealed_not_accepted"
    elif shown_t is not None: o = "shown_no_further_action_or_rating_only"
    elif "Error banner shown" in S: o = "not_shown_error"
    else: o = "not_shown_silent"
    zeps.append({"who": n.split("/")[1], "t_req": zts(logs[0]["timestamp"]), "t_shown": shown_t, "o": o, "retry": d[0] == "Hint retry is clicked"})
by = defaultdict(list)
for e in zeps: by[e["who"]].append(e)
z_again = 0; z_again_retry = 0
for L in by.values():
    L.sort(key=lambda e: e["t_req"])
    for a, b in zip(L, L[1:]):
        if a["t_shown"] is not None and 0 <= b["t_req"] - a["t_shown"] <= 300:
            z_again += 1; z_again_retry += b["retry"]
zc = Counter(e["o"] for e in zeps); z_shown = sum(1 for e in zeps if e["t_shown"] is not None)
d = json.load(open(IDE)); EDIT = {"CODE_TYPE", "CODE_PASTE", "CODE_DELETE", "CODE_DELETE_SELECTION", "CODE_INDENT", "CODE_UNDO"}
ic = Counter(); i_again = 0; recs = len(d); asked = 0; never = 0; never_pass = 0; cpaste = 0; cpaste_nocopy = 0; chatpaste = 0
for r in d.values():
    ev = sorted(r["events"], key=lambda e: e["timestamp"]); Q = [i for i, e in enumerate(ev) if e["type"] == "CHAT_QUERY"]
    if Q: asked += 1
    else:
        never += 1; never_pass += any(e["type"] == "TEST_CASE_RESULT" and e["payload"].get("passrate") == 100 for e in ev)
    for k, qi in enumerate(Q):
        nxt = Q[k + 1] if k + 1 < len(Q) else len(ev)
        ri = next((i for i in range(qi + 1, nxt) if ev[i]["type"] == "CHAT_RESPONSE"), None)
        if ri is None: ic["not_shown"] += 1; continue
        t = ev[ri]["timestamp"]
        ic["shown_code_edit_within_120s" if any(ev[i]["type"] in EDIT and ev[i]["timestamp"] - t <= 120000 for i in range(ri + 1, len(ev))) else "shown_no_code_edit_within_120s"] += 1
        if k + 1 < len(Q) and 0 <= ev[Q[k + 1]]["timestamp"] - t <= 300000: i_again += 1
    for i, e in enumerate(ev):
        if e["type"] == "CODE_PASTE":
            cpaste += 1; cpaste_nocopy += not any(ev[j]["type"] in ("CODE_COPY", "TERMINAL_COPY", "TASK_COPY") and e["timestamp"] - ev[j]["timestamp"] <= 600000 for j in range(i))
        chatpaste += e["type"] == "CHAT_PASTE"
i_req = sum(ic.values()); i_shown = i_req - ic["not_shown"]
rawp = 0; rawids = set(); pasteids = set(); rawp_nocopy = 0; lastcopy = {}; pr_types = Counter()
import csv, io
for row in csv.DictReader(io.TextIOWrapper(z.open("raw_dataset/activitydata.csv"), encoding="utf-8", errors="replace")):
    rawids.add(row["research_id"])
    if row["type"] == "Action" and row["info"] in ("EditorCopy", "$Copy", "EditorCut", "$Cut"):
        lastcopy[row["research_id"]] = row["date"]
    if row["type"] == "Action" and row["info"] in ("EditorPaste", "$Paste"):
        rawp += 1; pasteids.add(row["research_id"]); c = lastcopy.get(row["research_id"])
        try: gap = datetime.fromisoformat(row["date"]).timestamp() - datetime.fromisoformat(c).timestamp() if c else None
        except Exception: gap = None
        rawp_nocopy += (gap is None or gap > 600)
hint_ids = set(by)
pr_types = Counter(type(e["payload"].get("passrate")).__name__ for r in d.values() for e in r["events"] if e["type"] == "TEST_CASE_RESULT")
out = {"inputs": {"zenodo_sha256": sha(ZIP), "idetrace_sha256": sha(IDE)},
 "zenodo": {"requests": len(zeps), "outcomes": dict(zc), "shown": z_shown, "not_shown": len(zeps) - z_shown,
            "asked_again_within_300s_of_shown": z_again, "hint_learner_folders": len(hint_ids),
            "raw_activity_ids": len(rawids), "raw_ids_linked_to_hint_folders": len(hint_ids & rawids), "raw_paste_actions": rawp, "raw_ids_with_paste": len(pasteids)},
 "idetrace": {"records": recs, "records_asked": asked, "records_never_asked": never, "never_asked_and_passed_all_tests": never_pass,
              "requests": i_req, "outcomes": dict(ic), "shown": i_shown, "not_shown": ic["not_shown"], "asked_again_within_300s_of_shown": i_again,
              "code_pastes": cpaste, "code_pastes_without_in_tool_copy_600s": cpaste_nocopy, "chat_pastes": chatpaste},
}
out["pooled"] = {"naive_requests": len(zeps) + i_req, "shown": z_shown + i_shown,
                 "overstatement_pct": round(100 * ((len(zeps) + i_req) / (z_shown + i_shown) - 1), 1),
                 "pooled_not_shown_pct": round(100 * ((len(zeps) - z_shown) + ic["not_shown"]) / (len(zeps) + i_req), 1),
                 "zenodo_not_shown_pct": round(100 * (len(zeps) - z_shown) / len(zeps), 1),
                 "zenodo_asked_again_pct": round(100 * z_again / z_shown, 1), "idetrace_asked_again_pct": round(100 * i_again / i_shown, 1)}
out["checks"] = {"zenodo_reports_whose_first_log_row_is_a_click": first_is_click, "zenodo_clicks_per_report": dict(clicks_per), "zenodo_reports_with_text_banner": text_banner,
  "zenodo_shown_rated_only": rated_only, "zenodo_asked_again_where_next_request_is_retry": z_again_retry, "zenodo_raw_pastes_without_copy_or_cut_in_prior_600s": rawp_nocopy,
  "idetrace_passrate_types": dict(pr_types)}
json.dump(out, open(__file__.replace("cross_source.py", "cross_source_episodes.json"), "w"), indent=1)
print(json.dumps(out, indent=1))
