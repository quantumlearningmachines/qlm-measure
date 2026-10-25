/**
 * Checks a Learnlog file against draft-srivastava-learnlog-03 itself: the contained-file shape
 * (Section 5), timestamps (Section 4) and the hash chain (Figure 16, JCS + SHA-256). Records that bind
 * a QLM semantic profile are also checked by the vendored transformer's stricter verifier, unchanged.
 * Records without one (for example from `qlm-transformer convert`) get the draft check only (issue #22).
 */
import { engine } from "./transformer.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";
const HEX = /^(?:[0-9a-f][0-9a-f])+$/;

/** Draft-03 Timestamp: RFC 3339 in UTC, uppercase T and Z, 1 to 9 fractional digits, and a real date and time. */
const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/;
export function validTimestamp(value: string): boolean {
  const m = typeof value === "string" ? TIMESTAMP.exec(value) : null;
  if (!m) return false;
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number) as [number, number, number, number, number, number];
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  return days !== undefined && d >= 1 && d <= days && h <= 23 && mi <= 59 && s <= 59;
}

/** A record binds a QLM semantic profile when its header names one; the transformer's verifier then applies. */
export function isProfiled(record: unknown): boolean {
  return isObj(record) && isObj(record.header) && Object.hasOwn(record.header, "semantic_profile_binding");
}

function checkParty(p: unknown, where: string, name: string): void {
  if (!isObj(p) || !text(p.role)) throw new Error(`${where}: event.${name} must be an object with a role.`);
  if ("kind" in p && p.kind !== "human" && p.kind !== "software") throw new Error(`${where}: event.${name}.kind must be human or software.`);
  if ("id" in p && typeof p.id !== "string") throw new Error(`${where}: event.${name}.id must be text.`);
}

function checkEvent(ev: unknown, where: string): void {
  if (!isObj(ev)) throw new Error(`${where}: event must be an object.`);
  if (!text(ev.name)) throw new Error(`${where}: event.name must be nonempty text.`);
  if (!text(ev.salt)) throw new Error(`${where}: event.salt must be nonempty text.`);
  if (!("data" in ev)) throw new Error(`${where}: event.data is required.`);
  if ("actor" in ev) checkParty(ev.actor, where, "actor");
  if ("to" in ev) checkParty(ev.to, where, "to");
}

export interface DraftResult {
  heads: Record<string, { seq: number; entry_hash: string }>;
  redacted: number;
}

/** Throws with the first rule a document breaks, naming its record and entry. */
export async function verifyDraft03(doc: unknown): Promise<DraftResult> {
  if (!isObj(doc) || typeof doc.file_schema !== "string" || typeof doc.serialization_format !== "string" || !Array.isArray(doc.records) || !doc.records.length) {
    throw new Error("Unsupported LearnLog document.");
  }
  const heads: DraftResult["heads"] = Object.create(null) as DraftResult["heads"];
  const seen = new Map<string, number>();
  let redacted = 0;
  for (const [ri, r] of doc.records.entries()) {
    const at = `Record ${ri + 1}`;
    if (!isObj(r)) throw new Error(`${at} isn't an object.`);
    const h = r.header;
    if (!isObj(h)) throw new Error(`${at}: header must be an object.`);
    if (!text(h.record_id)) throw new Error(`${at}: header.record_id must be nonempty text.`);
    if (typeof h.subject !== "string") throw new Error(`${at}: header.subject must be text.`);
    if (h.hash_alg !== "sha-256") throw new Error(`${at} uses hash_alg ${JSON.stringify(h.hash_alg)}. This server checks only sha-256.`);
    if (!validTimestamp(h.created as string)) throw new Error(`${at}: header.created isn't a draft-03 timestamp (UTC, uppercase T and Z, up to 9 fractional digits).`);
    if ("producer" in h && !isObj(h.producer)) throw new Error(`${at}: header.producer must be an object when present.`);
    if (!Array.isArray(r.event_schemas) || !r.event_schemas.length || !r.event_schemas.every(text)) throw new Error(`${at}: event_schemas must list at least one schema as text.`);
    if ("truncated" in r || "signed_heads" in r) throw new Error(`${at} is truncated or carries signed heads. This server doesn't verify those, so it can't check this record.`);
    if (!Array.isArray(r.entries)) throw new Error(`${at}: entries must be a list.`);
    const first = seen.get(h.record_id);
    if (first !== undefined) throw new Error(`Records ${first} and ${ri + 1} share record_id ${JSON.stringify(h.record_id)}.`);
    seen.set(h.record_id, ri + 1);
    const recordHash = await engine.digest(h);
    let prev = recordHash;
    for (const [ei, e] of r.entries.entries()) {
      const where = `${at}, entry ${ei + 1}`;
      if (!isObj(e)) throw new Error(`${where} isn't an object.`);
      for (const k of ["seq", "time", "event_hash", "prev_hash", "entry_hash"]) if (!(k in e)) throw new Error(`${where} is missing ${k}.`);
      // seq must equal its position, which also keeps it within the draft's 1..2^53-1.
      if (e.seq !== ei + 1) throw new Error(`${where}: sequence number should be ${ei + 1}, not ${JSON.stringify(e.seq)}.`);
      if (!validTimestamp(e.time as string)) throw new Error(`${where}: time isn't a draft-03 timestamp (UTC, uppercase T and Z, up to 9 fractional digits).`);
      for (const k of ["event_hash", "prev_hash", "entry_hash"]) if (typeof e[k] !== "string" || !HEX.test(e[k])) throw new Error(`${where}: ${k} must be lowercase hexadecimal.`);
      if (("event" in e) === ("redacted" in e)) throw new Error(`${where} must hold exactly one of event and redacted.`);
      if ("redacted" in e) {
        if (e.redacted !== true) throw new Error(`${where}: redacted must be true.`);
        redacted++;
      } else {
        checkEvent(e.event, where);
        if ((await engine.digest(e.event)) !== e.event_hash) throw new Error(`${where}: event hash mismatch.`);
      }
      if (e.prev_hash !== prev) throw new Error(`${where}: previous hash doesn't match ${ei === 0 ? "the record hash" : "the entry before it"}.`);
      const computed = await engine.digest({ record_hash: recordHash, seq: e.seq, time: e.time, event_hash: e.event_hash, prev_hash: e.prev_hash });
      if (computed !== e.entry_hash) throw new Error(`${where}: entry hash mismatch.`);
      prev = computed;
    }
    heads[h.record_id] = { seq: r.entries.length, entry_hash: prev };
  }
  return { heads, redacted };
}

export interface LearnlogCheck extends DraftResult {
  unprofiled: number;
}

/**
 * The check learnlog_validate and assistance_inventory share. A file whose records all bind a QLM
 * profile gets the transformer's verifier, exactly as before. Otherwise every record gets the draft
 * check, and the profiled ones also get the transformer's verifier.
 */
export async function verifyLearnlog(doc: unknown): Promise<LearnlogCheck> {
  const records = isObj(doc) && Array.isArray(doc.records) ? doc.records : [];
  const profiled = records.filter(isProfiled);
  if (records.length && profiled.length === records.length) return { heads: await engine.verify(doc), unprofiled: 0, redacted: 0 };
  const draft = await verifyDraft03(doc);
  if (profiled.length) await engine.verify({ ...(doc as Obj), records: profiled });
  return { ...draft, unprofiled: records.length - profiled.length };
}
