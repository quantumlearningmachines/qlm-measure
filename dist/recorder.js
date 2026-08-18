/**
 * Recorder — produce verifiable evidence records without a server.
 *
 * Usage:
 *   import { Recorder } from "qlm-measure";
 *   const rec = new Recorder("learner-001");
 *   rec.append({ correct: true, domain: "math", timestamp: "..." });
 *   const record = rec.export(); // Level 1, verifies clean
 */
import { createHash } from "crypto";
function canonicalize(obj) {
    return JSON.stringify(obj, (_, value) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
            return Object.keys(value).sort().reduce((s, k) => {
                s[k] = value[k];
                return s;
            }, {});
        }
        return value;
    });
}
function sha256(s) {
    return createHash("sha256").update(s).digest("hex");
}
const VALID_SCAFFOLD_TYPES = new Set(["none", "socratic", "probing", "metacognitive", "scaffolding", "explain", "hint", "demonstrate"]);
const VALID_CONSENT_ACTIONS = new Set(["granted", "withdrawn"]);
const VALID_CONSENT_SCOPES = new Set(["instruction", "research", "export"]);
export class Recorder {
    scopeId;
    entries = [];
    currentVersion = 0;
    prevHash = "";
    lastTs = "";
    toleranceMs;
    constructor(scopeId, toleranceMs = 1000) {
        if (!scopeId)
            throw new Error("scopeId is required");
        this.scopeId = scopeId;
        this.toleranceMs = toleranceMs;
    }
    static fromRecord(record) {
        const scopeId = record.studentScopeId || "";
        const rec = new Recorder(scopeId);
        const evidence = record.evidence || {};
        const entries = evidence.entries || record.entries || [];
        const compacted = (evidence.compactedBefore || record.compactedBefore);
        if (compacted) {
            rec.currentVersion = compacted.version;
            rec.prevHash = compacted.summaryHash || "";
        }
        for (const entry of entries) {
            rec.entries.push(entry);
            rec.currentVersion = entry.version;
            rec.prevHash = entry.entryHash;
            rec.lastTs = entry.timestamp;
        }
        return rec;
    }
    append(event) {
        const kind = event.redacted ? "redacted" : (event.action && VALID_CONSENT_ACTIONS.has(event.action)) ? "consent" : "observation";
        // Validate
        if (kind === "observation") {
            const st = event.scaffoldType;
            if (st && !VALID_SCAFFOLD_TYPES.has(st))
                throw new Error(`Invalid scaffoldType: ${st}`);
        }
        if (kind === "consent") {
            if (!VALID_CONSENT_ACTIONS.has(event.action))
                throw new Error(`Invalid consent action`);
            const scopes = event.scopes;
            if (!scopes?.length)
                throw new Error("ConsentEvent must have scopes");
            for (const s of scopes)
                if (!VALID_CONSENT_SCOPES.has(s))
                    throw new Error(`Invalid scope: ${s}`);
        }
        const ts = (event.timestamp || event.at || new Date().toISOString());
        // Monotonicity
        if (this.lastTs && ts) {
            const prev = new Date(this.lastTs).getTime();
            const curr = new Date(ts).getTime();
            if (!isNaN(prev) && !isNaN(curr) && curr < prev - this.toleranceMs) {
                throw new Error(`Timestamp goes backward: ${ts} < ${this.lastTs}`);
            }
        }
        this.currentVersion++;
        const eventHash = sha256(canonicalize(event));
        const entryHash = sha256(canonicalize({
            version: this.currentVersion,
            timestamp: ts,
            eventHash,
            prevHash: this.prevHash,
        }));
        const entry = {
            version: this.currentVersion,
            timestamp: ts,
            eventHash,
            event,
            prevHash: this.prevHash,
            entryHash,
        };
        this.entries.push(entry);
        this.prevHash = entryHash;
        this.lastTs = ts;
        return entry;
    }
    redact(version) {
        const entry = this.entries.find(e => e.version === version);
        if (!entry)
            throw new Error(`No entry with version ${version}`);
        if (entry.event.redacted)
            return;
        entry.event = { redacted: true, eventHash: entry.eventHash };
    }
    chainHead() {
        return this.prevHash;
    }
    export() {
        return {
            schemaVersion: "0.3",
            studentScopeId: this.scopeId,
            evidence: { entries: [...this.entries] },
        };
    }
    get version() {
        return this.currentVersion;
    }
}
//# sourceMappingURL=recorder.js.map