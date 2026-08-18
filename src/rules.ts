/**
 * Public update rule registry.
 * Each rule is a pure function: given inputs, produce a posterior.
 * This module ships with the SDK and has no server dependency.
 */

export type RuleFn = (prior: number, correct: boolean, weight: number, params: Record<string, number>) => number;

const registry = new Map<string, RuleFn>();

export function registerRule(ruleId: string, fn: RuleFn): void {
  registry.set(ruleId, fn);
}

export function getRule(ruleId: string): RuleFn | undefined {
  return registry.get(ruleId);
}

export function reproduce(
  ruleId: string, params: Record<string, number>,
  prior: number, correct: boolean, weight: number,
): number | null {
  const fn = getRule(ruleId);
  if (!fn) return null;
  return fn(prior, correct, weight, params);
}

// ── tempered-bkt-1 ─────────────────────────────────────────
// Written from depth_engine/update.py. Spec: rules/tempered-bkt-1.md

function temperedBkt1(prior: number, correct: boolean, weight: number, params: Record<string, number>): number {
  const slip = params.slip;
  const guess = params.guess;

  if (prior <= 0 || prior >= 1) throw new Error(`prior must be in (0, 1), got ${prior}`);
  if (weight < 0 || weight > 1) throw new Error(`weight must be in [0, 1], got ${weight}`);
  if (weight === 0) return prior;

  let pObsMastered: number;
  let pObsNotMastered: number;

  if (correct) {
    pObsMastered = Math.pow(1 - slip, weight);
    pObsNotMastered = Math.pow(guess, weight);
  } else {
    pObsMastered = Math.pow(slip, weight);
    pObsNotMastered = Math.pow(1 - guess, weight);
  }

  const numerator = prior * pObsMastered;
  const denominator = numerator + (1 - prior) * pObsNotMastered;
  const posterior = numerator / denominator;

  return Math.max(1e-15, Math.min(1 - 1e-15, posterior));
}

registerRule("tempered-bkt-1", temperedBkt1);
