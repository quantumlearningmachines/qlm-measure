/**
 * LabPath worlds and their public pages. The names come from each world's page on
 * play.quantumlearningmachines.com (data/labpath-worlds.json, rebuilt by scripts/refresh-worlds.mjs).
 * A world not in that list gets no link: a page is never made up.
 */
import { readJsonFile } from "../package.js";

const TABLE = readJsonFile("data/labpath-worlds.json") as { url_pattern: string; worlds: Record<string, string> };
export const WORLD_URL = TABLE.url_pattern.replace("{id}", "");

export interface WorldLink {
  id: string;
  name: string | null;
  url: string | null;
  note?: string;
}

export function worldLink(id: string): WorldLink {
  const name = Object.hasOwn(TABLE.worlds, id) ? TABLE.worlds[id]! : null;
  return name === null ? { id, name: null, url: null, note: "No public page is known for this world." } : { id, name, url: WORLD_URL + id };
}

/** Links for a list of world ids, in order, without repeats; anything that isn't text is skipped. */
export function worldLinks(ids: unknown): WorldLink[] {
  const seen = new Set<string>();
  const out: WorldLink[] = [];
  for (const id of Array.isArray(ids) ? ids : []) {
    if (typeof id !== "string" || seen.has(id)) continue;
    seen.add(id);
    out.push(worldLink(id));
  }
  return out;
}
