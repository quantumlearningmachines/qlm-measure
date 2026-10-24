#!/usr/bin/env node
// Runs the LinkedIn demo's tool calls against the BUILT server over stdio, exactly as an MCP client
// would, and prints each call and its full answer. Run after `npm run build`. Scenes 1 and 2 are local.
// Scene 3 reads QLM's public LabPath datasets: one GET per dataset (misconceptions, learning-graph,
// standards), which is also the live smoke check for those two tools.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";

const bin = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const client = new Client({ name: "demo", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [bin] }));
const calls = [
  ["learnlog_transform", { format: "tutormoments", use_sample: true }],
  ["assistance_inventory", { format: "tutormoments", use_sample: true }],
  ["assistance_inventory", {}],
];
async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  console.log(`\n### CALL ${name} ${JSON.stringify(args)}\n`);
  console.log(r.content[0].text);
  if (r.isError) throw new Error(`${name} refused: ${r.content[0].text}`);
  return JSON.parse(r.content[0].text);
}
for (const [name, args] of calls) await call(name, args);
// Scene 3: a misconception that might explain passing force problems only with hints, then what comes before it.
const mis = await call("qlm_misconceptions", { search: "force", domain: "physics", limit: 5 });
const mode = mis.misconceptions.find((m) => Array.isArray(m.modes) && m.modes.length)?.modes[0];
await call("qlm_learning_graph", { mode_id: mode, direction: "before", kinds: ["prerequisite", "labpath-sequence", "reinforcement"] });
await client.close();
