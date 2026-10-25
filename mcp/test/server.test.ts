import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ROOT } from "../src/package.js";
import { TOOL_NAMES, createServer } from "../src/server.js";
import { datasetFetch } from "./helpers/qlm-fixtures.js";

type Obj = Record<string, any>;

async function connect(fetchImpl?: typeof fetch) {
  const server = createServer(fetchImpl ? { fetch: fetchImpl } : {});
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const body = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0]!.text) as Obj;

describe("the MCP server", () => {
  it("lists exactly the eight tools, each read-only, and only the three network tools reach out", async () => {
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual([...TOOL_NAMES]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.annotations?.destructiveHint, t.name).toBe(false);
      expect(t.annotations?.openWorldHint, t.name).toBe(["verify_credential", "qlm_misconceptions", "qlm_learning_graph"].includes(t.name));
      expect(t.description!.length, t.name).toBeGreaterThan(80);
    }
    expect(client.getInstructions()).toMatch(/not recorded/);
    expect(client.getServerVersion()).toEqual({ name: "learnlog-mcp", version: "0.2.3" });
  });

  it("answers through each tool", async () => {
    const calls: string[] = [];
    const data = datasetFetch();
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.startsWith("https://play.")) return data.f(url, init);
      return new Response(JSON.stringify({ verified: false, error: "not_found" }), { status: 404 });
    }) as unknown as typeof fetch;
    const client = await connect(fakeFetch);
    const formats = body(await client.callTool({ name: "learnlog_formats", arguments: {} }));
    expect(formats.formats).toHaveLength(4);
    const sp = body(await client.callTool({ name: "learnlog_transform", arguments: { format: "sandpiper", use_sample: true } }));
    expect(sp.summary.unit).toBe("transcript_utterances");
    const spInv = body(await client.callTool({ name: "assistance_inventory", arguments: { format: "sandpiper", use_sample: true } }));
    expect(spInv.sources[0].stages.accepted.status).toBe("not recorded");
    const t = body(await client.callTool({ name: "learnlog_transform", arguments: { format: "oatutor", use_sample: true } }));
    expect(t.summary.entries).toBe(12);
    const inv = body(await client.callTool({ name: "assistance_inventory", arguments: { format: "tutormoments", use_sample: true } }));
    expect(inv.sources[0].stages.displayed.status).toBe("not recorded");
    const ev = body(await client.callTool({ name: "verify_evidence", arguments: { path: join(ROOT, "data/examples/evidence-record-clean.json") } }));
    expect(ev.verdict).toBe("pass");
    const v = body(await client.callTool({ name: "learnlog_validate", arguments: { path: join(ROOT, "data/examples/evidence-record-clean.json") } }));
    expect(v.valid).toBe(false);
    const cred = body(await client.callTool({ name: "verify_credential", arguments: { credential: "urn:uuid:00000000-0000-4000-8000-000000000000" } }));
    expect(cred.result).toBe("not_found");
    const mis = body(await client.callTool({ name: "qlm_misconceptions", arguments: { search: "force" } }));
    expect(mis.misconceptions[0].id).toBe("PHY-001");
    const graph = body(await client.callTool({ name: "qlm_learning_graph", arguments: { mode_id: mis.misconceptions[0].modes[0], direction: "before" } }));
    expect(graph.before[0].from).toBe("intro-motion");
    await client.callTool({ name: "qlm_misconceptions", arguments: { id: "PHY-002" } });
    expect(calls).toEqual([
      "https://app.qlmdev.com/v1/verify?id=urn%3Auuid%3A00000000-0000-4000-8000-000000000000",
      "https://play.quantumlearningmachines.com/api/labpath/dataset-export?dataset=misconceptions",
      "https://play.quantumlearningmachines.com/api/labpath/dataset-export?dataset=learning-graph",
      "https://play.quantumlearningmachines.com/api/labpath/dataset-export?dataset=standards",
    ]);
  });

  it("refuses with a plain reason rather than failing", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "learnlog_transform", arguments: { format: "oatutor" } });
    expect(r.isError).toBe(true);
    expect(body(r).error).toMatch(/Give either path or use_sample/);
    const bad = await client.callTool({ name: "learnlog_transform", arguments: { format: "nope", use_sample: true } });
    expect(bad.isError).toBe(true);
  });

  it("starts on stdio", async () => {
    const connected: unknown[] = [];
    vi.resetModules();
    vi.doMock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
      StdioServerTransport: class {
        start = async () => { connected.push(this); };
        send = async () => {};
        close = async () => {};
      },
    }));
    const { start } = await import("../src/server.js");
    await start();
    expect(connected).toHaveLength(1);
    vi.doUnmock("@modelcontextprotocol/sdk/server/stdio.js");
  });
});
