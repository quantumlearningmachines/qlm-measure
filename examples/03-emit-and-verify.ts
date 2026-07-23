/**
 * Example 03: Build an evidence record, tamper with it, watch the verifier catch it
 *
 * Demonstrates the verifier's integrity checking:
 * 1. Build a valid evidence record with hash chaining
 * 2. Verify it passes
 * 3. Tamper with a posterior value
 * 4. Verify it fails — the verifier catches the tampering
 *
 * Run: npx tsx examples/03-emit-and-verify.ts
 */

import { verifyRecord, hashEntry, sha256, canonicalize } from "../src/verifier";
import type { EvidenceRecord, EvidenceEntry } from "../src/schema/evidence-record";
import type { ObservationEvent } from "../src/schema/observation-event";

function buildEntry(
  version: number,
  correct: boolean,
  priorPosterior: number,
  updatedPosterior: number,
  prevHash: string,
): EvidenceEntry {
  const event: ObservationEvent = {
    studentId: "student-demo-001",
    sessionId: "session-001",
    source: "example",
    timestamp: new Date(Date.now() + version * 60000).toISOString(),
    correct,
    responseTimeMs: 3000 + Math.random() * 5000,
    domain: "math",
  };

  const hashable = {
    version,
    timestamp: event.timestamp,
    event,
    scaffoldType: "none" as const,
    depthLevel: "conceptual" as const,
    epistemicMode: "experience" as const,
    triageResult: (correct ? "correct" : "misconception") as const,
    evidentialWeight: 0.85,
    priorPosterior,
    updatedPosterior,
    nonInterventionDecision: null,
  };

  const entryHash = sha256(canonicalize(hashable));

  return {
    version,
    timestamp: event.timestamp,
    event,
    scaffoldType: "none",
    depthLevel: "conceptual",
    epistemicMode: "experience",
    triageResult: correct ? "correct" : "misconception",
    evidentialWeight: 0.85,
    priorPosterior,
    updatedPosterior,
    entryHash,
    prevHash,
  };
}

function main() {
  console.log("=== Example 03: Evidence Record Verification ===\n");

  // Step 1: Build a valid 5-entry record
  console.log("1. Building a valid evidence record (5 entries)...\n");

  const entries: EvidenceEntry[] = [];
  let prevHash = "";
  const posteriors = [0.20, 0.30, 0.40, 0.33, 0.45, 0.55];

  for (let i = 0; i < 5; i++) {
    const entry = buildEntry(
      i + 1,
      i !== 2, // Entry 3 is incorrect
      posteriors[i],
      posteriors[i + 1],
      prevHash,
    );
    entries.push(entry);
    prevHash = entry.entryHash;

    console.log(`  Entry ${entry.version}: correct=${i !== 2}, posterior ${posteriors[i].toFixed(2)} -> ${posteriors[i + 1].toFixed(2)}`);
  }

  const record: EvidenceRecord = {
    studentScopeId: "student-demo-001",
    entries,
  };

  // Step 2: Verify the valid record
  console.log("\n2. Verifying the valid record...\n");
  const validResult = verifyRecord(record);
  console.log(`  Valid: ${validResult.valid}`);
  console.log(`  Violations: ${validResult.violations.length}`);
  console.log(`  Entries checked: ${validResult.entriesChecked}`);

  // Step 3: Tamper with a posterior value
  console.log("\n3. Tampering with entry 3's updatedPosterior (0.28 -> 0.90)...\n");
  const tamperedRecord: EvidenceRecord = {
    ...record,
    entries: record.entries.map((e, i) =>
      i === 2 ? { ...e, updatedPosterior: 0.90 } : e
    ),
  };

  // Step 4: Verify the tampered record
  console.log("4. Verifying the tampered record...\n");
  const tamperedResult = verifyRecord(tamperedRecord);
  console.log(`  Valid: ${tamperedResult.valid}`);
  console.log(`  Violations: ${tamperedResult.violations.length}`);
  for (const v of tamperedResult.violations) {
    console.log(`  [${v.category}] v${v.version}: ${v.message}`);
  }

  console.log("\n=== The verifier caught the tampering. ===");
  console.log("It checked bookkeeping integrity (hash chain + posterior chain)");
  console.log("without computing any posteriors or containing any estimation math.\n");
}

main();
