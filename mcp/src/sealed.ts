/**
 * Sealed content (answer keys, sealed case variants) never appears in a tool's output. Every answer
 * passes through withholdSealed, which replaces the value of any member with one of these names, at
 * any depth, and reports where it did so.
 */
const SEALED = new Set([
  "answerkey", "answerkeys", "correctanswer", "correctanswers", "expectedanswer", "expectedanswers", "solutionkey", "solutionkeys",
  "sealed", "sealedvariant", "sealedvariants", "sealedcase", "sealedcases", "sealedcontent", "sealeditem", "sealeditems", "sealedanswer", "sealedanswers",
]);
export const WITHHELD = "[withheld: sealed content]";

const isSealed = (key: string) => SEALED.has(key.toLowerCase().replace(/[^a-z0-9]/g, ""));
const member = (path: string, key: string) => (/^[A-Za-z_$][\w$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`);

export function withholdSealed(value: unknown): { value: unknown; withheld: string[] } {
  const withheld: string[] = [];
  const walk = (v: unknown, path: string): unknown => {
    if (Array.isArray(v)) return v.map((x, i) => walk(x, `${path}[${i}]`));
    if (v === null || typeof v !== "object") return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      // defineProperty keeps a member named "__proto__" (source text can use any name) as data.
      const sealed = isSealed(k);
      if (sealed) withheld.push(member(path, k));
      Object.defineProperty(out, k, { value: sealed ? WITHHELD : walk(x, member(path, k)), enumerable: true, writable: true, configurable: true });
    }
    return out;
  };
  return { value: walk(value, "$"), withheld };
}
