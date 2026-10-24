#!/usr/bin/env node
// The one live check: a read-only GET to the real verify service with an ID that no credential has.
// Expected answer: not_found. Run after `npm run build`.
import { verifyCredential } from "../dist/tools/verify-credential.js";

const ID = "urn:uuid:00000000-0000-4000-8000-000000000000";
const started = new Date().toISOString();
const r = await verifyCredential({ credential: ID });
console.log(JSON.stringify({ started, request: r.service.url, http_status: r.service.http_status, verified: r.verified, result: r.result }, null, 2));
process.exit(r.result === "not_found" ? 0 : 1);
