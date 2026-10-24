/**
 * Every local tool reads the user's own files through here: an absolute path (or ~/...) to a regular
 * file, within a size limit. Nothing is written, and nothing read here leaves the machine.
 */
import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/** A reason a tool will not do what was asked, written for the person asking. */
export class Refusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Refusal";
  }
}

export function localFile(input: unknown, label: string, maxBytes: number): { path: string; bytes: number } {
  if (typeof input !== "string" || !input || input.includes("\u0000")) throw new Refusal(`${label} needs a file path.`);
  const path = input.startsWith("~/") ? join(homedir(), input.slice(2)) : input;
  if (!isAbsolute(path)) throw new Refusal(`Give the full path to the file (for example /Users/you/data/export.csv), not "${input}".`);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    throw new Refusal(`There is no file at ${path}.`);
  }
  if (!stat.isFile()) throw new Refusal(`${path} is a folder or device, not a regular file.`);
  if (stat.size > maxBytes) throw new Refusal(`${path} is ${stat.size} bytes; this tool reads files up to ${maxBytes} bytes.`);
  return { path, bytes: stat.size };
}

export function readLocalBytes(input: unknown, label: string, maxBytes: number): Buffer {
  return readFileSync(localFile(input, label, maxBytes).path);
}

export function readLocalText(input: unknown, label: string, maxBytes: number): string {
  return readLocalBytes(input, label, maxBytes).toString("utf8");
}
