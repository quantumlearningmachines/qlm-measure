/** learnlog_validate: is this a valid Learnlog file, and what does each record leave unknown? */
import { readLocalText } from "../files.js";
import { VENDORED_FROM } from "../package.js";
import { engine, sourceWarnings, unknownsOf } from "../transformer.js";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const NOT_CHECKED = [
  "Signed heads and signatures: the transformer's verifier refuses files that carry them, so they are not verified here.",
  "Truncated or redacted records: refused, not checked.",
  "Learnlog files from other producers: their header bindings won't match this transformer's profile, so they fail here even when their own chains are sound.",
  "Whether any asserted event happened. Passing shows structural consistency under the stated rules, not that an event occurred (draft Section 2).",
];

export async function learnlogValidate(input: { path: string }): Promise<Record<string, unknown>> {
  let text = readLocalText(input.path, "path", 50_000_000);
  const warnings: string[] = [];
  if (text.startsWith("﻿")) {
    text = text.slice(1);
    warnings.push("The file starts with a byte-order mark, which was ignored.");
  }
  const base = {
    checked_with: `QLM transformer verifier ${engine.ENGINE_VERSION} (vendored from ${VENDORED_FROM})`,
    not_checked: NOT_CHECKED,
    does_not_show: ["What a valid record means for learning. Validation checks the chain, the profile bindings and the import rules, not the learner."],
  };
  let doc: unknown;
  try {
    doc = engine.parseStrictJSON(text);
  } catch (e) {
    return { valid: false, errors: [`Not valid JSON: ${(e as Error).message}`], warnings, records: [], ...base };
  }
  const list = isObj(doc) && Array.isArray(doc.records) ? (doc.records as unknown[]) : [];
  const records = list.map((r, i) => {
    const h = isObj(r) && isObj(r.header) ? r.header : null;
    const entries = isObj(r) && Array.isArray(r.entries) ? r.entries.length : 0;
    return h
      ? { record: i + 1, record_id: h.record_id, source: h.source_platform, import_mode: h.import_mode, source_kind: h.source_kind, entries, unknowns: unknownsOf([r]) }
      : { record: i + 1, unknowns: [] };
  });
  warnings.push(...sourceWarnings(list));
  try {
    const heads = await engine.verify(doc);
    return { valid: true, errors: [], warnings, records, heads, ...base };
  } catch (e) {
    return { valid: false, errors: [(e as Error).message], warnings, records, ...base };
  }
}
