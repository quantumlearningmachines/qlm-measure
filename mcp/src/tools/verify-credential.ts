/**
 * verify_credential: is this QLM credential real and current? The one tool that uses the network.
 * It sends one GET to https://app.qlmdev.com/v1/verify?id=<credential id> and nothing else, and it
 * shows only the fields of the report it knows. The service's report carries no personal data
 * (verification.ts: no credential subject, no evidence events), and this tool keeps it that way by
 * copying known fields one by one and listing the names of any others it dropped.
 */
import { Refusal } from "../files.js";
import { NOT_RECORDED, byStage } from "../stages.js";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";

export const VERIFY_URL = "https://app.qlmdev.com/v1/verify";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const URN = new RegExp(`urn:uuid:(${UUID})`, "gi");
const ONLY_URN = new RegExp(`^urn:uuid:(${UUID})$`, "i");
const ONLY_UUID = new RegExp(`^(${UUID})$`, "i");

/** The credential ID in what the person gave: the ID itself, a bare UUID, or a link containing one. */
export function credentialIdFrom(input: string): { id: string; read_as?: string } {
  const text = input.trim();
  if (text.length > 2048) throw new Refusal("That's too long to be a credential ID or a link to one.");
  // eslint-disable-next-line no-control-regex
  const isId = !/[\u0000-\u001f\u007f]/.test(text);
  const urn = isId ? ONLY_URN.exec(text) : null;
  if (urn) return { id: `urn:uuid:${urn[1]!.toLowerCase()}` };
  const bare = isId ? ONLY_UUID.exec(text) : null;
  if (bare) {
    const id = `urn:uuid:${bare[1]!.toLowerCase()}`;
    return { id, read_as: `A bare UUID was read as ${id}.` };
  }
  if (isId && /^https?:\/\//i.test(text)) {
    const url = new URL(text);
    if (url.pathname.startsWith("/v1/evidence")) throw new Refusal("That's an evidence record link, not a credential. Give the credential's ID (urn:uuid:...) or a link containing it.");
    let decoded = text;
    try {
      decoded = decodeURIComponent(text);
    } catch {
      // keep the link as written
    }
    const found = new Set([...decoded.matchAll(URN)].map((m) => m[1]!.toLowerCase()));
    if (found.size > 1) throw new Refusal("That link holds more than one credential ID. Give the one you mean.");
    const idParam = url.searchParams.get("id") ?? "";
    const one = found.size === 1 ? [...found][0]! : ONLY_UUID.test(idParam) ? idParam.toLowerCase() : null;
    if (!one) throw new Refusal("I couldn't find a credential ID in that link. Give the ID itself (urn:uuid:...).");
    const id = `urn:uuid:${one}`;
    return { id, read_as: `Read the ID ${id} from the link.` };
  }
  throw new Refusal("That isn't a credential ID (urn:uuid:...) or a link that contains one.");
}

const POLICY: Record<string, string> = {
  not_permitted: "AI help: not permitted",
  permitted: "AI help: permitted",
  not_reviewed: "AI help: not reviewed (the issuer hasn't said whether AI help is permitted)",
};

/** The platform's three summary stages, in the draft's terms (summary.ts SUMMARY_STAGES). */
const SUMMARY_KEY = { requested: "asked", generated: "generated", displayed: "shown" } as const;

function aiHelp(a: Obj, dropped: string[]): Obj {
  for (const k of Object.keys(a)) if (!["type", "learnlog", "coverage", "instrument", "boundary", "exclusions", "asked", "generated", "shown", "policy", "policyVersion"].includes(k)) dropped.push(`credential.aiHelp.${k}`);
  const stages = byStage((stage) => {
    const key = SUMMARY_KEY[stage as keyof typeof SUMMARY_KEY] as string | undefined;
    if (!key) return { status: NOT_RECORDED, note: "The badge's summary doesn't report this stage." };
    const s = isObj(a[key]) ? a[key] : {};
    if (s.capture === "complete") return { status: "recorded", count: s.count, capture: "complete within the stated boundary" };
    if (s.capture === "partial") return { status: "recorded", count: s.count, capture: "partial: at least this many" };
    return { status: NOT_RECORDED };
  });
  const recordedBy =
    a.coverage === "not_recorded"
      ? "No AI-help record was kept with this evidence, so nothing is known about AI help. Not recorded is not the same as none."
      : { learnlog: a.learnlog, instrument: a.instrument, coverage: str(a.coverage) ? a.coverage.replaceAll("_", " ") : a.coverage, boundary: a.boundary, not_covered: a.exclusions };
  return { policy: str(a.policy) && POLICY[a.policy] ? POLICY[a.policy] : "not stated on this badge", stages, recorded_by: recordedBy };
}

const DOES_NOT_SHOW = [
  "Who holds the badge. The service's report carries no personal data, and this tool shows none.",
  "The evidence events themselves. Only their count and the seal check are reported.",
  "Whether the person can do the work today. A credential is a record of a past assessment.",
  "Anything about AI help beyond the badge's own summary. A stage the summary doesn't cover is not recorded, never none.",
];

async function readCapped(res: Response): Promise<string> {
  const text = await res.text();
  if (text.length > 1_000_000) throw new Refusal("The verify service's answer was too large to be a verification report.");
  return text;
}

export async function verifyCredential(input: { credential: string }, fetchImpl: typeof fetch = fetch): Promise<Obj> {
  const { id, read_as } = credentialIdFrom(input.credential);
  const url = `${VERIFY_URL}?id=${encodeURIComponent(id)}`;
  let res: Response;
  try {
    res = await fetchImpl(url, { method: "GET", redirect: "error", headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new Refusal(`Couldn't reach app.qlmdev.com: ${e instanceof Error ? e.message : String(e)}`);
  }
  const text = await readCapped(res);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // handled by status below
  }
  const service = { url, http_status: res.status };
  const base = { credential_id: id, ...(read_as ? { read_as } : {}), service };
  if (res.status === 404 && isObj(body) && body.error === "not_found") {
    return { ...base, verified: false, result: "not_found", meaning: "app.qlmdev.com has no credential with exactly this ID. It may be mistyped, or not issued by this platform.", does_not_show: DOES_NOT_SHOW };
  }
  if (res.status === 429) throw new Refusal(`The verify service's rate limit was reached. Try again in ${res.headers.get("retry-after") ? `${res.headers.get("retry-after")} seconds` : "a little while"}.`);
  if (res.status === 400 && isObj(body) && str(body.error)) throw new Refusal(`The verify service refused the request (${body.error})${str(body.message) ? `: ${body.message}` : "."}`);
  if (res.status !== 200) throw new Refusal(`The verify service answered HTTP ${res.status}.`);
  const checksOk = isObj(body) && Array.isArray(body.checks) && body.checks.every((c) => isObj(c) && str(c.check) && (c.result === "pass" || c.result === "fail"));
  if (!isObj(body) || typeof body.verified !== "boolean" || !checksOk) throw new Refusal("The verify service's answer wasn't the JSON report this tool expects.");

  const dropped = Object.keys(body).filter((k) => !["verified", "credentialId", "checks", "credential", "notices"].includes(k));
  const checks = (body.checks as Obj[]).map((c) => ({ check: c.check, result: c.result, ...(str(c.detail) ? { detail: c.detail } : {}) }));
  const out: Obj = {
    ...base,
    verified: body.verified,
    checks,
    failed_checks: checks.filter((c) => c.result === "fail").map((c) => ({ check: c.check, detail: c.detail })),
  };
  const c = body.credential;
  if (isObj(c)) {
    for (const k of Object.keys(c)) if (!["issuer", "achievement", "validFrom", "evidenceEventCount", "evidenceLevel", "reissuedFromIssuerRecords", "awardedDate", "aiHelp"].includes(k)) dropped.push(`credential.${k}`);
    const issuer = c.issuer as Obj;
    const achievement = c.achievement as Obj;
    out.issuer = { id: issuer.id, name: issuer.name };
    out.achievement = { id: achievement.id, name: achievement.name, version: achievement.version };
    out.date = { valid_from: c.validFrom, ...(c.awardedDate !== undefined ? { awarded_date: c.awardedDate, reissued_from_issuer_records: c.reissuedFromIssuerRecords === true } : {}) };
    out.evidence = { event_count: c.evidenceEventCount, ...(c.evidenceLevel !== undefined ? { level: c.evidenceLevel } : {}) };
    out.ai_help = isObj(c.aiHelp) ? aiHelp(c.aiHelp, dropped) : "not recorded: this badge carries no AI-help summary (it was issued before the summary existed, or under an older context)";
  } else {
    out.issuer = "not given: the service names the issuer, achievement and date only when every check passes";
  }
  out.notices = Array.isArray(body.notices) ? body.notices.filter(str) : [];
  if (dropped.length) out.fields_not_shown = dropped;
  out.does_not_show = DOES_NOT_SHOW;
  return out;
}
