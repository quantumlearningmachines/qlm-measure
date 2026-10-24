#!/usr/bin/env node
// Runs the LinkedIn demo's tool calls against the BUILT server over stdio, exactly as an MCP client
// would, and prints each call and its full answer. Run after `npm run build`. Local only: no network.
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
for (const [name, args] of calls) {
  const r = await client.callTool({ name, arguments: args });
  console.log(`\n### CALL ${name} ${JSON.stringify(args)}\n`);
  console.log(r.content[0].text);
}
await client.close();
