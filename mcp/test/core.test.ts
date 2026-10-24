import { mkdirSync, symlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Refusal, localFile, readLocalBytes, readLocalText } from "../src/files.js";
import { answer, guard, refuse } from "../src/respond.js";
import { withholdSealed } from "../src/sealed.js";
import { workdir, writeFixture } from "./helpers/python.js";

const parse = (r: { content: { text: string }[] }) => JSON.parse(r.content[0]!.text) as Record<string, unknown>;

describe("local files only", () => {
  const dir = workdir();
  const file = writeFixture(dir, "a.json", '{"x":1}');
  it("reads an absolute path to a regular file", () => {
    expect(localFile(file, "path", 100)).toEqual({ path: file, bytes: 7 });
    expect(readLocalText(file, "path", 100)).toBe('{"x":1}');
    expect(readLocalBytes(file, "path", 100).length).toBe(7);
  });
  it("expands a leading ~/ to the home folder", () => {
    expect(() => localFile("~/definitely-not-a-file-learnlog-mcp.json", "path", 100)).toThrow(new Refusal(`There is no file at ${join(homedir(), "definitely-not-a-file-learnlog-mcp.json")}.`));
  });
  it("refuses relative paths, stdin, and empty or non-text paths", () => {
    expect(() => localFile("a.json", "path", 100)).toThrow(/Give the full path/);
    expect(() => localFile("-", "path", 100)).toThrow(/Give the full path/);
    expect(() => localFile("", "path", 100)).toThrow(/path needs a file path/);
    expect(() => localFile("/a\u0000b", "path", 100)).toThrow(/path needs a file path/);
    expect(() => localFile(undefined, "path", 100)).toThrow(/path needs a file path/);
  });
  it("refuses folders, missing files and files over the size limit", () => {
    expect(() => localFile(dir, "path", 100)).toThrow(/is a folder or device, not a regular file/);
    expect(() => localFile(join(dir, "nope.json"), "path", 100)).toThrow(/There is no file at/);
    expect(() => localFile(file, "path", 3)).toThrow(/is 7 bytes; this tool reads files up to 3 bytes/);
  });
  it("follows a symbolic link to a regular file", () => {
    const sub = join(dir, "sub");
    mkdirSync(sub);
    symlinkSync(file, join(sub, "link.json"));
    expect(localFile(join(sub, "link.json"), "path", 100).bytes).toBe(7);
  });
});

describe("sealed content never appears in output", () => {
  it("withholds answer keys and sealed variants at any depth, and says where", () => {
    const { value, withheld } = withholdSealed({ a: 1, answer_key: "B", nested: [{ Sealed_Variant: { x: 1 } }, { correctAnswer: 4, ok: "y" }], sealedCases: [1], "expected-answer": "z", solution_key: 1, sealed: true });
    expect(value).toEqual({ a: 1, answer_key: "[withheld: sealed content]", nested: [{ Sealed_Variant: "[withheld: sealed content]" }, { correctAnswer: "[withheld: sealed content]", ok: "y" }], sealedCases: "[withheld: sealed content]", "expected-answer": "[withheld: sealed content]", solution_key: "[withheld: sealed content]", sealed: "[withheld: sealed content]" });
    expect(withheld).toEqual(["$.answer_key", "$.nested[0].Sealed_Variant", "$.nested[1].correctAnswer", "$.sealedCases", '$["expected-answer"]', "$.solution_key", "$.sealed"]);
  });
  it("leaves ordinary values alone", () => {
    expect(withholdSealed([1, "answer_key", null, { answers: 2, sealedAt: "2026-01-01", sealed_items: [] }])).toEqual({ value: [1, "answer_key", null, { answers: 2, sealedAt: "2026-01-01", sealed_items: "[withheld: sealed content]" }], withheld: ["$[3].sealed_items"] });
    expect(withholdSealed("x")).toEqual({ value: "x", withheld: [] });
    const kept = withholdSealed(JSON.parse('{"__proto__": {"answerKey": 1, "n": 2}}')).value as object;
    expect(Object.getOwnPropertyDescriptor(kept, "__proto__")?.value).toEqual({ answerKey: "[withheld: sealed content]", n: 2 });
    expect(Object.getPrototypeOf(kept)).toBe(Object.prototype);
  });
});

describe("every answer says what it doesn't show", () => {
  it("returns JSON text with the body", () => {
    const r = answer({ n: 1, does_not_show: ["a rate"] });
    expect(r.isError).toBeUndefined();
    expect(parse(r)).toEqual({ n: 1, does_not_show: ["a rate"] });
  });
  it("refuses to build an answer without its limits", () => {
    expect(() => answer({ n: 1 })).toThrow(/does_not_show/);
    expect(() => answer({ n: 1, does_not_show: [] })).toThrow(/does_not_show/);
  });
  it("withholds sealed content and reports that it did", () => {
    expect(parse(answer({ answer_key: "C", does_not_show: ["x"] }))).toEqual({ answer_key: "[withheld: sealed content]", does_not_show: ["x"], sealed_content_withheld: ["$.answer_key"] });
  });
  it("refusals are errors with a plain reason", () => {
    const r = refuse("No such file.");
    expect(r.isError).toBe(true);
    expect(parse(r)).toEqual({ error: "No such file." });
  });
  it("guard turns a Refusal into a refusal, and any other error into a refusal that says it was unexpected", async () => {
    expect(parse(await guard(() => { throw new Refusal("nope"); }))).toEqual({ error: "nope" });
    expect(parse(await guard(() => { throw new Error("boom"); }))).toEqual({ error: "Unexpected error: boom" });
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- a thrown non-Error, on purpose
    expect(parse(await guard(() => { throw "text"; }))).toEqual({ error: "Unexpected error: text" });
    expect(parse(await guard(async () => Promise.resolve({ ok: true, does_not_show: ["y"] })))).toEqual({ ok: true, does_not_show: ["y"] });
  });
});
