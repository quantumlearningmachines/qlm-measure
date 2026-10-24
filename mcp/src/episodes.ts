/**
 * The preprint's counting rules, ported line by line from the published Python so they run inside
 * this server with no Python installed:
 *
 *   research/learnlog-episodes/cross_source.py        Zenodo 17551130 and IDETrace episode classes
 *   research/learnlog-episodes/assistments_episodes.py ASSISTments 2012-13 episode classes
 *   tools/qlm-transformer/.../analysis/aggregate.py    the request inventory (zenodo_requests,
 *                                                      tutortrace_requests: native counts only)
 *
 * The tests run the original scripts and this port on the same files and require identical output.
 * Where a script would stop with a Python exception, this port stops with a plain message instead.
 * Where cross_source.py would divide by zero, the percentage is null.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { PyCsv, compareCodePoints, findPy, loadsPyJson, parsePyJson, pyFloat, pyIntOfFloat, pyIsoTimestamp, pyRound, pyTypeName } from "./py.js";
import { zipEntries, zipRead } from "./zip.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const sha256 = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
const inc = (c: Record<string, number>, k: string | number, by = 1) => {
  c[k] = (c[k] ?? 0) + by;
};
const sortedCounts = (c: Map<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const k of [...c.keys()].sort(compareCodePoints)) out[k] = c.get(k)!;
  return out;
};
const pct = (num: number, den: number) => (den === 0 ? null : pyRound(num / den, 1));

const CLICKS = new Set(["Hint button is clicked", "Hint retry is clicked"]);
const SHOWN = new Set(["Code banner shown", "Text banner shown", "Show code hint is clicked", "Code hint is accepted"]);
const COPY_INFO = new Set(["EditorCopy", "$Copy", "EditorCut", "$Cut"]);
const PASTE_INFO = new Set(["EditorPaste", "$Paste"]);

/** Python's csv.DictReader access: a short row, or a column the header lacks, gives None (null). */
const cell = (row: string[], i: number): string | null => (i < 0 ? null : (row[i] ?? null));

// ── Zenodo 17551130 ──────────────────────────────────────────────────────

export interface ZenodoAnalysis {
  input_sha256: string;
  inventory: {
    native_input_count: number;
    native_assistance_log_count: number;
    native_log_label_counts: Record<string, number>;
    source_file_count: number;
    input_sha256: string;
    assistance_request_observations: number;
    help_request_subtypes: { label: string; count: number }[];
  };
  episodes: {
    requests: number;
    outcomes: Record<string, number>;
    shown: number;
    not_shown: number;
    asked_again_within_300s_of_shown: number;
    hint_learner_folders: number;
    raw_activity_ids: number;
    raw_ids_linked_to_hint_folders: number;
    raw_paste_actions: number;
    raw_ids_with_paste: number;
  };
  checks: {
    zenodo_reports_whose_first_log_row_is_a_click: number;
    zenodo_clicks_per_report: Record<string, number>;
    zenodo_reports_with_text_banner: number;
    zenodo_shown_rated_only: number;
    zenodo_asked_again_where_next_request_is_retry: number;
    zenodo_raw_pastes_without_copy_or_cut_in_prior_600s: number;
  };
}

interface Episode { who: string; t_req: number; t_shown: number | null; o: string; retry: boolean }

function eventsAt(text: string, at: number, member: string): Obj[] {
  const { value } = parsePyJson(text, at);
  if (!Array.isArray(value)) throw new Error(`eventsData in ${member} is not a JSON array`);
  for (const e of value) if (!isObj(e)) throw new Error(`an event in ${member} is not an object`);
  return value as Obj[];
}

export function analyzeZenodo(zip: Buffer): ZenodoAnalysis {
  const entries = zipEntries(zip);
  const members = entries.filter((e) => e.name.startsWith("hints_dataset/") && e.name.endsWith(".html")).sort((a, b) => compareCodePoints(a.name, b.name));
  const zeps: Episode[] = [];
  let firstIsClick = 0;
  let textBanner = 0;
  let ratedOnly = 0;
  const clicksPer: Record<string, number> = {};
  let nativeInputs = 0;
  const labelCounts = new Map<string, number>();
  const subtypes = new Map<string, number>();
  for (const entry of members) {
    const bytes = zipRead(zip, entry);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw new Error(`${entry.name} is not valid UTF-8, which aggregate.py's strict decoding refuses`);
    }
    // cross_source.py
    const at = findPy(text, "eventsData");
    if (at < 0) throw new Error(`${entry.name} has no eventsData assignment`);
    const ev = eventsAt(text, at, entry.name);
    const logs = ev.filter((e) => e.type === "Log");
    const d = logs.map((e) => {
      if (typeof e.description !== "string") throw new Error(`a Log event in ${entry.name} has no text description`);
      return e.description;
    });
    if (!logs.length) throw new Error(`${entry.name} has no Log rows, so cross_source.py cannot read its request time`);
    const S = new Set(d);
    const shownEvent = logs.find((e) => SHOWN.has(e.description as string));
    const shownT = shownEvent ? pyIsoTimestamp(String(shownEvent.timestamp).replaceAll("Z", "+00:00")) : null;
    if (CLICKS.has(d[0]!)) firstIsClick++;
    inc(clicksPer, d.filter((x) => CLICKS.has(x)).length);
    if (S.has("Text banner shown")) textBanner++;
    if (shownT !== null && !S.has("Code hint is accepted") && !S.has("Show code hint is clicked") && (S.has("Like") || S.has("Dislike"))) ratedOnly++;
    const o = S.has("Code hint is accepted") ? "shown_acted_accepted" : S.has("Show code hint is clicked") ? "shown_acted_revealed_not_accepted" : shownT !== null ? "shown_no_further_action_or_rating_only" : S.has("Error banner shown") ? "not_shown_error" : "not_shown_silent";
    zeps.push({ who: entry.name.split("/")[1]!, t_req: pyIsoTimestamp(String(logs[0]!.timestamp).replaceAll("Z", "+00:00")), t_shown: shownT, o, retry: d[0] === "Hint retry is clicked" });
    // aggregate.py zenodo_requests
    const constAt = findPy(text, "constEventsData");
    if (constAt < 0) throw new Error(`${entry.name} has no "const eventsData =" assignment, which aggregate.py's pattern requires`);
    const native = constAt === at ? ev : eventsAt(text, constAt, entry.name);
    for (const e of native) {
      nativeInputs++;
      if (e.type === "Log") {
        const label = e.description as string;
        labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
        if (CLICKS.has(label)) subtypes.set(label, (subtypes.get(label) ?? 0) + 1);
      }
    }
  }
  const by = new Map<string, Episode[]>();
  for (const e of zeps) by.set(e.who, [...(by.get(e.who) ?? []), e]);
  let again = 0;
  let againRetry = 0;
  for (const list of by.values()) {
    list.sort((a, b) => a.t_req - b.t_req);
    for (let k = 0; k + 1 < list.length; k++) {
      const [a, b] = [list[k]!, list[k + 1]!];
      if (a.t_shown !== null && b.t_req - a.t_shown >= 0 && b.t_req - a.t_shown <= 300) {
        again++;
        if (b.retry) againRetry++;
      }
    }
  }
  const outcomes: Record<string, number> = {};
  for (const e of zeps) inc(outcomes, e.o);
  const shown = zeps.filter((e) => e.t_shown !== null).length;

  // raw activity file: copies and pastes compared by timestamp (the v0.6 rule)
  const activity = entries.find((e) => e.name === "raw_dataset/activitydata.csv");
  if (!activity) throw new Error("the archive has no raw_dataset/activitydata.csv, which cross_source.py reads");
  const csvText = new TextDecoder("utf-8", { ignoreBOM: true }).decode(zipRead(zip, activity)).replace(/\r\n?/g, "\n");
  const parser = new PyCsv();
  const table = [...parser.push(csvText), ...parser.end()];
  const rawIds = new Set<string | null>();
  const pasteIds = new Set<string | null>();
  const copies = new Map<string | null, number[]>();
  const pastes: [string | null, number][] = [];
  let rawPastes = 0;
  const [header = [], ...data] = table;
  const [ridCol, typeCol, infoCol, dateCol] = ["research_id", "type", "info", "date"].map((n) => header.indexOf(n)) as [number, number, number, number];
  for (const row of data) {
    const rid = cell(row, ridCol);
    rawIds.add(rid);
    const info = cell(row, infoCol);
    const action = cell(row, typeCol) === "Action" && info !== null;
    const isCopy = action && COPY_INFO.has(info);
    const isPaste = action && PASTE_INFO.has(info);
    if (!isCopy && !isPaste) continue;
    if (dateCol < 0) throw new Error("raw_dataset/activitydata.csv has no date column");
    const t = pyIsoTimestamp(cell(row, dateCol) ?? "");
    if (isCopy) copies.set(rid, [...(copies.get(rid) ?? []), t]);
    else {
      rawPastes++;
      pasteIds.add(rid);
      pastes.push([rid, t]);
    }
  }
  let pastesNoCopy = 0;
  for (const [rid, t] of pastes) if (!(copies.get(rid) ?? []).some((c) => t - c >= 0 && t - c <= 600)) pastesNoCopy++;
  const hintIds = new Set(by.keys());
  const input = sha256(zip);
  const subtypeList = [...subtypes.keys()].sort(compareCodePoints).map((label) => ({ label, count: subtypes.get(label)! }));
  return {
    input_sha256: input,
    inventory: {
      native_input_count: nativeInputs,
      native_assistance_log_count: [...labelCounts.values()].reduce((a, b) => a + b, 0),
      native_log_label_counts: sortedCounts(labelCounts),
      source_file_count: members.length,
      input_sha256: input,
      assistance_request_observations: subtypeList.reduce((a, s) => a + s.count, 0),
      help_request_subtypes: subtypeList,
    },
    episodes: {
      requests: zeps.length,
      outcomes,
      shown,
      not_shown: zeps.length - shown,
      asked_again_within_300s_of_shown: again,
      hint_learner_folders: hintIds.size,
      raw_activity_ids: rawIds.size,
      raw_ids_linked_to_hint_folders: [...hintIds].filter((h) => rawIds.has(h)).length,
      raw_paste_actions: rawPastes,
      raw_ids_with_paste: pasteIds.size,
    },
    checks: {
      zenodo_reports_whose_first_log_row_is_a_click: firstIsClick,
      zenodo_clicks_per_report: clicksPer,
      zenodo_reports_with_text_banner: textBanner,
      zenodo_shown_rated_only: ratedOnly,
      zenodo_asked_again_where_next_request_is_retry: againRetry,
      zenodo_raw_pastes_without_copy_or_cut_in_prior_600s: pastesNoCopy,
    },
  };
}

// ── IDETrace deployment 8 ────────────────────────────────────────────────

export interface IdetraceAnalysis {
  input_sha256: string;
  inventory: { native_input_count: number; source_file_count: 1; native_event_label_counts: Record<string, number>; input_sha256: string; assistance_request_observations: number };
  episodes: {
    records: number;
    records_asked: number;
    records_never_asked: number;
    never_asked_and_passed_all_tests: number;
    requests: number;
    outcomes: Record<string, number>;
    shown: number;
    not_shown: number;
    asked_again_within_300s_of_shown: number;
    code_pastes: number;
    code_pastes_without_in_tool_copy_600s: number;
    chat_pastes: number;
  };
  checks: { idetrace_passrate_types: Record<string, number> };
}

const EDIT = new Set(["CODE_TYPE", "CODE_PASTE", "CODE_DELETE", "CODE_DELETE_SELECTION", "CODE_INDENT", "CODE_UNDO"]);
const IN_TOOL_COPY = new Set(["CODE_COPY", "TERMINAL_COPY", "TASK_COPY"]);

export function analyzeIdetrace(text: string): IdetraceAnalysis {
  const d = loadsPyJson(text);
  if (!isObj(d)) throw new Error("the IDETrace deployment file must be a JSON object of records");
  const records: [string, Obj[]][] = [];
  for (const [key, body] of Object.entries(d)) {
    const events = isObj(body) ? body.events : undefined;
    if (!Array.isArray(events)) throw new Error(`record ${key} has no events array`);
    for (const e of events) {
      if (!isObj(e)) throw new Error(`an event in record ${key} is not an object`);
      if (typeof e.type !== "string") throw new Error(`an event in record ${key} has no text type`);
      if (typeof e.timestamp !== "number") throw new Error(`an event in record ${key} has no numeric timestamp`);
      if (e.type === "TEST_CASE_RESULT" && !isObj(e.payload)) throw new Error(`a TEST_CASE_RESULT event in record ${key} has no payload object`);
    }
    records.push([key, events as Obj[]]);
  }
  const ts = (e: Obj) => e.timestamp as number;
  const ic: Record<string, number> = {};
  let again = 0, asked = 0, never = 0, neverPass = 0, cpaste = 0, cpasteNoCopy = 0, chatpaste = 0;
  const passTypes: Record<string, number> = {};
  const labelCounts = new Map<string, number>();
  let total = 0;
  let queries = 0;
  for (const [, events] of records) {
    // aggregate.py tutortrace_requests: native order, every event counted by type
    for (const e of events) {
      total++;
      labelCounts.set(e.type as string, (labelCounts.get(e.type as string) ?? 0) + 1);
      if (e.type === "CHAT_QUERY") queries++;
      if (e.type === "TEST_CASE_RESULT") inc(passTypes, pyTypeName(e.payload as Obj, "passrate"));
    }
    // cross_source.py
    const ev = [...events].sort((a, b) => ts(a) - ts(b));
    const Q = ev.flatMap((e, i) => (e.type === "CHAT_QUERY" ? [i] : []));
    if (Q.length) asked++;
    else {
      never++;
      if (ev.some((e) => e.type === "TEST_CASE_RESULT" && (e.payload as Obj).passrate === 100)) neverPass++;
    }
    for (let k = 0; k < Q.length; k++) {
      const qi = Q[k]!;
      const nxt = k + 1 < Q.length ? Q[k + 1]! : ev.length;
      let ri: number | null = null;
      for (let i = qi + 1; i < nxt; i++) if (ev[i]!.type === "CHAT_RESPONSE") { ri = i; break; }
      if (ri === null) {
        inc(ic, "not_shown");
        continue;
      }
      const t = ts(ev[ri]!);
      const edited = ev.slice(ri + 1).some((e) => EDIT.has(e.type as string) && ts(e) - t <= 120000);
      inc(ic, edited ? "shown_code_edit_within_120s" : "shown_no_code_edit_within_120s");
      if (k + 1 < Q.length) {
        const gap = ts(ev[Q[k + 1]!]!) - t;
        if (gap >= 0 && gap <= 300000) again++;
      }
    }
    ev.forEach((e, i) => {
      if (e.type === "CODE_PASTE") {
        cpaste++;
        if (!ev.slice(0, i).some((c) => IN_TOOL_COPY.has(c.type as string) && ts(e) - ts(c) <= 600000)) cpasteNoCopy++;
      }
      if (e.type === "CHAT_PASTE") chatpaste++;
    });
  }
  const requests = Object.values(ic).reduce((a, b) => a + b, 0);
  const notShown = ic.not_shown ?? 0;
  const outcomes = { ...ic };
  const input = sha256(text);
  return {
    input_sha256: input,
    inventory: { native_input_count: total, source_file_count: 1, native_event_label_counts: sortedCounts(labelCounts), input_sha256: input, assistance_request_observations: queries },
    episodes: {
      records: records.length,
      records_asked: asked,
      records_never_asked: never,
      never_asked_and_passed_all_tests: neverPass,
      requests,
      outcomes,
      shown: requests - notShown,
      not_shown: notShown,
      asked_again_within_300s_of_shown: again,
      code_pastes: cpaste,
      code_pastes_without_in_tool_copy_600s: cpasteNoCopy,
      chat_pastes: chatpaste,
    },
    checks: { idetrace_passrate_types: passTypes },
  };
}

/** cross_source.py's output object, for whichever of the two sources were given; pooled needs both. */
export function crossSourceEpisodes(z: ZenodoAnalysis | undefined, i: IdetraceAnalysis | undefined): Obj {
  const inputs: Obj = {};
  const out: Obj = { inputs };
  const checks: Obj = {};
  if (z) {
    inputs.zenodo_sha256 = z.input_sha256;
    out.zenodo = z.episodes;
    Object.assign(checks, z.checks);
  }
  if (i) {
    inputs.idetrace_sha256 = i.input_sha256;
    out.idetrace = i.episodes;
    Object.assign(checks, i.checks);
  }
  if (z && i) {
    const zr = z.episodes.requests, zs = z.episodes.shown, ir = i.episodes.requests, is = i.episodes.shown;
    out.pooled = {
      naive_requests: zr + ir,
      shown: zs + is,
      overstatement_pct: zs + is === 0 ? null : pyRound(100 * ((zr + ir) / (zs + is) - 1), 1),
      pooled_not_shown_pct: pct(100 * (zr - zs + i.episodes.not_shown), zr + ir),
      zenodo_not_shown_pct: pct(100 * (zr - zs), zr),
      zenodo_asked_again_pct: pct(100 * z.episodes.asked_again_within_300s_of_shown, zs),
      idetrace_asked_again_pct: pct(100 * i.episodes.asked_again_within_300s_of_shown, is),
    };
  }
  out.checks = checks;
  return out;
}

// ── ASSISTments 2012-13 School Data with Affect ──────────────────────────

const STATES = ["FRUSTRATED", "CONFUSED", "CONCENTRATING", "BORED"] as const;
const REQUIRED = ["user_id", "assignment_id", "assistment_id", "original", "hint_count", "bottom_hint", "first_action", "correct"];

/** Streams the CSV through Python's csv rules, calling `each` for every data row. Returns the input's SHA-256. */
async function streamCsv(path: string, each: (row: string[], header: string[]) => void): Promise<string> {
  const hash = createHash("sha256");
  const decoder = new TextDecoder("utf-8", { ignoreBOM: true });
  const parser = new PyCsv();
  const seen: { header: string[] | null } = { header: null };
  const take = (rows: string[][]) => {
    for (const row of rows) {
      if (!seen.header) {
        seen.header = row;
        const missing = REQUIRED.filter((c) => !row.includes(c));
        if (missing.length) throw new Error(`the ASSISTments file is missing the columns: ${missing.join(", ")}`);
      } else each(row, seen.header);
    }
  };
  for await (const chunk of createReadStream(path, { highWaterMark: 1 << 22 })) {
    hash.update(chunk as Buffer);
    take(parser.push(decoder.decode(chunk as Buffer, { stream: true })));
  }
  take(parser.push(decoder.decode()));
  take(parser.end());
  if (!seen.header) throw new Error("the ASSISTments file has no header row");
  return hash.digest("hex");
}

export async function analyzeAssistments(path: string): Promise<Obj> {
  const idx = (header: string[]) => {
    const at = (name: string) => header.indexOf(name);
    return { user: at("user_id"), assignment: at("assignment_id"), assistment: at("assistment_id"), original: at("original"), hint: at("hint_count"), bottom: at("bottom_hint"), first: at("first_action"), correct: at("correct"), affect: STATES.map((s) => at(`Average_confidence(${s})`)) };
  };
  const key = (row: string[], c: ReturnType<typeof idx>) => JSON.stringify([cell(row, c.user), cell(row, c.assignment), cell(row, c.assistment)]);

  // pass 1: rows, affect completeness, and the scaffolding logs of each main problem
  let rows = 0, rowsAff = 0;
  const scaff = new Map<string, number>();
  const scaffHint = new Map<string, number>();
  let cols: ReturnType<typeof idx> | null = null;
  const inputSha = await streamCsv(path, (row, header) => {
    const c = (cols ??= idx(header));
    rows++;
    if (c.affect.every((i) => cell(row, i))) rowsAff++;
    if (cell(row, c.original) !== "0") return;
    const k = key(row, c);
    scaff.set(k, (scaff.get(k) ?? 0) + 1);
    if (pyFloat(cell(row, c.hint) || "0") > 0) scaffHint.set(k, (scaffHint.get(k) ?? 0) + 1);
  });

  // pass 2: the main problems, in file order
  const out: Record<string, number> = {};
  const topBy: Record<string, Record<string, number>> = {};
  const users = new Set<string | null>(), usersReq = new Set<string | null>(), usersReqInclScaff = new Set<string | null>();
  let mains = 0, sysStepsWithScaffHint = 0, both = 0;
  await streamCsv(path, (row) => {
    const c = cols!;
    if (cell(row, c.original) === "0") return;
    mains++;
    const k = key(row, c);
    const a = c.affect.map((i) => cell(row, i));
    let top: string | null = null;
    if (a.every((v) => v)) {
      const f = a.map((v) => pyFloat(v!));
      let best = 0;
      for (let j = 1; j < 4; j++) if (f[j]! > f[best]!) best = j;
      top = STATES[best]!.toLowerCase();
    }
    const hc = pyIntOfFloat(cell(row, c.hint) || "0");
    const bh = cell(row, c.bottom), fa = cell(row, c.first), corr = cell(row, c.correct);
    const u = cell(row, c.user);
    users.add(u);
    const s = (scaff.get(k) ?? 0) > 0;
    const askedHint = hc > 0, askedSteps = fa === "2", req = askedHint || askedSteps;
    if (req) usersReq.add(u);
    if (req || (scaffHint.get(k) ?? 0) > 0) usersReqInclScaff.add(u);
    if (askedHint && askedSteps) both++;
    let cls: string;
    if (askedHint && bh === "1") cls = "requested; hints to the answer (bottom-out)";
    else if (askedHint) cls = "requested; hints short of the answer";
    else if (askedSteps) cls = "requested; asked for steps (scaffolding)";
    else if (s && fa === "0" && (corr === "0" || corr === "0.0")) {
      cls = "not requested; system gave steps after a wrong first answer";
      if ((scaffHint.get(k) ?? 0) > 0) sysStepsWithScaffHint++;
    } else if (s) cls = "not requested; scaffolding present, trigger unclear";
    else cls = "not requested; no help recorded";
    inc(out, cls);
    if (top) inc((topBy[req ? "requested" : "not requested"] ??= {}), top);
  });
  return {
    input_sha256: inputSha,
    main_problem_opportunities: mains,
    scaffolding_logs: [...scaff.values()].reduce((x, y) => x + y, 0),
    students: users.size,
    students_who_ever_requested: usersReq.size,
    episodes: out,
    inferred_top_state_by_request: topBy,
    checks: {
      rows,
      rows_with_all_four_affect_values: rowsAff,
      scaffolding_logs_with_hints: [...scaffHint.values()].reduce((x, y) => x + y, 0),
      main_problems_with_both_hint_and_first_action_steps: both,
      system_steps_problems_with_a_hint_inside_scaffolding: sysStepsWithScaffHint,
      students_who_ever_requested_including_hints_inside_scaffolding: usersReqInclScaff.size,
    },
  };
}

/**
 * Help requests on main problems, counted by the problem's own skill label (the file's `skill` column).
 * Counts only: no row, learner or answer leaves the file. The 15 most requested skills are kept.
 */
export async function assistmentsBySkill(path: string): Promise<{ skills: Obj[]; skills_in_file: number; note: string }> {
  const by = new Map<string, { skill: string; main_problems: number; requested: number; hints_to_the_answer: number; asked_for_steps: number }>();
  let col: { skill: number; original: number; hint: number; bottom: number; first: number } | null = null;
  await streamCsv(path, (row, header) => {
    col ??= { skill: header.indexOf("skill"), original: header.indexOf("original"), hint: header.indexOf("hint_count"), bottom: header.indexOf("bottom_hint"), first: header.indexOf("first_action") };
    if (col.skill < 0 || cell(row, col.original) === "0") return;
    const name = cell(row, col.skill) || "(no skill label)";
    const s = by.get(name) ?? { skill: name, main_problems: 0, requested: 0, hints_to_the_answer: 0, asked_for_steps: 0 };
    const hints = pyIntOfFloat(cell(row, col.hint) || "0") > 0, steps = cell(row, col.first) === "2";
    s.main_problems++;
    if (hints || steps) s.requested++;
    if (hints && cell(row, col.bottom) === "1") s.hints_to_the_answer++;
    if (steps) s.asked_for_steps++;
    by.set(name, s);
  });
  if (col!.skill < 0) return { skills: [], skills_in_file: 0, note: "The file has no skill column, so requests can't be split by skill." };
  const unlabeled = (x: { skill: string }) => (x.skill === "(no skill label)" ? 1 : 0);
  const all = [...by.values()].sort((a, b) => unlabeled(a) - unlabeled(b) || b.requested - a.requested || b.main_problems - a.main_problems || a.skill.localeCompare(b.skill));
  return { skills: all.slice(0, 15), skills_in_file: all.length, note: "Counts only, on main problems. A skill is the problem's own label in the file; asking for help on it isn't evidence of a misconception." };
}
