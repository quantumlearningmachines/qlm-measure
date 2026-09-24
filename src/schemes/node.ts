/**
 * Node binding for the chain schemes: SHA-256 from `node:crypto`, and the
 * sealing / detection / verification functions with the hash pre-bound.
 * Client components import from "qlm-measure/schemes" and supply their own
 * `HashFn` (e.g. Web Crypto) instead.
 */
import { createHash } from "crypto";
import {
  computeEventHashWith, sealEventWith, detectSchemeWith, verifyChainWith,
  type ChainEvent, type VerifyChainOptions, type ChainVerification,
} from "./index.js";

export const sha256Hex = (s: string): string => createHash("sha256").update(s).digest("hex");

export const computeEventHash = (event: ChainEvent, schemeId: string): string =>
  computeEventHashWith(sha256Hex, event, schemeId);

export const sealEvent = <E extends ChainEvent>(event: E, schemeId: string): E =>
  sealEventWith(sha256Hex, event, schemeId);

export const detectScheme = (event: ChainEvent, family: string): string | null =>
  detectSchemeWith(sha256Hex, event, family);

export const verifyChain = (events: ChainEvent[], opts: VerifyChainOptions): ChainVerification =>
  verifyChainWith(sha256Hex, events, opts);

export * from "./index.js";
