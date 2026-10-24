/**
 * How every tool answers. An answer is JSON text, passes through the sealed-content filter, and must
 * carry does_not_show: what the answer cannot tell you. A refusal is an error result with one plain reason.
 */
import { Refusal } from "./files.js";
import { withholdSealed } from "./sealed.js";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: true;
}

/**
 * The most characters of JSON text one answer may carry. Assistants take in only so much at once:
 * Claude Code warns above about 10,000 tokens and rejects above 25,000. 30,000 characters stays under the warning.
 */
export const ANSWER_BUDGET = 30_000;
const n = (x: number) => x.toLocaleString("en-US");

export function answer(body: Record<string, unknown>): ToolResult {
  const limits = body.does_not_show;
  if (!Array.isArray(limits) || limits.length === 0) throw new Error("every answer must say what it does not show (does_not_show)");
  const text = sealedText(body);
  if (text.length > ANSWER_BUDGET) return refuse(`This answer would be ${n(text.length)} characters, more than the ${n(ANSWER_BUDGET)} an assistant can take in at once. Ask for less: a smaller limit, one direction, or fewer kinds.`);
  return { content: [{ type: "text", text }] };
}

/** How many characters of JSON text this body's answer would be (after the sealed-content filter). */
export function answerSize(body: Record<string, unknown>): number {
  return sealedText(body).length;
}

/** The answer's JSON text after the sealed-content filter, with what was withheld named. */
function sealedText(body: Record<string, unknown>): string {
  const { value, withheld } = withholdSealed(body);
  const out = value as Record<string, unknown>;
  if (withheld.length) out.sealed_content_withheld = withheld;
  return JSON.stringify(out, null, 2);
}

export function refuse(message: string): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }], isError: true };
}

/** Runs a tool body and turns what it throws into a refusal. */
export async function guard(body: () => Record<string, unknown> | Promise<Record<string, unknown>>): Promise<ToolResult> {
  try {
    return answer(await body());
  } catch (e) {
    if (e instanceof Refusal) return refuse(e.message);
    return refuse(`Unexpected error: ${e instanceof Error ? e.message : String(e)}`);
  }
}
