/**
 * SYNTHETIC fixtures shaped like the three released datasets the preprint uses. Every value here is
 * invented for tests; none comes from a real learner. They exercise each rule of the episode scripts
 * and the inventory adapters, so the TypeScript port and the original Python can be run on the same
 * bytes and compared.
 */
import { makeZip } from "./zip.js";

type Ev = Record<string, unknown>;
const log = (description: string, timestamp: string): Ev => ({ type: "Log", description, timestamp, details: "synthetic" });
const other = (type: string, timestamp: string): Ev => ({ type, timestamp, description: "synthetic" });

const T = (s: number) => new Date(Date.UTC(2025, 1, 14, 19, 0, 0) + s * 1000).toISOString().slice(0, 23) + "000+00:00";
const T1 = (s: number) => {
  // the same instant written with a +01:00 offset, as the Zenodo reports write it
  const d = new Date(Date.UTC(2025, 1, 14, 20, 0, 0) + s * 1000);
  return d.toISOString().slice(0, 23) + "000+01:00";
};

function report(events: Ev[], form: "const" | "let" = "const"): string {
  const decl = form === "const" ? "const eventsData = " : "let eventsData=\n";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Scenario</title></head><body><script>\n${decl}${JSON.stringify(events)};\nrender(eventsData);</script></body></html>`;
}

export function zenodoReports(): { name: string; html: string }[] {
  return [
    // learner L1: accepted; then a retry 95 s after the first display (asked again); then a text banner rated only
    { name: "hints_dataset/L1/1.html", html: report([log("Hint button is clicked", T1(0)), other("Activity", T1(1)), log("Code hint requested", T1(1)), log("Code hint generated", T1(3)), log("Code banner shown", T1(5)), log("Code hint is accepted", T1(9))]) },
    { name: "hints_dataset/L1/2.html", html: report([log("Hint retry is clicked", T1(100)), log("Show code hint is clicked", T1(110)), other("Tool Window", T1(111))]) },
    { name: "hints_dataset/L1/3.html", html: report([log("Hint button is clicked", T1(1000)), log("Text banner shown", T1(1002)), log("Like", T1(1010)), log("Text hint generated", T1(1001))]) },
    // learner L2: an error, a silent request, a report with two clicks, and one whose first Log row is not a click
    { name: "hints_dataset/L2/a.html", html: report([log("Hint button is clicked", T1(50)), log("Error banner shown", T1(52)), log("Error hint: An unexpected error occurred, please try again.", T1(52))]) },
    { name: "hints_dataset/L2/b.html", html: report([log("Hint button is clicked", T1(4000))]) },
    { name: "hints_dataset/L2/c.html", html: report([log("Hint button is clicked", T1(5000)), log("Dislike", T1(5001)), log("Hint button is clicked", T1(5002)), log("Code banner shown", T1(5003))]) },
    { name: "hints_dataset/L2/d.html", html: report([log("Code banner shown", T1(5100)), log("Hint button is clicked", T1(5101)), log("Hint banner is closed — é", T1(5102))]) },
    // learner L3: shown, then asked again 400 s later (outside 300 s), and a report with no Log rows except the click
    { name: "hints_dataset/L3/x.html", html: report([log("Hint button is clicked", T1(7000)), log("Code banner shown", T1(7001))]) },
    { name: "hints_dataset/L3/y.html", html: report([log("Hint retry is clicked", T1(7401)), log("Code banner shown", T1(7402))]) },
  ];
}

export function activityCsv(): string {
  const rows = [
    "id,research_id,date,type,info,selected_text,action_id",
    `1,L1,${T(0).replace("T", " ")},Action,EditorCopy,"a, b",x`,
    `2,L1,${T(100).replace("T", " ")},Action,EditorPaste,"line1\r\nline2",x`,
    `3,L1,${T(701).replace("T", " ")},Action,$Paste,,x`,
    `4,R9,${T(5).replace("T", " ")},Action,EditorPaste,,x`,
    `5,R9,${T(10).replace("T", " ")},MouseClicked,EditorPaste,,x`,
    `6,R9,${T(20).replace("T", " ")},Action,$Cut,,x`,
    `7,R9,${T(620).replace("T", " ")},Action,$Paste,,x`,
    `8,R9,${T(19).replace("T", " ")},Action,$Copy,,x`,
    `9,R8,${T(30).replace("T", " ").slice(0, 19)}+00:00,KeyPressed,,,x`,
    `10,R8,${T(40).replace("T", " ")},Action,EditorCut,,x`,
    `11,R8,${T(40).replace("T", " ")},Action,EditorPaste,,x`,
    `12,R7,${T(50).replace("T", " ")},Action,EditorPaste,,x`,
  ];
  return rows.join("\r\n") + "\r\n";
}

export function zenodoZip(extra: { name: string; data: string | Buffer }[] = []): Buffer {
  const reports = zenodoReports().reverse(); // stored out of order, so the reader has to sort
  return makeZip([
    { name: "README.md", data: "synthetic" },
    ...reports.map((r) => ({ name: r.name, data: r.html })),
    { name: "hints_dataset/L1/notes.txt", data: "not a report" },
    { name: "raw_dataset/", data: "", method: 0 as const },
    { name: "raw_dataset/activitydata.csv", data: activityCsv() },
    ...extra,
  ]);
}

const e = (type: string, timestamp: number, payload: Record<string, unknown> = {}) => ({ type, timestamp, payload });

/** Written as raw text so int and float literals (100 versus 50.0) are exactly controlled. */
export function idetraceJson(): string {
  const records: Record<string, unknown> = {
    "12467": {
      student_name: "Synthetic Student A",
      event_count: 0,
      events: [
        e("CHAT_RESPONSE", 2000),
        e("CHAT_QUERY", 1000),
        e("CODE_TYPE", 3000),
        e("CHAT_QUERY", 100000),
        e("CHAT_QUERY", 500000),
        e("CHAT_RESPONSE", 510000),
        e("CODE_COPY", 515000),
        e("CODE_PASTE", 520000),
        e("CODE_PASTE", 2000000),
        e("CHAT_PASTE", 2000001),
        e("TEST_CASE_RESULT", 2000002, { passrate: "__INT100__" }),
        e("TEST_CASE_RESULT", 2000003, { passrate: "__FLOAT50__" }),
      ],
    },
    "12472": { student_name: "Synthetic Student B", events: [e("CODE_TYPE", 1), e("TEST_CASE_RESULT", 2, { passrate: "__INT100__" })] },
    "12473": { student_name: "Synthetic Student C", events: [e("TEST_CASE_RESULT", 2, { passrate: "100" }), e("TEST_CASE_RESULT", 3, {})] },
    "9": { student_name: "Synthetic Student D", events: [e("CHAT_QUERY", 10), e("CHAT_TYPE", 11), e("CHAT_RESPONSE", 20), e("MOUSE_MOVE", 200000), e("CODE_DELETE", 200001)] },
    "13": { student_name: "Synthetic Student E", events: [e("CHAT_QUERY", 1), e("CHAT_RESPONSE", 2), e("CHAT_QUERY", 400000), e("CHAT_RESPONSE", 400001)] },
  };
  return JSON.stringify(records, null, 1).replaceAll('"__INT100__"', "100").replaceAll('"__FLOAT50__"', "50.0");
}

export const ASSISTMENTS_HEADER =
  '"problem_log_id","skill","problem_id","user_id","assignment_id","assistment_id","start_time","end_time","problem_type","original","correct","bottom_hint","hint_count","actions","attempt_count","ms_first_response","tutor_mode","sequence_id","student_class_id","position","type","base_sequence_id","skill_id","teacher_id","school_id","overlap_time","template_id","answer_id","answer_text","first_action","problemlogid","Average_confidence(FRUSTRATED)","Average_confidence(CONFUSED)","Average_confidence(CONCENTRATING)","Average_confidence(BORED)"';

/** One synthetic ASSISTments-shaped row. Only the columns the episode rules read carry meaning. */
export function assistmentsRow(r: { user: string; assignment: string; assistment: string; original: string; correct?: string; bottom?: string; hints?: string; first?: string; affect?: [string, string, string, string]; answer?: string }): string {
  const a = r.affect ?? ["0.1", "0.2", "0.6", "0.1"];
  const cols = ["1", "Synthetic skill", "10", r.user, r.assignment, r.assistment, "", "", "algebra", r.original, r.correct ?? "1", r.bottom ?? "0", r.hints ?? "0", "", "1", "100", "tutor", "5", "6", "1", "LinearSection", "5", "7", "8", "9", "0", "11", "12", r.answer ?? "", r.first ?? "0", "1", ...a];
  return cols.map((c) => (/[",\r\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c)).join(",");
}

export function assistmentsCsv(): string {
  const rows = [
    ASSISTMENTS_HEADER,
    // u1: hints to the bottom-out hint; hints short of the answer; asked for steps
    assistmentsRow({ user: "u1", assignment: "a1", assistment: "p1", original: "1", hints: "3", bottom: "1", correct: "0", affect: ["0.5", "0.2", "0.1", "0.2"] }),
    assistmentsRow({ user: "u1", assignment: "a1", assistment: "p2", original: "1", hints: "1.0", bottom: "0", affect: ["0.1", "0.2", "0.3", "0.4"] }),
    assistmentsRow({ user: "u1", assignment: "a1", assistment: "p3", original: "1", first: "2", hints: "", affect: ["0.1", "0.7", "0.1", "0.1"] }),
    // u2: system steps after a wrong first answer (scaffolding rows come before and after the main row)
    assistmentsRow({ user: "u2", assignment: "a1", assistment: "p4", original: "0", hints: "1", answer: 'he said "x, y"\nthen' }),
    assistmentsRow({ user: "u2", assignment: "a1", assistment: "p4", original: "1", first: "0", correct: "0.0" }),
    assistmentsRow({ user: "u2", assignment: "a1", assistment: "p4", original: "0", hints: "0" }),
    // u2: scaffolding present, trigger unclear (first answer right); and nothing recorded, with no affect values
    assistmentsRow({ user: "u2", assignment: "a1", assistment: "p5", original: "1", first: "0", correct: "1" }),
    assistmentsRow({ user: "u2", assignment: "a1", assistment: "p5", original: "0" }),
    assistmentsRow({ user: "u2", assignment: "a1", assistment: "p6", original: "1", affect: ["", "", "", ""] }),
    // u3: never asked on main problems but asked inside scaffolding; ties among detector values keep the first
    assistmentsRow({ user: "u3", assignment: "a2", assistment: "p7", original: "1", first: "0", correct: "0", affect: ["0.3", "0.3", "0.3", "0.1"] }),
    assistmentsRow({ user: "u3", assignment: "a2", assistment: "p7", original: "0", hints: "2" }),
    assistmentsRow({ user: "u3", assignment: "a2", assistment: "p8", original: "", affect: ["0.1", "0.1", "0.1", "0.9"] }),
    // u4: a hint and asked for steps on the same problem; system steps with no hint inside the scaffolding
    assistmentsRow({ user: "u4", assignment: "a3", assistment: "p9", original: "1", hints: "2", first: "2" }),
    assistmentsRow({ user: "u4", assignment: "a3", assistment: "p10", original: "1", first: "0", correct: "0" }),
    assistmentsRow({ user: "u4", assignment: "a3", assistment: "p10", original: "0", hints: "" }),
  ];
  return rows.join("\r\n") + "\r\n";
}
