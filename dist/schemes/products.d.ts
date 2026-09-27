/**
 * Product envelope schemes — the per-record hashes QLM products seal besides
 * the clinical chains in ./index.ts. Each is a verbatim, named definition of
 * what the product's own code hashed on the date given; the vectors in
 * schema/vectors/chains were generated from the original functions.
 *
 * This file imports only types from ./index.ts so the two modules do not form
 * a runtime cycle. Python twin: python/qlm_measure/schemes.py.
 */
import type { ChainScheme } from "./index.js";
export declare const PLAY_EMIT_1: ChainScheme;
export declare const PLAY_MEASURE_SESSION_1: ChainScheme;
export declare const PLAY_ENCOUNTER_FNV64_1: ChainScheme;
export declare const PLAY_RESEARCH_PROVENANCE_1: ChainScheme;
export declare const QCORE_QINVERSE_DJB2_1: ChainScheme;
export declare const STUDIO_LOOP_1: ChainScheme;
export declare function canonicalizeRfc8785(value: unknown): string;
export declare const DP_LEDGER_V3: ChainScheme;
export declare const TPC_DSE_JOURNAL_1: ChainScheme;
export declare const YARDSTICK_SPINE_1: ChainScheme;
export declare function sortObjectLocale(value: unknown): unknown;
export declare const LABPATH_LEARNING_EVIDENCE_V1: ChainScheme;
export declare const PRODUCT_SCHEMES: ChainScheme[];
//# sourceMappingURL=products.d.ts.map