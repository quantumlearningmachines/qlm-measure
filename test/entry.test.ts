import { describe, it, expect } from "vitest";
import * as entry from "../src/index.js";
import * as enums from "../src/schema/enums.js";
import * as record from "../src/schema/evidence-record.js";
import * as emitter from "../src/emitter/measurement-emitter.js";
import * as verify from "../src/verifier/verify-record.js";
import * as replay from "../src/verifier/replay.js";
import * as hash from "../src/verifier/hash.js";
import * as checks from "../src/checks.js";
import * as rules from "../src/rules.js";
import * as recorder from "../src/recorder.js";
import * as v03 from "../src/verifier-v03.js";
import * as ontology from "../src/clients/ontology-client.js";
import * as engine from "../src/clients/engine-client.js";
import * as schemes from "../src/schemes/index.js";
import * as products from "../src/schemes/products.js";
import * as node from "../src/schemes/node.js";

// The package entry point (src/index.ts) re-exports these names, each the very value its own module exports.
const SOURCES: [Record<string, unknown>, string[]][] = [
  [enums, ["toPublicEpistemicMode"]],
  [record, ["COMPACTION_RETENTION"]],
  [emitter, ["MeasurementEmitter"]],
  [verify, ["verifyRecord"]],
  [replay, ["replayToVersion", "posteriorAtVersion", "summarizeToVersion"]],
  [hash, ["hashEntry", "hashCanonical", "canonicalize", "sha256"]],
  [checks, ["CATALOG", "CATALOG_BY_ID", "SHIPPED_CHECKS", "PLANNED_CHECKS", "CATEGORIES"]],
  [rules, ["reproduce", "registerRule", "getRule"]],
  [recorder, ["Recorder"]],
  [v03, ["verifyRecordV03"]],
  [ontology, ["OntologyClient"]],
  [engine, ["EngineClient"]],
  [schemes, ["SCHEMES", "getScheme", "familySchemes", "listSchemes", "sortKeysDeep", "protoKeyPath", "TPC_CLINICAL_V1", "TPC_CLINICAL_V2", "TPC_CLINICAL_V3", "TPC_CLINICAL_V4", "PLAY_CLINICAL_1_0", "TPC_SIGNALS",
    "computeEventHashWith", "computeEventHashAsyncWith", "sealEventWith", "detectSchemeWith", "verifyChainWith", "fnv1a64Hex", "djb2Hex", "digestFor", "linkOf"]],
  [products, ["PRODUCT_SCHEMES", "PLAY_EMIT_1", "PLAY_MEASURE_SESSION_1", "PLAY_ENCOUNTER_SHA256_1", "PLAY_ENCOUNTER_FNV64_1", "PLAY_RESEARCH_PROVENANCE_1", "QCORE_QINVERSE_DJB2_1", "STUDIO_LOOP_1", "DP_LEDGER_V3",
    "TPC_DSE_JOURNAL_1", "YARDSTICK_SPINE_1", "LABPATH_LEARNING_EVIDENCE_V1", "TPC_TRANSCRIPT_1", "TPC_DIFFERENTIAL_COMMIT_1", "TPC_DIFFERENTIAL_COMMIT_2", "TPC_RCT_INPUT_1", "canonicalizeRfc8785", "sortObjectLocale"]],
  [node, ["computeEventHash", "sealEvent", "detectScheme", "verifyChain", "sha256Hex"]],
];

describe("the package entry point", () => {
  it("re-exports exactly these names, each the same value as in its own module", () => {
    const names = SOURCES.flatMap(([, n]) => n);
    expect(Object.keys(entry).sort()).toEqual([...names].sort());
    for (const [mod, list] of SOURCES) for (const n of list) {
      expect(mod[n], n).toBeDefined();
      expect((entry as Record<string, unknown>)[n], n).toBe(mod[n]);
    }
    expect(entry.getScheme("play/encounter-sha256-1")).toBe(entry.PLAY_ENCOUNTER_SHA256_1);
  });
});
