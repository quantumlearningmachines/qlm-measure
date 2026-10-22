import { describe, it, expect, vi } from "vitest";

// processIO.readStdin reads file descriptor 0. Stand in for it so the test never blocks on a terminal.
vi.mock("fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("fs")>();
  return {
    ...real,
    readFileSync: vi.fn((p: Parameters<typeof real.readFileSync>[0], o?: unknown) =>
      p === 0 ? "from-stdin" : (real.readFileSync as (a: unknown, b?: unknown) => unknown)(p, o)),
  };
});

describe("processIO.readStdin", () => {
  it("reads all of file descriptor 0 as UTF-8", async () => {
    const fs = await import("fs");
    const { processIO } = await import("../src/cli.js");
    expect(processIO.readStdin()).toBe("from-stdin");
    expect(fs.readFileSync).toHaveBeenCalledWith(0, "utf-8");
  });
});
