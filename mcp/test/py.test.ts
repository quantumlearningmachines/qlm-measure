import { describe, expect, it } from "vitest";
import {
  PyCsv,
  loadsPyJson,
  compareCodePoints,
  findPy,
  numberKind,
  parsePyJson,
  pyFloat,
  pyIntOfFloat,
  pyIsoTimestamp,
  pyRound,
  pyTypeName,
} from "../src/py.js";

describe("pyFloat: Python float() on text", () => {
  it("parses what Python parses", () => {
    expect(pyFloat("1")).toBe(1);
    expect(pyFloat(" 2.5 ")).toBe(2.5);
    expect(pyFloat("-1e-3")).toBe(-0.001);
    expect(pyFloat("1_000")).toBe(1000);
    expect(pyFloat(".5")).toBe(0.5);
    expect(pyFloat("5.")).toBe(5);
    expect(pyFloat("+3")).toBe(3);
    expect(pyFloat("inf")).toBe(Infinity);
    expect(pyFloat("-Infinity")).toBe(-Infinity);
    expect(Number.isNaN(pyFloat("NaN"))).toBe(true);
  });
  it("refuses what Python refuses", () => {
    for (const bad of ["", "abc", "1__0", "_1", "1_", "0x10", "1e", "--1", "1.2.3"]) {
      expect(() => pyFloat(bad), bad).toThrow(/could not convert string to float/);
    }
  });
});

describe("pyIntOfFloat: Python int(float(x))", () => {
  it("truncates toward zero", () => {
    expect(pyIntOfFloat("3.9")).toBe(3);
    expect(pyIntOfFloat("-3.9")).toBe(-3);
    expect(pyIntOfFloat("0")).toBe(0);
  });
  it("refuses NaN and infinity as Python does", () => {
    expect(() => pyIntOfFloat("nan")).toThrow(/cannot convert float NaN to integer/);
    expect(() => pyIntOfFloat("inf")).toThrow(/cannot convert float infinity to integer/);
  });
});

describe("pyRound: Python round(x, 1)", () => {
  it("rounds half to even on the exact binary value", () => {
    expect(pyRound(0.25, 1)).toBe(0.2);
    expect(pyRound(0.35, 1)).toBe(0.3); // 0.35 is below .35 in binary
    expect(pyRound(0.75, 1)).toBe(0.8);
    expect(pyRound(39.08566275924256, 1)).toBe(39.1);
    expect(pyRound(-0.25, 1)).toBe(-0.2);
    expect(pyRound(-2.96, 1)).toBe(-3);
    expect(pyRound(71.0, 1)).toBe(71);
    expect(pyRound(0.94, 1)).toBe(0.9);
    expect(pyRound(9.96, 1)).toBe(10);
  });
  it("keeps non-finite values", () => {
    expect(pyRound(Infinity, 1)).toBe(Infinity);
    expect(Number.isNaN(pyRound(NaN, 1))).toBe(true);
  });
});

describe("pyIsoTimestamp: datetime.fromisoformat(s).timestamp()", () => {
  it("reads explicit offsets and microseconds exactly", () => {
    expect(pyIsoTimestamp("2025-02-14T20:55:16.064000+01:00")).toBe(1739562916.064);
    expect(pyIsoTimestamp("2025-02-06 19:23:51.127000+00:00")).toBe(1738869831.127);
    expect(pyIsoTimestamp("2025-02-06 19:23:51+00:00")).toBe(1738869831);
    expect(pyIsoTimestamp("2025-02-06T19:23:51Z")).toBe(1738869831);
    expect(pyIsoTimestamp("2025-02-06T19:23:51.1234567-05:30")).toBe(1738889631.123456);
    expect(pyIsoTimestamp("2025-02-06T19:23-01:00")).toBe(1738869780 + 3600);
    expect(pyIsoTimestamp("2025-02-06T19:23:51.5+01:00:30")).toBe(1738869831.5 - 3630);
    expect(pyIsoTimestamp("2025-02-06")).toBe(new Date(2025, 1, 6).getTime() / 1000);
  });
  it("reads a time without an offset as local time, as Python does", () => {
    expect(pyIsoTimestamp("2025-02-06T19:23:51.250")).toBe(new Date(2025, 1, 6, 19, 23, 51).getTime() / 1000 + 0.25);
  });
  it("refuses text Python refuses", () => {
    for (const bad of ["2025-02-30T00:00:00", "2025-13-01", "20250206", "2025-02-06T25:00:00", "2025-02-06T19:61", "2025-02-06T19:23:61", "nope", "2025-02-06T19:23:51+0100x"]) {
      expect(() => pyIsoTimestamp(bad), bad).toThrow(/Invalid isoformat string/);
    }
  });
  it("handles years before 100", () => {
    const d = new Date(0);
    d.setUTCFullYear(50, 0, 1);
    expect(pyIsoTimestamp("0050-01-01T00:00:00+00:00")).toBe(d.getTime() / 1000);
  });
});

describe("compareCodePoints: Python str ordering", () => {
  it("orders by code point, not UTF-16 unit", () => {
    const a = "\u{1F600}"; // surrogate pair, code point 0x1F600
    const b = "\uFF5E"; // single unit 0xFF5E, smaller code point
    expect([a, b].sort()).toEqual([a, b]); // JavaScript's default puts the pair first
    expect([a, b].sort(compareCodePoints)).toEqual([b, a]);
    expect(compareCodePoints("a", "a")).toBe(0);
    expect(compareCodePoints("ab", "a")).toBe(1);
    expect(compareCodePoints("a", "ab")).toBe(-1);
  });
});

describe("findPy: Python re.search for the eventsData assignment", () => {
  it("matches Python's whitespace class", () => {
    expect(findPy("x eventsData\u001c=\u0085[1]", "eventsData")).toBe(15);
    expect(findPy("eventsData = [", "eventsData")).toBe(13);
    expect(findPy("nothing here", "eventsData")).toBe(-1);
  });
  it("needs a word boundary and whitespace before eventsData in the const form", () => {
    expect(findPy("const eventsData=[]", "constEventsData")).toBe(17);
    expect(findPy("xconst eventsData=[]", "constEventsData")).toBe(-1);
    expect(findPy("éconst eventsData=[]", "constEventsData")).toBe(-1);
    expect(findPy("= const   eventsData =\t[]", "constEventsData")).toBe(23);
    expect(findPy("consteventsData=[]", "constEventsData")).toBe(-1);
    expect(findPy("const eventsData [", "constEventsData")).toBe(-1);
  });
});

describe("parsePyJson: Python json semantics", () => {
  it("decodes a value and reports where it ends (raw_decode)", () => {
    const text = 'var x = [{"a": 1, "b": 2.0}, "s"]; more';
    const r = parsePyJson(text, 8);
    expect(r.value).toEqual([{ a: 1, b: 2 }, "s"]);
    expect(text.slice(r.end)).toBe("; more");
  });
  it("tells integers from floats like Python's json", () => {
    const { value } = parsePyJson('{"i": 100, "f": 100.0, "e": 1e2, "s": "x", "n": null, "t": true, "l": [], "o": {}}');
    const o = value as Record<string, unknown>;
    expect(pyTypeName(o, "i")).toBe("int");
    expect(pyTypeName(o, "f")).toBe("float");
    expect(pyTypeName(o, "e")).toBe("float");
    expect(pyTypeName(o, "s")).toBe("str");
    expect(pyTypeName(o, "n")).toBe("NoneType");
    expect(pyTypeName(o, "missing")).toBe("NoneType");
    expect(pyTypeName(o, "t")).toBe("bool");
    expect(pyTypeName(o, "l")).toBe("list");
    expect(pyTypeName(o, "o")).toBe("dict");
    expect(numberKind(o, "i")).toBe("int");
    expect(numberKind({}, "i")).toBe(undefined);
  });
  it("accepts NaN and Infinity, keeps the last duplicate, and keeps __proto__ as data", () => {
    const { value } = parsePyJson('{"a": NaN, "b": Infinity, "c": -Infinity, "d": 1, "d": 2, "__proto__": 5}');
    const o = value as Record<string, unknown>;
    expect(Number.isNaN(o.a)).toBe(true);
    expect(o.b).toBe(Infinity);
    expect(o.c).toBe(-Infinity);
    expect(o.d).toBe(2);
    expect(Object.getOwnPropertyDescriptor(o, "__proto__")?.value).toBe(5);
    expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
  });
  it("decodes string escapes, including lone surrogates", () => {
    const { value } = parsePyJson('["a\\"b\\\\c\\/d\\b\\f\\n\\r\\t", "\\u00e9\\ud83d\\ude00", "\\ud800"]');
    expect(value).toEqual(['a"b\\c/d\b\f\n\r\t', "é😀", "\ud800"]);
  });
  it("parses nested structures and whitespace", () => {
    expect(loadsPyJson(' { "a" : [ 1 , { "b" : [ ] } ] , "c" : -0.5e+1 } ')).toEqual({ a: [1, { b: [] }], c: -5 });
    expect(loadsPyJson("-0")).toBe(0); // an int, so no negative zero
    expect(loadsPyJson("-0.0")).toBe(-0);
    expect(loadsPyJson("12345678901234567890")).toBe(12345678901234567000);
  });
  it("refuses what Python's json refuses", () => {
    for (const bad of ["", "[1,]", "{\"a\" 1}", "{\"a\":1,}", "{1:2}", "\"\u0001\"", "\"abc", "\"\\x\"", "\"\\u12\"", "01", "1.", "-", "tru", "[1 2]", "{\"a\":1 \"b\":2}", "nul", "[", "{"]) {
      expect(() => loadsPyJson(bad), JSON.stringify(bad)).toThrow(/JSON/);
    }
  });
  it("does not skip leading whitespace in raw_decode", () => {
    expect(() => parsePyJson(" [1]")).toThrow(/JSON: expecting value at 0/);
  });
  it("stops at the end of the first value", () => {
    expect(parsePyJson("[1] [2]").end).toBe(3);
    expect(parsePyJson("true,").end).toBe(4);
  });
});

describe("PyCsv: Python's csv module, excel dialect, strict=False", () => {
  const all = (...chunks: string[]) => {
    const csv = new PyCsv();
    const rows: string[][] = [];
    for (const c of chunks) rows.push(...csv.push(c));
    rows.push(...csv.end());
    return rows;
  };
  it("splits fields and records", () => {
    expect(all("a,b\r\n1,2\n3,4\r5,6")).toEqual([["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"]]);
  });
  it("handles quotes, doubled quotes, delimiters and newlines inside quotes", () => {
    expect(all('"a,b","c""d","e\r\nf",g\n')).toEqual([["a,b", 'c"d', "e\r\nf", "g"]]);
  });
  it("keeps a quote inside an unquoted field and text after a closing quote, as strict=False does", () => {
    expect(all('ab"c,"x"y,z\n')).toEqual([['ab"c', "xy", "z"]]);
  });
  it("skips blank lines and keeps empty fields", () => {
    expect(all("a,b\n\n\r\n,\n")).toEqual([["a", "b"], ["", ""]]);
  });
  it("works across chunk boundaries anywhere, including inside \\r\\n and quotes", () => {
    const text = 'h1,h2\r\n"q,""1""\r\nx",2\r\n3,"4"\r\n';
    const expected = all(text);
    for (let i = 0; i <= text.length; i++) expect(all(text.slice(0, i), text.slice(i))).toEqual(expected);
  });
  it("ends a record at the end of input without a newline, including a quoted field", () => {
    expect(all('a,"b"')).toEqual([["a", "b"]]);
    expect(all("a,")).toEqual([["a", ""]]);
    expect(all("")).toEqual([]);
  });
  it("keeps an unterminated quoted field at the end, as Python does when strict is off", () => {
    expect(all('a,"b')).toEqual([["a", "b"]]);
    expect(all('"x\ny')).toEqual([["x\ny"]]);
  });
  it("refuses fields over Python's default limit of 131072 characters", () => {
    expect(() => all("a," + "x".repeat(131073) + "\n")).toThrow(/field larger than field limit \(131072\)/);
    expect(() => all('"' + "x".repeat(131073) + '"\n')).toThrow(/field larger than field limit/);
    expect(all("x".repeat(131072) + "\n")[0]?.[0]?.length).toBe(131072);
  });
});

describe("edge cases Python handles", () => {
  it("rounds subnormal and integral values", () => {
    expect(pyRound(5e-324, 1)).toBe(0);
    expect(pyRound(1.5e-310, 1)).toBe(0);
    expect(pyRound(123456789012345680000, 1)).toBe(123456789012345680000);
  });
  it("reads fractional offset seconds and refuses impossible offsets", () => {
    expect(pyIsoTimestamp("2025-02-06T19:23:51+01:00:30.25")).toBe(1738866200.75);
    expect(pyIsoTimestamp("2025-02-06T19:23:51+01:60")).toBe(1738862631);
    expect(pyIsoTimestamp("2025-02-06T19:23:51+01:00:60")).toBe(1738866171);
    expect(pyIsoTimestamp("2025-02-06T19:23:51-23:59:59.999999")).toBe(1738956230.999999);
    expect(() => pyIsoTimestamp("2025-02-06T19:23:51+24:00")).toThrow(/Invalid isoformat string/);
  });
  it("orders single code points both ways", () => {
    expect(compareCodePoints("b", "a")).toBe(1);
    expect(compareCodePoints("a", "b")).toBe(-1);
  });
  it("names the type of values that did not come from the parser", () => {
    expect(pyTypeName({ i: 1, f: 1.5, u: undefined }, "i")).toBe("int");
    expect(pyTypeName({ i: 1, f: 1.5 }, "f")).toBe("float");
    expect(pyTypeName({ u: undefined }, "u")).toBe("NoneType");
  });
  it("refuses a backslash at the very end of the text", () => {
    expect(() => loadsPyJson('"\\')).toThrow(/invalid \\escape/);
  });
});
