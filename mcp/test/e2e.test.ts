/**
 * End to end: start the BUILT server (dist/bin.js, as npx runs it) over stdio with the SDK client,
 * list the eight tools and call each one. The three network tools are called with input they refuse
 * before any request, so this test makes no network call; the live calls are scripts/live-smoke.mjs
 * (credential) and scripts/demo-run.mjs (the LabPath datasets).
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROOT } from "../src/package.js";

type Obj = Record<string, any>;
const body = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0]!.text) as Obj;
const BIN = join(ROOT, "dist/bin.js");
let client: Client;

beforeAll(async () => {
  expect(existsSync(BIN), "run npm run build first (npm test does)").toBe(true);
  client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [BIN], stderr: "pipe" }));
});
afterAll(async () => {
  await client.close();
});

describe("the built server over stdio", () => {
  it("lists the eight tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["assistance_inventory", "learnlog_formats", "learnlog_transform", "learnlog_validate", "qlm_learning_graph", "qlm_misconceptions", "verify_credential", "verify_evidence"]);
  });
  it("calls each one", async () => {
    expect(body(await client.callTool({ name: "learnlog_formats", arguments: {} })).formats).toHaveLength(4);
    const t = body(await client.callTool({ name: "learnlog_transform", arguments: { format: "tutormoments", use_sample: true } }));
    expect(t.summary.entries).toBe(310);
    expect(t.source.verified_public_sample).toBe(true);
    const v = body(await client.callTool({ name: "learnlog_validate", arguments: { path: join(ROOT, "data/examples/chain-tpc-clinical-v2.json") } }));
    expect(v.valid).toBe(false);
    const inv = body(await client.callTool({ name: "assistance_inventory", arguments: {} }));
    expect(inv.inventory_table_2.total_request_observations).toBe(1109);
    const ev = body(await client.callTool({ name: "verify_evidence", arguments: { path: join(ROOT, "data/examples/chain-tpc-clinical-v2-tampered.json"), kind: "chain", family: "tpc/clinical" } }));
    expect(ev.verdict).toBe("fail");
    const cred = await client.callTool({ name: "verify_credential", arguments: { credential: "https://app.qlmdev.com/v1/evidence?id=3f2b8c1e-9a4d-4e6b-8f1a-2c7d5e9b0a13" } });
    expect(cred.isError).toBe(true);
    expect(body(cred).error).toMatch(/evidence record link/);
    const graph = await client.callTool({ name: "qlm_learning_graph", arguments: {} });
    expect(graph.isError).toBe(true);
    expect(body(graph).error).toMatch(/Give either mode_id or standard/);
    const mis = await client.callTool({ name: "qlm_misconceptions", arguments: { limit: 0 } });
    expect(mis.isError).toBe(true);
  });
});
