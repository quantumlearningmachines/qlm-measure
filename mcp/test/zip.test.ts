import { describe, expect, it } from "vitest";
import { zipEntries, zipRead } from "../src/zip.js";
import { makeZip } from "./helpers/zip.js";

describe("zip reader", () => {
  it("lists members in central-directory order and reads stored and deflated data", () => {
    const zip = makeZip([
      { name: "hints_dataset/a/1.html", data: "<script>const eventsData = []</script>" },
      { name: "raw_dataset/", data: "", method: 0 },
      { name: "README.md", data: "plain", method: 0 },
    ], "a comment");
    const entries = zipEntries(zip);
    expect(entries.map((e) => e.name)).toEqual(["hints_dataset/a/1.html", "raw_dataset/", "README.md"]);
    expect(zipRead(zip, entries[0]!).toString()).toBe("<script>const eventsData = []</script>");
    expect(zipRead(zip, entries[1]!).length).toBe(0);
    expect(zipRead(zip, entries[2]!).toString()).toBe("plain");
  });
  it("decodes names as UTF-8 when flagged and as cp437 otherwise, as Python's zipfile does", () => {
    const zip = makeZip([
      { name: "hints_dataset/é/1.html", data: "x", utf8Flag: true },
      { name: Buffer.from([0x68, 0x82, 0xe1, 0xff]), data: "y" },
    ]);
    expect(zipEntries(zip).map((e) => e.name)).toEqual(["hints_dataset/é/1.html", "héß "]);
  });
  it("refuses a file that is not a zip", () => {
    expect(() => zipEntries(Buffer.from("not a zip at all"))).toThrow(/File is not a zip file/);
  });
  it("refuses a bad CRC, as Python's zipfile does", () => {
    const zip = makeZip([{ name: "a.txt", data: "hello", crcOverride: 1234 }]);
    expect(() => zipRead(zip, zipEntries(zip)[0]!)).toThrow(/Bad CRC-32 for file 'a.txt'/);
  });
  it("refuses encrypted members and unsupported compression", () => {
    const enc = makeZip([{ name: "a.txt", data: "x", flags: 1 }]);
    expect(() => zipRead(enc, zipEntries(enc)[0]!)).toThrow(/encrypted/);
    const zip = makeZip([{ name: "a.txt", data: "x", method: 0 }]);
    zip.writeUInt16LE(12, 8); // local header method
    const entries = zipEntries(zip);
    const e = { ...entries[0]!, method: 12 };
    expect(() => zipRead(zip, e)).toThrow(/compression method 12 is not supported/);
  });
  it("refuses ZIP64 archives, which this reader does not implement", () => {
    const zip = makeZip([{ name: "a.txt", data: "x" }]);
    zip.writeUInt16LE(0xffff, zip.length - 22 + 10);
    expect(() => zipEntries(zip)).toThrow(/ZIP64/);
  });
  it("refuses a damaged central directory or local header", () => {
    const zip = makeZip([{ name: "a.txt", data: "x" }]);
    const cdOffset = zip.readUInt32LE(zip.length - 22 + 16);
    const broken = Buffer.from(zip);
    broken.writeUInt32LE(0, cdOffset);
    expect(() => zipEntries(broken)).toThrow(/Bad magic number for central directory/);
    const badLocal = Buffer.from(zip);
    badLocal.writeUInt32LE(0, 0);
    expect(() => zipRead(badLocal, zipEntries(badLocal)[0]!)).toThrow(/Bad magic number for file header/);
  });
});
