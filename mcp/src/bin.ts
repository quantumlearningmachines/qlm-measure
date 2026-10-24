#!/usr/bin/env node
import { start } from "./server.js";

start().catch((e: unknown) => {
  process.stderr.write(`learnlog-mcp: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
