/**
 * Recorder — produce verifiable evidence records without a server.
 *
 * Usage:
 *   import { Recorder } from "qlm-measure";
 *   const rec = new Recorder("learner-001");
 *   rec.append({ correct: true, domain: "math", timestamp: "..." });
 *   const record = rec.export(); // Level 1, verifies clean
 */
export interface EvidenceEntry03 {
    version: number;
    timestamp: string;
    eventHash: string;
    event: Record<string, unknown>;
    prevHash: string;
    entryHash: string;
}
export declare class Recorder {
    private scopeId;
    private entries;
    private currentVersion;
    private prevHash;
    private lastTs;
    private toleranceMs;
    constructor(scopeId: string, toleranceMs?: number);
    static fromRecord(record: Record<string, unknown>): Recorder;
    append(event: Record<string, unknown>): EvidenceEntry03;
    redact(version: number): void;
    chainHead(): string;
    export(): Record<string, unknown>;
    get version(): number;
}
//# sourceMappingURL=recorder.d.ts.map