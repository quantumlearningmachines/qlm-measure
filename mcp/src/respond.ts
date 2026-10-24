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

export function answer(body: Record<string, unknown>): ToolResult {
  const limits = body.does_not_show;
  if (!Array.isArray(limits) || limits.length === 0) throw new Error("every answer must say what it does not show (does_not_show)");
  const { value, withheld } = withholdSealed(body);
  const out = value as Record<string, unknown>;
  if (withheld.length) out.sealed_content_withheld = withheld;
  return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
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
