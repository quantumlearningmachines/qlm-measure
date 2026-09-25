/**
 * Node binding for the chain schemes: SHA-256 from `node:crypto`, and the
 * sealing / detection / verification functions with the hash pre-bound.
 * Client components import from "qlm-measure/schemes" and supply their own
 * `HashFn` (e.g. Web Crypto) instead.
 */
import { createHash } from "crypto";
import { computeEventHashWith, sealEventWith, detectSchemeWith, verifyChainWith, } from "./index.js";
export const sha256Hex = (s) => createHash("sha256").update(s).digest("hex");
export const computeEventHash = (event, schemeId) => computeEventHashWith(sha256Hex, event, schemeId);
export const sealEvent = (event, schemeId) => sealEventWith(sha256Hex, event, schemeId);
export const detectScheme = (event, family) => detectSchemeWith(sha256Hex, event, family);
export const verifyChain = (events, opts) => verifyChainWith(sha256Hex, events, opts);
export * from "./index.js";
//# sourceMappingURL=node.js.map