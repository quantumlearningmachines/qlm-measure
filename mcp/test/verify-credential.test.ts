/**
 * verify_credential against a mocked fetch. The response bodies are the exact shapes the platform
 * returns (qlm-platform app/src/lib/credential-platform/http.ts handleVerifyGet, verification.ts
 * VerificationReport and VERIFY_NOTICES, learnlog/summary.ts AiHelpSummary, http-common.ts errors).
 */
import { describe, expect, it } from "vitest";
import { VERIFY_URL, credentialIdFrom, verifyCredential } from "../src/tools/verify-credential.js";

type Obj = Record<string, any>;
const ID = "urn:uuid:3f2b8c1e-9a4d-4e6b-8f1a-2c7d5e9b0a13";

const NOTICES = [
  "Key retirement: an issuer key's retirement time is published in its DID document as \"expires\". Some outside verifiers do not apply it; use /v1/verify to have a badge signed after its key was retired refused.",
  "Suspension: a suspended badge is checked only by QLM's verifier (/v1/verify). The badge's credentialStatus names only its revocation list, so outside verifiers see revocation and not suspension.",
];
const CHECKS = ["signature", "issuer_identity", "validity_period", "issuance_record", "achievement_version", "ratified_mapping", "evidence_seal", "status"].map((check) => ({ check, result: "pass" }));

const verified = (aiHelp?: Obj, extra: Obj = {}) => ({
  verified: true,
  credentialId: ID,
  checks: CHECKS,
  credential: {
    issuer: { id: "did:web:app.qlmdev.com:issuers:example-college", name: "Example College of Nursing" },
    achievement: { id: "https://app.qlmdev.com/achievements/example/rn-assessment", name: "Focused Respiratory Assessment", version: "2" },
    validFrom: "2026-10-21T18:04:11Z",
    evidenceEventCount: 42,
    evidenceLevel: 2,
    ...(aiHelp ? { aiHelp } : {}),
    ...extra,
  },
  notices: NOTICES,
});

const AI_COMPLETE = { type: "QlmAiHelpSummary", learnlog: "draft-srivastava-learnlog-03", coverage: "complete_within_boundary", instrument: "urn:example:instrument", boundary: ["TeachProof Clinical session"], exclusions: ["other devices"], asked: { capture: "complete", count: 2 }, generated: { capture: "complete", count: 2 }, shown: { capture: "complete", count: 0 }, policy: "permitted", policyVersion: 1 };

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const f = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: url instanceof Request ? url.url : url.toString(), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  };
  return { f: f as typeof fetch, calls };
}

describe("reading a credential ID from what the person gives", () => {
  it("accepts the ID, a bare UUID, or a link that contains one", () => {
    expect(credentialIdFrom(ID)).toEqual({ id: ID });
    expect(credentialIdFrom(`  ${ID.toUpperCase().replace("URN:UUID:", "urn:uuid:")}  `)).toEqual({ id: ID });
    expect(credentialIdFrom("3f2b8c1e-9a4d-4e6b-8f1a-2c7d5e9b0a13")).toEqual({ id: ID, read_as: `A bare UUID was read as ${ID}.` });
    expect(credentialIdFrom(`https://app.qlmdev.com/v1/verify?id=${encodeURIComponent(ID)}`)).toEqual({ id: ID, read_as: `Read the ID ${ID} from the link.` });
    expect(credentialIdFrom(`https://www.linkedin.com/feed/?badge=${ID}&x=1`)).toEqual({ id: ID, read_as: `Read the ID ${ID} from the link.` });
    expect(credentialIdFrom("https://app.qlmdev.com/v1/verify?id=3f2b8c1e-9a4d-4e6b-8f1a-2c7d5e9b0a13")).toEqual({ id: ID, read_as: `Read the ID ${ID} from the link.` });
  });
  it("refuses evidence links, ambiguous links, links without an ID, and anything else", () => {
    expect(() => credentialIdFrom("https://app.qlmdev.com/v1/evidence?id=3f2b8c1e-9a4d-4e6b-8f1a-2c7d5e9b0a13")).toThrow(/evidence record link, not a credential/);
    expect(() => credentialIdFrom(`https://x.example/?a=${ID}&b=urn:uuid:00000000-0000-4000-8000-000000000000`)).toThrow(/more than one credential ID/);
    expect(() => credentialIdFrom("https://app.qlmdev.com/badges/me")).toThrow(/couldn't find a credential ID in that link/);
    expect(() => credentialIdFrom("https://x.example/?id=%E0%A4%A")).toThrow(/couldn't find a credential ID in that link/);
    expect(() => credentialIdFrom("not a credential")).toThrow(/isn't a credential ID/);
    expect(() => credentialIdFrom("")).toThrow(/isn't a credential ID/);
    expect(() => credentialIdFrom(`${ID}\n`.repeat(1) + "x")).toThrow(/isn't a credential ID/);
    expect(() => credentialIdFrom("a".repeat(2049))).toThrow(/too long/);
  });
});

describe("verify_credential", () => {
  it("asks app.qlmdev.com only, with the ID and nothing else", async () => {
    const { f, calls } = mockFetch(200, verified(AI_COMPLETE));
    await verifyCredential({ credential: ID }, f);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${VERIFY_URL}?id=${encodeURIComponent(ID)}`);
    expect(VERIFY_URL).toBe("https://app.qlmdev.com/v1/verify");
    expect(calls[0]!.init).toEqual(expect.objectContaining({ method: "GET", redirect: "error" }));
    expect(calls[0]!.init!.body).toBeUndefined();
  });

  it("a verified badge: each check, the issuer, the achievement, the date and AI help by stage", async () => {
    const r = (await verifyCredential({ credential: ID }, mockFetch(200, verified(AI_COMPLETE)).f)) as Obj;
    expect(r.verified).toBe(true);
    expect(r.checks).toEqual(CHECKS);
    expect(r.failed_checks).toEqual([]);
    expect(r.issuer).toEqual({ id: "did:web:app.qlmdev.com:issuers:example-college", name: "Example College of Nursing" });
    expect(r.achievement).toEqual({ id: "https://app.qlmdev.com/achievements/example/rn-assessment", name: "Focused Respiratory Assessment", version: "2" });
    expect(r.date).toEqual({ valid_from: "2026-10-21T18:04:11Z" });
    expect(r.evidence).toEqual({ event_count: 42, level: 2 });
    expect(r.ai_help.policy).toBe("AI help: permitted");
    expect(r.ai_help.stages).toEqual({
      requested: { status: "recorded", count: 2, capture: "complete within the stated boundary" },
      offered: { status: "not recorded", note: "The badge's summary doesn't report this stage." },
      generated: { status: "recorded", count: 2, capture: "complete within the stated boundary" },
      transmitted: { status: "not recorded", note: "The badge's summary doesn't report this stage." },
      displayed: { status: "recorded", count: 0, capture: "complete within the stated boundary" },
      accepted: { status: "not recorded", note: "The badge's summary doesn't report this stage." },
    });
    expect(r.ai_help.recorded_by).toEqual({ learnlog: "draft-srivastava-learnlog-03", instrument: "urn:example:instrument", coverage: "complete within boundary", boundary: ["TeachProof Clinical session"], not_covered: ["other devices"] });
    expect(r.notices).toEqual(NOTICES);
    expect(r).not.toHaveProperty("fields_not_shown");
    expect(r.does_not_show.length).toBeGreaterThan(0);
  });

  it("partial capture is a floor, not recorded is never a zero, and older badges have no AI-help summary", async () => {
    const partial = (await verifyCredential({ credential: ID }, mockFetch(200, verified({ ...AI_COMPLETE, coverage: "partial", asked: { capture: "partial", count: 1 }, generated: { capture: "not_recorded" }, shown: { capture: "not_recorded" }, policy: "not_reviewed" })).f)) as Obj;
    expect(partial.ai_help.stages.requested).toEqual({ status: "recorded", count: 1, capture: "partial: at least this many" });
    expect(partial.ai_help.stages.generated).toEqual({ status: "not recorded" });
    expect(partial.ai_help.policy).toBe("AI help: not reviewed (the issuer hasn't said whether AI help is permitted)");
    const none = (await verifyCredential({ credential: ID }, mockFetch(200, verified({ type: "QlmAiHelpSummary", learnlog: "draft-srivastava-learnlog-03", coverage: "not_recorded", asked: { capture: "not_recorded" }, generated: { capture: "not_recorded" }, shown: { capture: "not_recorded" } })).f)) as Obj;
    expect(none.ai_help.recorded_by).toBe("No AI-help record was kept with this evidence, so nothing is known about AI help. Not recorded is not the same as none.");
    expect(none.ai_help.policy).toBe("not stated on this badge");
    const old = (await verifyCredential({ credential: ID }, mockFetch(200, verified(undefined, { reissuedFromIssuerRecords: true, awardedDate: "2025-05-01" })).f)) as Obj;
    expect(old.ai_help).toBe("not recorded: this badge carries no AI-help summary (it was issued before the summary existed, or under an older context)");
    expect(old.date).toEqual({ valid_from: "2026-10-21T18:04:11Z", awarded_date: "2025-05-01", reissued_from_issuer_records: true });
    expect(old.evidence).toEqual({ event_count: 42, level: 2 });
    const policyNo = (await verifyCredential({ credential: ID }, mockFetch(200, verified({ ...AI_COMPLETE, policy: "not_permitted" })).f)) as Obj;
    expect(policyNo.ai_help.policy).toBe("AI help: not permitted");
  });

  it("a badge that fails a check: the named check and its reason, and no summary", async () => {
    const body = { verified: false, credentialId: ID, checks: CHECKS.map((c) => (c.check === "status" ? { check: "status", result: "fail", detail: "revoked" } : c)), notices: NOTICES };
    const r = (await verifyCredential({ credential: ID }, mockFetch(200, body).f)) as Obj;
    expect(r.verified).toBe(false);
    expect(r.failed_checks).toEqual([{ check: "status", detail: "revoked" }]);
    expect(r.issuer).toBe("not given: the service names the issuer, achievement and date only when every check passes");
    expect(r).not.toHaveProperty("ai_help");
  });

  it("drops any field this version doesn't know, and says which", async () => {
    const r = (await verifyCredential({ credential: ID }, mockFetch(200, { ...verified({ ...AI_COMPLETE, extraAi: 1 }, { holder: "x" }), newTop: 1 }).f)) as Obj;
    expect(r.fields_not_shown).toEqual(["newTop", "credential.holder", "credential.aiHelp.extraAi"]);
    expect(JSON.stringify(r)).not.toMatch(/"holder"|newTop":/);
  });

  it("not_found is an answer, not an error", async () => {
    const r = (await verifyCredential({ credential: "urn:uuid:00000000-0000-4000-8000-000000000000" }, mockFetch(404, { verified: false, error: "not_found" }).f)) as Obj;
    expect(r).toEqual(expect.objectContaining({ verified: false, result: "not_found", credential_id: "urn:uuid:00000000-0000-4000-8000-000000000000" }));
    expect(r.service).toEqual({ url: `${VERIFY_URL}?id=${encodeURIComponent("urn:uuid:00000000-0000-4000-8000-000000000000")}`, http_status: 404 });
  });

  it("passes on the service's refusals in plain words", async () => {
    await expect(verifyCredential({ credential: ID }, mockFetch(400, { error: "invalid_request", message: "pass exactly one id, with no control characters" }).f)).rejects.toThrow(/The verify service refused the request \(invalid_request\): pass exactly one id, with no control characters/);
    await expect(verifyCredential({ credential: ID }, mockFetch(400, { error: "client_address_unknown" }).f)).rejects.toThrow(/\(client_address_unknown\)\.$/);
    await expect(verifyCredential({ credential: ID }, mockFetch(429, { error: "rate_limited" }, { "retry-after": "30" }).f)).rejects.toThrow(/rate limit.*30 seconds/);
    await expect(verifyCredential({ credential: ID }, mockFetch(429, { error: "rate_limited" }).f)).rejects.toThrow(/rate limit.*a little while/);
    await expect(verifyCredential({ credential: ID }, mockFetch(503, "<html>down</html>").f)).rejects.toThrow(/answered HTTP 503/);
    await expect(verifyCredential({ credential: ID }, mockFetch(200, "not json").f)).rejects.toThrow(/wasn't the JSON report this tool expects/);
    await expect(verifyCredential({ credential: ID }, mockFetch(200, { verified: "yes" }).f)).rejects.toThrow(/wasn't the JSON report this tool expects/);
    await expect(verifyCredential({ credential: ID }, mockFetch(200, { verified: true, checks: [{ check: 1 }] }).f)).rejects.toThrow(/wasn't the JSON report this tool expects/);
    await expect(verifyCredential({ credential: ID }, mockFetch(404, { error: "other" }).f)).rejects.toThrow(/answered HTTP 404/);
    await expect(verifyCredential({ credential: ID }, mockFetch(400, ["x"]).f)).rejects.toThrow(/answered HTTP 400/);
    await expect(verifyCredential({ credential: ID }, mockFetch(200, "x".repeat(1_000_001)).f)).rejects.toThrow(/too large/);
  });

  it("says plainly when the service can't be reached", async () => {
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(verifyCredential({ credential: ID }, down)).rejects.toThrow(/Couldn't reach app.qlmdev.com: fetch failed/);
    const weird = (async () => {
      throw "boom"; // eslint-disable-line @typescript-eslint/only-throw-error
    }) as unknown as typeof fetch;
    await expect(verifyCredential({ credential: ID }, weird)).rejects.toThrow(/Couldn't reach app.qlmdev.com: boom/);
  });
});

describe("older or thinner reports", () => {
  it("handles a summary missing a stage, a badge with no evidence level and a report with no notices", async () => {
    const body = verified({ type: "QlmAiHelpSummary", learnlog: "draft-srivastava-learnlog-03", coverage: 5, generated: { capture: "complete", count: 1 }, shown: { capture: "complete", count: 1 } }) as Obj;
    delete body.credential.evidenceLevel;
    delete body.notices;
    const r = (await verifyCredential({ credential: "3f2b8c1e-9a4d-4e6b-8f1a-2c7d5e9b0a13" }, mockFetch(200, body).f)) as Obj;
    expect(r.read_as).toBe(`A bare UUID was read as ${ID}.`);
    expect(r.ai_help.stages.requested).toEqual({ status: "not recorded" });
    expect(r.ai_help.recorded_by.coverage).toBe(5);
    expect(r.evidence).toEqual({ event_count: 42 });
    expect(r.notices).toEqual([]);
  });
});
