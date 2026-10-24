import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.doUnmock("../src/server.js");
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("the learnlog-mcp command", () => {
  it("starts the server", async () => {
    const start = vi.fn(async () => {});
    vi.doMock("../src/server.js", () => ({ start }));
    await import("../src/bin.js");
    expect(start).toHaveBeenCalledOnce();
  });
  it("prints the reason and exits 1 when the server can't start", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    vi.doMock("../src/server.js", () => ({ start: async () => Promise.reject(new Error("no stdio")) }));
    await import("../src/bin.js");
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(1);
    });
    expect(write).toHaveBeenCalledWith("learnlog-mcp: no stdio\n");
    vi.resetModules();
    // A rejection that isn't an Error, on purpose: the command must still print it.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    vi.doMock("../src/server.js", () => ({ start: async () => Promise.reject("plain") }));
    await import("../src/bin.js");
    await vi.waitFor(() => {
      expect(write).toHaveBeenCalledWith("learnlog-mcp: plain\n");
    });
  });
});
