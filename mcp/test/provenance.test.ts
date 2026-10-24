import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, VENDORED_COMMIT } from "../src/package.js";

const provenance = JSON.parse(readFileSync(join(ROOT, "vendor/PROVENANCE.json"), "utf8")) as { commit: string; repository: string; files: { path: string; source: string; sha256: string; license: string }[] };

describe("vendored code and data are byte-for-byte what qlm-measure holds at the recorded commit", () => {
  it("records the qlm-measure commit", () => {
    expect(provenance.repository).toBe("https://github.com/quantumlearningmachines/qlm-measure");
    expect(provenance.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(VENDORED_COMMIT).toBe(provenance.commit);
  });
  it("every vendored file matches its recorded SHA-256 and names a license", () => {
    expect(provenance.files.length).toBeGreaterThan(30);
    for (const f of provenance.files) {
      expect(existsSync(join(ROOT, f.path)), f.path).toBe(true);
      expect(createHash("sha256").update(readFileSync(join(ROOT, f.path))).digest("hex"), f.path).toBe(f.sha256);
      expect(f.license.length, f.path).toBeGreaterThan(2);
    }
  });
  it("the transformer engine is the one the transformer demo ships", () => {
    const engine = provenance.files.find((f) => f.path === "vendor/transformer/engine.mjs")!;
    expect(engine.source).toBe("demo/transformer/dist/engine.mjs");
  });
});
