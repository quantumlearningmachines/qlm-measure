/* global fetch */
// Rebuilds data/labpath-worlds.json: every mode id in QLM's misconception, learning-graph and standards
// exports, checked against its public world page. A world is listed only if its page loads and has a heading.
// Usage: node scripts/refresh-worlds.mjs
import { writeFileSync } from "node:fs";
const BASE = "https://play.quantumlearningmachines.com/api/labpath/dataset-export?dataset=";
const PAGE = "https://play.quantumlearningmachines.com/ecogenesis/worlds/";
const get = async (d) => (await fetch(BASE + d)).json();
const [m, g, s] = await Promise.all([get("misconceptions"), get("learning-graph"), get("standards")]);
const ids = new Set([...m.misconceptions.flatMap((r) => r.modes ?? []), ...g.learningGraph.flatMap((e) => [e.fromModeId, e.toModeId]), ...s.standardsAlignment.map((r) => r.modeId)]);
const worlds = {};
const missing = [];
for (const id of [...ids].sort()) {
  const res = await fetch(PAGE + id);
  const h1 = res.ok ? /<h1[^>]*>([^<]+)</.exec(await res.text())?.[1]?.trim() : undefined;
  if (h1) worlds[id] = h1;
  else missing.push(`${id}:${res.status}`);
}
const out = { source: "Each world's public page on play.quantumlearningmachines.com: the page's heading is the world's name. Built by scripts/refresh-worlds.mjs from every mode id in QLM's misconception, learning-graph and standards exports.", checked: new Date().toISOString().slice(0, 10), url_pattern: PAGE + "{id}", worlds };
writeFileSync(new URL("../data/labpath-worlds.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(worlds).length} worlds listed; no page for: ${missing.join(" ") || "none"}`);
