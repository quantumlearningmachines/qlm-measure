/**
 * ASSISTments: help requests counted by the problem's own skill label (counts only), so a skill can name
 * the topic to look up; and an answer about one file names only the cautions that apply to it.
 */
import { describe, expect, it } from "vitest";
import { assistmentsBySkill } from "../src/episodes.js";
import { preprintInventory, publishedFigures } from "../src/tools/preprint.js";
import { ASSISTMENTS_HEADER, assistmentsCsv, assistmentsRow, idetraceJson, zenodoZip } from "./helpers/fixtures.js";
import { workdir, writeFixture } from "./helpers/python.js";

type Obj = Record<string, any>;
const withSkill = (skill: string, row: string) => row.replace(",Synthetic skill,", `,${skill},`);

describe("assistmentsBySkill", () => {
  const dir = workdir();
  const csv = writeFixture(
    dir,
    "skills.csv",
    [
      ASSISTMENTS_HEADER,
      withSkill("Proportion", assistmentsRow({ user: "u1", assignment: "a", assistment: "p1", original: "1", hints: "2", bottom: "1" })),
      withSkill("Proportion", assistmentsRow({ user: "u2", assignment: "a", assistment: "p1", original: "1", first: "2" })),
      withSkill("Proportion", assistmentsRow({ user: "u3", assignment: "a", assistment: "p1", original: "1" })),
      withSkill("Proportion", assistmentsRow({ user: "u3", assignment: "a", assistment: "p1", original: "0", hints: "1" })),
      withSkill("Area Rectangle", assistmentsRow({ user: "u1", assignment: "a", assistment: "p2", original: "1", hints: "1" })),
      withSkill("", assistmentsRow({ user: "u1", assignment: "a", assistment: "p3", original: "1", hints: "1" })),
    ].join("\n"),
  );
  it("counts main problems, requests and bottom-out hints per skill label, most requested first", async () => {
    const r = await assistmentsBySkill(csv);
    expect(r.skills).toEqual([
      { skill: "Proportion", main_problems: 3, requested: 2, hints_to_the_answer: 1, asked_for_steps: 1 },
      { skill: "Area Rectangle", main_problems: 1, requested: 1, hints_to_the_answer: 0, asked_for_steps: 0 },
      { skill: "(no skill label)", main_problems: 1, requested: 1, hints_to_the_answer: 0, asked_for_steps: 0 },
    ]);
    expect(r.skills_in_file).toBe(3);
    expect(r.note).toMatch(/Counts only/);
  });
  it("keeps the 15 most requested, and says how many there were", async () => {
    const rows = [ASSISTMENTS_HEADER];
    for (let k = 0; k < 20; k++) rows.push(withSkill(`S${String(k).padStart(2, "0")}`, assistmentsRow({ user: "u", assignment: "a", assistment: `p${k}`, original: "1", hints: String(k % 3) })));
    const r = await assistmentsBySkill(writeFixture(dir, "many.csv", rows.join("\n")));
    expect(r.skills).toHaveLength(15);
    expect(r.skills_in_file).toBe(20);
  });
  it("says so when the file has no skill column", async () => {
    const header = ASSISTMENTS_HEADER.replace('"skill",', '"skill_name",');
    const r = await assistmentsBySkill(writeFixture(dir, "noskill.csv", [header, assistmentsRow({ user: "u", assignment: "a", assistment: "p", original: "1" })].join("\n")));
    expect(r).toEqual({ skills: [], skills_in_file: 0, note: "The file has no skill column, so requests can't be split by skill." });
  });
});

describe("cautions that fit the files given", () => {
  const dir = workdir();
  const csv = writeFixture(dir, "a.csv", assistmentsCsv());
  const zip = writeFixture(dir, "z.zip", zenodoZip());
  const ide = writeFixture(dir, "d.json", idetraceJson());
  const has = (r: Obj, re: RegExp) => (r.cannot_conclude as string[]).some((s) => re.test(s));
  it("ASSISTments alone: no programming-release cautions, and its requests by skill", async () => {
    const r = (await preprintInventory({ assistments_csv: csv })) as Obj;
    expect(has(r, /1,109|programming releases|IDETrace/)).toBe(false);
    expect(has(r, /counted by problem/)).toBe(true);
    expect(has(r, /Not recorded is never the same as none/)).toBe(true);
    expect(r.assistments_requests_by_skill.skills[0]).toEqual(expect.objectContaining({ skill: "Synthetic skill" }));
  });
  it("programming releases alone: no ASSISTments caution", async () => {
    const r = (await preprintInventory({ zenodo_zip: zip, idetrace_json: ide, allow_idetrace_research: true })) as Obj;
    expect(has(r, /ASSISTments/)).toBe(false);
    expect(has(r, /programming releases/)).toBe(true);
    expect(r).not.toHaveProperty("assistments_requests_by_skill");
  });
  it("all three, and the published figures, keep every caution", async () => {
    const all = (await preprintInventory({ zenodo_zip: zip, idetrace_json: ide, allow_idetrace_research: true, assistments_csv: csv })) as Obj;
    expect(has(all, /ASSISTments is counted by problem and is set beside the other two/)).toBe(true);
    expect(has(publishedFigures(), /1,109/)).toBe(true);
    expect(has(publishedFigures(), /ASSISTments is counted by problem and is set beside the other two/)).toBe(true);
  });
});
