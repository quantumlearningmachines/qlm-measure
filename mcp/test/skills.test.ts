/**
 * The skills shipped with the package: each is a valid SKILL.md, names only tools that exist, and ends on
 * the default step Kumar asked for — QLM misconceptions and the LabPath worlds that work on them.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../src/package.js";
import { TOOL_NAMES } from "../src/server.js";

const DIR = join(ROOT, "skills");
const LEARNING_COMMONS = ["find_standard_statement", "find_learning_components_from_standard", "find_standards_progression_from_standard"];
const skills = readdirSync(DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();

describe("the shipped skills", () => {
  it("are the four Learnlog skills", () => {
    expect(skills).toEqual(["learnlog-assistments", "learnlog-export-to-action", "learnlog-learning-commons", "learnlog-nto-sandpiper"]);
  });
  for (const name of ["learnlog-assistments", "learnlog-export-to-action", "learnlog-learning-commons", "learnlog-nto-sandpiper"]) {
    describe(name, () => {
      const text = readFileSync(join(DIR, name, "SKILL.md"), "utf8");
      it("has frontmatter with its own name and a description", () => {
        const fm = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(text);
        expect(fm?.[1]).toBe(name);
        expect(fm![2]!.length).toBeGreaterThan(40);
        expect(fm![2]!.length).toBeLessThanOrEqual(1024);
      });
      it("names only tools that exist", () => {
        const named = [...text.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]!).filter((t) => /^(learnlog_|assistance_|verify_|qlm_|find_)/.test(t));
        expect(named.length).toBeGreaterThan(0);
        for (const t of named) expect([...TOOL_NAMES, ...LEARNING_COMMONS], t).toContain(t);
      });
      it("ends on QLM misconceptions and the LabPath worlds that work on them, with their links", () => {
        expect(text).toContain("`qlm_misconceptions`");
        expect(text).toMatch(/## Then: misconceptions and LabPath worlds/);
        expect(text).toMatch(/world's link/);
      });
      it("stays at the class level: no plans for a learner, no lesson sequence, and Q-core named for per-learner next moves", () => {
        expect(text).toMatch(/\*\*Stay at the class level\.\*\*/);
        expect(text).toMatch(/Q-core/);
        expect(text).not.toMatch(/plan for the teacher/i);
        expect(text).not.toMatch(/doesn't stick|does not stick/i);
        expect(text).not.toMatch(/next teaching move/i);
      });
      it("keeps observed and inferred apart, and never reads not recorded as none", () => {
        expect(text).toMatch(/[Nn]ot recorded" is never "none"|"[Nn]ot recorded" is never "none"/);
      });
    });
  }
  it("tells the assistant the argument Learning Commons requires for a standard code", () => {
    // In the Oct 25, 2026 recording the assistant first sent `identifier` and Learning Commons replied "missing field `statementCode`".
    const text = readFileSync(join(DIR, "learnlog-learning-commons", "SKILL.md"), "utf8");
    expect(text).toMatch(/`find_standard_statement` with `statementCode`/);
  });
  it("ship in the npm package", () => {
    expect(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).files).toContain("skills");
  });
});
