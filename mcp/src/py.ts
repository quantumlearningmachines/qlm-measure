/**
 * Python behaviors the preprint's episode scripts depend on, reproduced exactly so that the counts this
 * package computes are the counts the published Python scripts compute on the same files:
 * float(), int(float()), round(x, n), datetime.fromisoformat().timestamp(), str ordering, the json
 * module (raw_decode, NaN, int versus float), re's whitespace and word classes, and the csv module's
 * excel dialect with strict=False.
 */

// ── float() and int(float()) ─────────────────────────────────────────────

const PY_SPACE = "\\t\\n\\x0b\\x0c\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const STRIP = new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, "g");
const DIGITS = "\\d(?:_?\\d)*";
const DECIMAL = new RegExp(`^[+-]?(?:${DIGITS}(?:\\.(?:${DIGITS})?)?|\\.${DIGITS})(?:[eE][+-]?${DIGITS})?$`);
const SPECIAL = /^([+-]?)(nan|inf|infinity)$/i;

/** Python's float(text) for a str argument. */
export function pyFloat(text: string): number {
  const s = text.replace(STRIP, "");
  const special = SPECIAL.exec(s);
  if (special) {
    if (special[2]!.toLowerCase() === "nan") return NaN;
    return special[1] === "-" ? -Infinity : Infinity;
  }
  if (!DECIMAL.test(s)) throw new Error(`could not convert string to float: '${text}'`);
  return Number(s.replaceAll("_", ""));
}

/** Python's int(float(text)). */
export function pyIntOfFloat(text: string): number {
  const f = pyFloat(text);
  if (Number.isNaN(f)) throw new Error("cannot convert float NaN to integer");
  if (!Number.isFinite(f)) throw new Error("cannot convert float infinity to integer");
  return Math.trunc(f) + 0; // + 0 turns -0 into 0, as an int has no sign of zero
}

// ── round(x, n) ──────────────────────────────────────────────────────────

/** Python's round(x, n) for a float: half to even, on the exact binary value. */
export function pyRound(x: number, n: number): number {
  if (!Number.isFinite(x)) return x;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  const hi = view.getUint32(0);
  const lo = view.getUint32(4);
  const negative = hi >>> 31 === 1;
  const exponentBits = (hi >>> 20) & 0x7ff;
  let mantissa = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  let exponent: number;
  if (exponentBits === 0) exponent = -1074;
  else {
    mantissa |= 1n << 52n;
    exponent = exponentBits - 1075;
  }
  if (exponent >= 0) return x; // already an integer
  const scaled = mantissa * 10n ** BigInt(n);
  const divisor = 1n << BigInt(-exponent);
  let q = scaled / divisor;
  const twice = (scaled % divisor) * 2n;
  if (twice > divisor || (twice === divisor && q % 2n === 1n)) q += 1n;
  const result = Number(`${q}e-${n}`);
  return negative ? -result : result;
}

// ── datetime.fromisoformat(text).timestamp() ─────────────────────────────

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[\s\S](\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?(Z|[+-]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)?)?$/u;

function utcMillis(year: number, month: number, day: number, hour: number, minute: number, second: number): number {
  const d = new Date(0);
  d.setUTCFullYear(year, month - 1, day);
  d.setUTCHours(hour, minute, second, 0);
  return d.getTime();
}

/** Python 3.11+ datetime.fromisoformat(text).timestamp(). A time without an offset is local time, as in Python. */
export function pyIsoTimestamp(text: string): number {
  const m = ISO.exec(text);
  const invalid = () => new Error(`Invalid isoformat string: '${text}'`);
  if (!m) throw invalid();
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [hour, minute, second] = [Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  const micro = Number((m[7] ?? "").slice(0, 6).padEnd(6, "0"));
  const check = new Date(0);
  check.setUTCFullYear(year, month - 1, day);
  if (month < 1 || month > 12 || check.getUTCMonth() !== month - 1 || hour > 23 || minute > 59 || second > 59) throw invalid();
  const zone = m[8];
  if (zone === undefined) {
    const local = new Date(2000, 0, 1);
    local.setFullYear(year, month - 1, day);
    local.setHours(hour, minute, second, 0);
    return local.getTime() / 1000 + micro / 1e6;
  }
  let offsetMicros = 0;
  if (zone !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1;
    const [oh, om, os] = zone.slice(1).split(":");
    const [whole, fraction] = (os ?? "0").split(".");
    offsetMicros = sign * ((Number(oh) * 3600 + Number(om) * 60 + Number(whole)) * 1e6 + Number((fraction ?? "").padEnd(6, "0")));
    if (Math.abs(offsetMicros) >= 86400e6) throw invalid(); // Python normalizes minutes and seconds over 59
  }
  const micros = utcMillis(year, month, day, hour, minute, second) * 1000 + micro - offsetMicros;
  return micros / 1e6;
}

// ── str ordering ─────────────────────────────────────────────────────────

/** Python's ordering of str values: by code point, which differs from JavaScript's UTF-16 order above U+FFFF. */
export function compareCodePoints(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i]!.codePointAt(0)! - y[i]!.codePointAt(0)!;
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return x.length === y.length ? 0 : x.length < y.length ? -1 : 1;
}

// ── re.search for the two eventsData patterns ────────────────────────────

const PATTERNS = {
  /** cross_source.py: re.search(r"eventsData\s*=\s*", h) */
  eventsData: new RegExp(`eventsData[${PY_SPACE}]*=[${PY_SPACE}]*`, "u"),
  /** aggregate.py: re.search(r"\bconst\s+eventsData\s*=\s*", text) */
  constEventsData: new RegExp(`(?<![\\p{L}\\p{N}_])const[${PY_SPACE}]+eventsData[${PY_SPACE}]*=[${PY_SPACE}]*`, "u"),
};

/** The end index of the first match of one of the scripts' patterns (Python's match.end()), or -1. */
export function findPy(text: string, pattern: keyof typeof PATTERNS): number {
  const m = PATTERNS[pattern].exec(text);
  return m ? m.index + m[0].length : -1;
}

// ── json ─────────────────────────────────────────────────────────────────

const kinds = new WeakMap<object, Map<string, "int" | "float">>();

/** Whether a number member was written as an int or a float in the JSON text. */
export function numberKind(container: object, key: string): "int" | "float" | undefined {
  return kinds.get(container)?.get(key);
}

/** type(obj.get(key)).__name__ as Python would print it for a value decoded by the json module. */
export function pyTypeName(container: Record<string, unknown>, key: string): string {
  const v = Object.hasOwn(container, key) ? container[key] : null;
  if (v === null || v === undefined) return "NoneType";
  if (typeof v === "number") return numberKind(container, key) ?? (Number.isInteger(v) ? "int" : "float");
  if (typeof v === "string") return "str";
  if (typeof v === "boolean") return "bool";
  return Array.isArray(v) ? "list" : "dict";
}

const NUMBER = /-?(?:0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?/y;
const ESC: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };

/**
 * Python's json.JSONDecoder().raw_decode(text, start): the first JSON value starting exactly at
 * `start` (no whitespace is skipped there), and the index just after it.
 */
export function parsePyJson(text: string, start = 0): { value: unknown; end: number } {
  let i = start;
  const fail = (what: string): never => {
    throw new Error(`JSON: ${what} at ${i}`);
  };
  const ws = () => {
    for (let c = text.charCodeAt(i); c === 32 || c === 9 || c === 10 || c === 13; c = text.charCodeAt(++i));
  };
  const str = (): string => {
    i++;
    let out = "";
    let run = i;
    for (;;) {
      if (i >= text.length) fail("unterminated string");
      const c = text.charCodeAt(i);
      if (c === 34) {
        out += text.slice(run, i);
        i++;
        return out;
      }
      if (c < 32) fail("invalid control character");
      if (c === 92) {
        out += text.slice(run, i);
        const e = text[i + 1] ?? "";
        if (e === "u") {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid \\uXXXX escape");
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
        } else {
          if (!Object.hasOwn(ESC, e)) fail("invalid \\escape");
          out += ESC[e]!;
          i += 2;
        }
        run = i;
        continue;
      }
      i++;
    }
  };
  const value = (): unknown => {
    const c = text[i];
    if (c === "{") {
      i++;
      const obj: Record<string, unknown> = {};
      const k = new Map<string, "int" | "float">();
      kinds.set(obj, k);
      ws();
      if (text[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        if (text[i] !== '"') fail("expecting property name enclosed in double quotes");
        const key = str();
        ws();
        if (text[i] !== ":") fail("expecting ':' delimiter");
        i++;
        ws();
        const at = i;
        const v = value();
        Object.defineProperty(obj, key, { value: v, enumerable: true, writable: true, configurable: true });
        if (typeof v === "number") {
          NUMBER.lastIndex = at;
          const m = NUMBER.exec(text);
          k.set(key, m && m.index === at && m[1] === undefined && m[2] === undefined ? "int" : "float");
        } else k.delete(key);
        ws();
        if (text[i] === "}") {
          i++;
          return obj;
        }
        if (text[i] !== ",") fail("expecting ',' delimiter");
        i++;
        ws();
      }
    }
    if (c === "[") {
      i++;
      const arr: unknown[] = [];
      ws();
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value());
        ws();
        if (text[i] === "]") {
          i++;
          return arr;
        }
        if (text[i] !== ",") fail("expecting ',' delimiter");
        i++;
        ws();
      }
    }
    if (c === '"') return str();
    for (const [word, v] of [["null", null], ["true", true], ["false", false], ["NaN", NaN], ["Infinity", Infinity], ["-Infinity", -Infinity]] as const) {
      if (text.startsWith(word, i)) {
        i += word.length;
        return v;
      }
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (!m) return fail("expecting value");
    i += m[0].length;
    const n = Number(m[0]);
    return m[1] === undefined && m[2] === undefined ? n + 0 : n;
  };
  const v = value();
  return { value: v, end: i };
}

/** Python's json.loads(text): whitespace around one value, and nothing else. */
export function loadsPyJson(text: string): unknown {
  let i = 0;
  while (" \t\n\r".includes(text[i] ?? "x")) i++;
  const { value, end } = parsePyJson(text, i);
  let j = end;
  while (" \t\n\r".includes(text[j] ?? "x")) j++;
  if (j !== text.length) throw new Error(`JSON: extra data at ${j}`);
  return value;
}

// ── csv ──────────────────────────────────────────────────────────────────

const FIELD_LIMIT = 131072;
const enum S { StartRecord, StartField, InField, InQuoted, QuoteInQuoted, EatCrnl }

/**
 * Python's csv.reader with the excel dialect and strict=False, fed text in chunks. Blank lines are
 * dropped, as csv.DictReader drops them. A field over Python's default limit of 131072 characters
 * raises the error Python raises.
 */
export class PyCsv {
  private state: S = S.StartRecord;
  private field = "";
  private row: string[] = [];

  push(chunk: string): string[][] {
    const rows: string[][] = [];
    let i = 0;
    const n = chunk.length;
    const add = (s: string) => {
      if (this.field.length + s.length > FIELD_LIMIT) throw new Error(`field larger than field limit (${FIELD_LIMIT})`);
      this.field += s;
    };
    const save = () => {
      this.row.push(this.field);
      this.field = "";
    };
    const endRow = () => {
      save();
      rows.push(this.row);
      this.row = [];
    };
    while (i < n) {
      const c = chunk.charCodeAt(i);
      switch (this.state) {
        case S.StartRecord:
        case S.EatCrnl:
          if (c === 13 || c === 10) {
            this.state = S.EatCrnl;
            i++;
            break;
          }
          this.state = S.StartField;
          break;
        case S.StartField:
          if (c === 34) this.state = S.InQuoted;
          else if (c === 44) save();
          else if (c === 13 || c === 10) {
            endRow();
            this.state = S.EatCrnl;
          } else this.state = S.InField;
          if (this.state !== S.InField) i++;
          break;
        case S.InField: {
          let j = i;
          while (j < n) {
            const d = chunk.charCodeAt(j);
            if (d === 44 || d === 13 || d === 10) break;
            j++;
          }
          add(chunk.slice(i, j));
          i = j;
          if (i < n) {
            if (chunk.charCodeAt(i) === 44) {
              save();
              this.state = S.StartField;
            } else {
              endRow();
              this.state = S.EatCrnl;
            }
            i++;
          }
          break;
        }
        case S.InQuoted: {
          const j = chunk.indexOf('"', i);
          const stop = j < 0 ? n : j;
          add(chunk.slice(i, stop));
          i = stop;
          if (j >= 0) {
            this.state = S.QuoteInQuoted;
            i++;
          }
          break;
        }
        case S.QuoteInQuoted:
          if (c === 34) {
            add('"');
            this.state = S.InQuoted;
            i++;
          } else if (c === 44) {
            save();
            this.state = S.StartField;
            i++;
          } else if (c === 13 || c === 10) {
            endRow();
            this.state = S.EatCrnl;
            i++;
          } else this.state = S.InField;
          break;
      }
    }
    return rows;
  }

  /** The last record, when the text does not end with a newline. */
  end(): string[][] {
    if (this.state === S.StartRecord || this.state === S.EatCrnl) return [];
    this.row.push(this.field);
    const last = this.row;
    this.row = [];
    this.field = "";
    this.state = S.StartRecord;
    return [last];
  }
}
