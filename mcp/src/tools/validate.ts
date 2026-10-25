/** learnlog_validate: is this a valid Learnlog file, and what does each record leave unknown? */
import { readLocalText } from "../files.js";
import { verifyLearnlog } from "../draft03.js";
import { VENDORED_FROM } from "../package.js";
import { engine, sourceWarnings, unknownsOf } from "../transformer.js";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export const NOT_CHECKED = [
  "Signed heads and signatures: the transformer's verifier refuses files that carry them, so they are not verified here.",
  "Truncated records and signed heads: refused, not checked.",
  "Redacted entries: the draft allows them in records without a QLM profile, and the chain still checks, but what they held can't be checked.",
  "Records without a QLM semantic profile (for example from qlm-transformer convert): only draft-03's structure, timestamps and hash chain are checked, not what their events mean.",
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
    checked_with_draft: "draft-srivastava-learnlog-03 structure, timestamps and hash chain, for records without a QLM semantic profile",
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
    const { heads, unprofiled, redacted } = await verifyLearnlog(doc);
    if (unprofiled) warnings.push(unprofiled === 1
      ? "1 record carries no QLM semantic profile, so it was checked against draft-srivastava-learnlog-03 only: structure, timestamps and the hash chain. What its events mean wasn't checked against a profile."
      : `${unprofiled} records carry no QLM semantic profile, so they were checked against draft-srivastava-learnlog-03 only: structure, timestamps and the hash chain. What their events mean wasn't checked against a profile.`);
    if (redacted) warnings.push(redacted === 1
      ? "1 entry is redacted. The chain still checks, but what it held can't be."
      : `${redacted} entries are redacted. The chain still checks, but what they held can't be.`);
    return { valid: true, errors: [], warnings, records, heads, ...base };
  } catch (e) {
    return { valid: false, errors: [(e as Error).message], warnings, records, ...base };
  }
}
