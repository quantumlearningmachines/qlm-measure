import { type ChainEvent, type VerifyChainOptions, type ChainVerification } from "./index.js";
export declare const sha256Hex: (s: string) => string;
export declare const computeEventHash: (event: ChainEvent, schemeId: string, prev?: string) => string;
export declare const sealEvent: <E extends ChainEvent>(event: E, schemeId: string, prev?: string) => E;
export declare const detectScheme: (event: ChainEvent, family: string, prev?: string) => string | null;
export declare const verifyChain: (events: ChainEvent[], opts: VerifyChainOptions) => ChainVerification;
export * from "./index.js";
//# sourceMappingURL=node.d.ts.map