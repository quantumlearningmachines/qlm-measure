import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { analyzeAssistments, analyzeIdetrace, analyzeZenodo, crossSourceEpisodes } from "../src/episodes.js";
import { ASSISTMENTS_HEADER, assistmentsCsv, assistmentsRow, idetraceJson, zenodoZip } from "./helpers/fixtures.js";
import { plain, runAggregateAdapters, runScript, workdir, writeFixture } from "./helpers/python.js";
import { makeZip } from "./helpers/zip.js";

const sha = (b: string | Buffer) => createHash("sha256").update(b).digest("hex");

describe("the TypeScript port matches the preprint's Python on the same bytes", () => {
  const dir = workdir();
  const zip = zenodoZip();
  const ide = idetraceJson();
  const zipPath = writeFixture(dir, "zenodo.zip", zip);
  const idePath = writeFixture(dir, "deployment.json", ide);

  it("cross_source.py: every episode count, pooled percentage and check", () => {
    const python = runScript("cross_source.py", [zipPath, idePath]);
    const ours = crossSourceEpisodes(analyzeZenodo(zip), analyzeIdetrace(ide));
    expect(plain(ours)).toEqual(plain(python));
  });

  it("aggregate.py: the Table 2 inventory counts for both sources", () => {
    const python = runAggregateAdapters(zipPath, idePath);
    expect(plain(analyzeZenodo(zip).inventory)).toEqual(plain(python.zenodo));
    expect(plain(analyzeIdetrace(ide).inventory)).toEqual(plain(python.tutortrace));
  });

  it("assistments_episodes.py: every episode class, inferred state and check", async () => {
    const csv = writeFixture(dir, "assistments.csv", assistmentsCsv());
    const python = runScript("assistments_episodes.py", [csv]);
    expect(plain(await analyzeAssistments(csv))).toEqual(plain(python));
  });

  it("assistments_episodes.py on a file without a trailing newline and with a BOM-less short row", async () => {
    const text = [ASSISTMENTS_HEADER, assistmentsRow({ user: "u9", assignment: "a", assistment: "p", original: "1", hints: "2", bottom: "1" }), '1,s,10,u10,a,p'].join("\n");
    const csv = writeFixture(dir, "short.csv", text);
    expect(plain(await analyzeAssistments(csv))).toEqual(plain(runScript("assistments_episodes.py", [csv])));
  });
});

describe("what the synthetic fixtures show, stated directly", () => {
  const z = analyzeZenodo(zenodoZip());
  const i = analyzeIdetrace(idetraceJson());
  it("Zenodo: requests by outcome, displays, asked again, pastes", () => {
    expect(z.input_sha256).toBe(sha(zenodoZip()));
    expect(z.episodes.requests).toBe(9);
    expect(z.episodes.outcomes).toEqual({ shown_acted_accepted: 1, shown_acted_revealed_not_accepted: 1, shown_no_further_action_or_rating_only: 5, not_shown_error: 1, not_shown_silent: 1 });
    expect(z.episodes.shown).toBe(7);
    expect(z.episodes.asked_again_within_300s_of_shown).toBe(2);
    expect(z.checks.zenodo_asked_again_where_next_request_is_retry).toBe(1);
    expect(z.checks.zenodo_shown_rated_only).toBe(2);
    expect(z.episodes.raw_paste_actions).toBe(6);
    expect(z.checks.zenodo_raw_pastes_without_copy_or_cut_in_prior_600s).toBe(3);
    expect(z.inventory.help_request_subtypes).toEqual([{ label: "Hint button is clicked", count: 8 }, { label: "Hint retry is clicked", count: 2 }]);
    expect(z.inventory.assistance_request_observations).toBe(10);
    expect(z.inventory.source_file_count).toBe(9);
  });
  it("IDETrace: queries with and without responses, edits after, never asked", () => {
    expect(i.episodes.requests).toBe(6);
    expect(i.episodes.outcomes).toEqual({ shown_code_edit_within_120s: 2, shown_no_code_edit_within_120s: 3, not_shown: 1 });
    expect(i.episodes.asked_again_within_300s_of_shown).toBe(1);
    expect(i.episodes.code_pastes).toBe(2);
    expect(i.episodes.code_pastes_without_in_tool_copy_600s).toBe(1);
    expect(i.episodes.not_shown).toBe(1);
    expect(i.episodes.records_never_asked).toBe(2);
    expect(i.episodes.never_asked_and_passed_all_tests).toBe(1);
    expect(i.checks.idetrace_passrate_types).toEqual({ int: 2, float: 1, str: 1, NoneType: 1 });
    expect(i.inventory.assistance_request_observations).toBe(6);
  });
  it("pools only when both sources are given", () => {
    expect(crossSourceEpisodes(z, undefined)).not.toHaveProperty("pooled");
    expect(crossSourceEpisodes(undefined, i)).not.toHaveProperty("pooled");
    expect(crossSourceEpisodes(z, i)).toHaveProperty("pooled.naive_requests", 15);
    expect(crossSourceEpisodes(undefined, i)).toEqual(expect.objectContaining({ inputs: { idetrace_sha256: sha(idetraceJson()) } }));
  });
  it("gives no percentage where Python would divide by zero", () => {
    const noShow = analyzeIdetrace(JSON.stringify({ a: { events: [{ type: "CHAT_QUERY", timestamp: 1, payload: {} }] } }));
    const zipNoShow = makeZip([{ name: "hints_dataset/L/1.html", data: '<script>const eventsData = [{"type":"Log","description":"Hint button is clicked","timestamp":"2025-01-01T00:00:00+00:00"}]</script>' }, { name: "raw_dataset/activitydata.csv", data: "id,research_id,date,type,info\n" }]);
    const pooled = (crossSourceEpisodes(analyzeZenodo(zipNoShow), noShow) as { pooled: Record<string, unknown> }).pooled;
    expect(pooled).toEqual({ naive_requests: 2, shown: 0, overstatement_pct: null, pooled_not_shown_pct: 100, zenodo_not_shown_pct: 100, zenodo_asked_again_pct: null, idetrace_asked_again_pct: null });
    const empty = analyzeIdetrace("{}");
    const emptyZip = analyzeZenodo(makeZip([{ name: "raw_dataset/activitydata.csv", data: "id,research_id,date,type,info\n" }]));
    expect((crossSourceEpisodes(emptyZip, empty) as { pooled: Record<string, unknown> }).pooled).toEqual({ naive_requests: 0, shown: 0, overstatement_pct: null, pooled_not_shown_pct: null, zenodo_not_shown_pct: null, zenodo_asked_again_pct: null, idetrace_asked_again_pct: null });
  });
});

describe("inputs the Python scripts would stop on are refused with a reason", () => {
  const html = (body: string) => makeZip([{ name: "hints_dataset/L/1.html", data: body }, { name: "raw_dataset/activitydata.csv", data: "id,research_id,date,type,info\n" }]);
  it("a report with no eventsData assignment", () => {
    expect(() => analyzeZenodo(html("<p>no data</p>"))).toThrow(/hints_dataset\/L\/1.html has no eventsData assignment/);
  });
  it("eventsData that is not an array, or holds a non-object event", () => {
    expect(() => analyzeZenodo(html("const eventsData = {}"))).toThrow(/eventsData in hints_dataset\/L\/1.html is not a JSON array/);
    expect(() => analyzeZenodo(html("const eventsData = [1]"))).toThrow(/an event in hints_dataset\/L\/1.html is not an object/);
  });
  it("a Log event with no description, and a report with no Log rows", () => {
    expect(() => analyzeZenodo(html('const eventsData = [{"type":"Log","timestamp":"2025-01-01T00:00:00+00:00"}]'))).toThrow(/a Log event in hints_dataset\/L\/1.html has no text description/);
    expect(() => analyzeZenodo(html('const eventsData = [{"type":"Activity"}]'))).toThrow(/hints_dataset\/L\/1.html has no Log rows/);
  });
  it("the const form missing while the plain form is present (aggregate.py's pattern is stricter)", () => {
    expect(() => analyzeZenodo(html('let eventsData = [{"type":"Log","description":"Hint button is clicked","timestamp":"2025-01-01T00:00:00+00:00"}]'))).toThrow(/aggregate.py's pattern/);
  });
  it("two patterns that start at different places are each decoded, as each script does", () => {
    const click = '{"type":"Log","description":"Hint button is clicked","timestamp":"2025-01-01T00:00:00+00:00"}';
    const body = `const eventsData = [${click}]; window.eventsData = []`;
    const swapped = `var eventsData = [${click}]; const eventsData = [${click}, ${click}]`;
    expect(analyzeZenodo(html(body)).inventory.assistance_request_observations).toBe(1);
    const z = analyzeZenodo(html(swapped));
    expect(z.episodes.requests).toBe(1);
    expect(z.inventory.assistance_request_observations).toBe(2);
    expect(() => analyzeZenodo(html("var eventsData = []; const eventsData = []"))).toThrow(/has no Log rows/);
  });
  it("text that is not UTF-8 counts for episodes but stops the inventory, as aggregate.py decodes strictly", () => {
    const bad = Buffer.concat([Buffer.from('const eventsData = [{"type":"Log","description":"Hint button is clicked","timestamp":"2025-01-01T00:00:00+00:00"}] '), Buffer.from([0xff])]);
    expect(() => analyzeZenodo(html(bad as unknown as string))).toThrow(/is not valid UTF-8/);
  });
  it("an archive without the activity file", () => {
    expect(() => analyzeZenodo(makeZip([{ name: "README.md", data: "x" }]))).toThrow(/raw_dataset\/activitydata.csv/);
  });
  it("an activity copy or paste without a date", () => {
    const z = makeZip([{ name: "raw_dataset/activitydata.csv", data: "id,research_id,date,type,info\n1,R,,Action,EditorPaste\n" }]);
    expect(() => analyzeZenodo(z)).toThrow(/Invalid isoformat string: ''/);
    const short = makeZip([{ name: "raw_dataset/activitydata.csv", data: "id,research_id,date,type,info\n1,R\n2\n" }]);
    expect(analyzeZenodo(short).episodes.raw_activity_ids).toBe(2);
    const missing = makeZip([{ name: "raw_dataset/activitydata.csv", data: "id,research_id,type,info\n1,R,Action,$Copy\n" }]);
    expect(() => analyzeZenodo(missing)).toThrow(/has no date/);
    const shortDate = makeZip([{ name: "raw_dataset/activitydata.csv", data: "id,research_id,type,info,date\n1,R,Action,EditorPaste\n" }]);
    expect(() => analyzeZenodo(shortDate)).toThrow(/Invalid isoformat string: ''/);
    const noIds = makeZip([{ name: "raw_dataset/activitydata.csv", data: "id,date,type,info\n1,2025-01-01 00:00:00+00:00,Action,EditorPaste\n" }]);
    expect(analyzeZenodo(noIds).episodes).toEqual(expect.objectContaining({ raw_activity_ids: 1, raw_paste_actions: 1, raw_ids_with_paste: 1 }));
  });
  it("IDETrace text that is not one JSON object of records with events arrays", () => {
    expect(() => analyzeIdetrace("[]")).toThrow(/must be a JSON object/);
    expect(() => analyzeIdetrace('{"a": {"x": 1}}')).toThrow(/record a has no events array/);
    expect(() => analyzeIdetrace('{"a": 5}')).toThrow(/record a has no events array/);
    expect(() => analyzeIdetrace('{"a": {"events": [1]}}')).toThrow(/an event in record a is not an object/);
    expect(() => analyzeIdetrace('{"a": {"events": [{"timestamp": 1}]}}')).toThrow(/an event in record a has no text type/);
    expect(() => analyzeIdetrace('{"a": {"events": [{"type": "X"}]}}')).toThrow(/an event in record a has no numeric timestamp/);
    expect(() => analyzeIdetrace('{"a": {"events": [{"type": "TEST_CASE_RESULT", "timestamp": 1}]}}')).toThrow(/a TEST_CASE_RESULT event in record a has no payload object/);
    expect(() => analyzeIdetrace("{oops")).toThrow(/JSON/);
  });
  it("ASSISTments rows the script cannot read", async () => {
    const dir = workdir();
    const bad = writeFixture(dir, "bad.csv", [ASSISTMENTS_HEADER, assistmentsRow({ user: "u", assignment: "a", assistment: "p", original: "1", hints: "two" })].join("\n"));
    await expect(analyzeAssistments(bad)).rejects.toThrow(/could not convert string to float: 'two'/);
    const noHeader = writeFixture(dir, "empty.csv", "");
    await expect(analyzeAssistments(noHeader)).rejects.toThrow(/no header row/);
    const missingColumn = writeFixture(dir, "cols.csv", "user_id,assignment_id\nu,a\n");
    await expect(analyzeAssistments(missingColumn)).rejects.toThrow(/missing the columns: assistment_id, original, hint_count, bottom_hint, first_action, correct/);
  });
});
