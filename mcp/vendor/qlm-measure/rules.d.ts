/**
 * Public update rule registry.
 * Each rule is a pure function: given inputs, produce a posterior.
 * This module ships with the SDK and has no server dependency.
 */
export type RuleFn = (prior: number, correct: boolean, weight: number, params: Record<string, number>) => number;
export declare function registerRule(ruleId: string, fn: RuleFn): void;
export declare function getRule(ruleId: string): RuleFn | undefined;
export declare function reproduce(ruleId: string, params: Record<string, number>, prior: number, correct: boolean, weight: number): number | null;
//# sourceMappingURL=rules.d.ts.map