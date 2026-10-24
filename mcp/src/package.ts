/** Where this package's files are, and what it calls itself. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The package root: src/ when tested, dist/ when installed, both one level down. */
export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const NAME = "learnlog-mcp";
export const VERSION = (JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { version: string }).version;

export function readJsonFile(relative: string): unknown {
  return JSON.parse(readFileSync(join(ROOT, relative), "utf8"));
}

/** The qlm-measure commit the vendored transformer, verifier and published counts were copied from. */
export const VENDORED_COMMIT = (readJsonFile("vendor/PROVENANCE.json") as { commit: string }).commit;
export const VENDORED_FROM = `qlm-measure@${VENDORED_COMMIT.slice(0, 7)}`;
