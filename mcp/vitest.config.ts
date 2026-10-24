import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      // The vendored qlm-measure build names source maps that aren't vendored. Drop the comment in
      // tests only (the files on disk stay byte-identical) so the runner doesn't look for them.
      name: "vendored-without-source-maps",
      enforce: "pre",
      load(id) {
        return id.includes("/vendor/qlm-measure/") && id.endsWith(".js") ? { code: readFileSync(id, "utf8").replace(/^\/\/# sourceMappingURL=.*$/m, ""), map: null } : null;
      },
    },
  ],
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "json-summary", "json"],
      thresholds: { statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
