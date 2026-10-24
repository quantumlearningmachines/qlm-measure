/**
 * A small zip reader: the central directory, then one member at a time, so a 1 GB archive of HTML
 * reports is never held decompressed all at once. It reads what Python's zipfile reads for the
 * pinned Zenodo archive: stored and deflated members, cp437 or UTF-8 names, CRC-32 checked. ZIP64 and
 * encrypted members are refused rather than guessed at.
 */
import { crc32, inflateRawSync } from "node:zlib";

export interface ZipEntry {
  name: string;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■\u00a0";

function cp437(bytes: Buffer): string {
  let s = "";
  for (const b of bytes) s += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80]!;
  return s;
}

/** The members listed in the central directory, in its order (Python's ZipFile.namelist()). */
export function zipEntries(buf: Buffer): ZipEntry[] {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("File is not a zip file");
  const count = buf.readUInt16LE(end + 10);
  const cdSize = buf.readUInt32LE(end + 12);
  const cdOffset = buf.readUInt32LE(end + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error("ZIP64 archives are not supported by this reader");
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let k = 0; k < count; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad magic number for central directory");
    const flags = buf.readUInt16LE(p + 8);
    const nameLength = buf.readUInt16LE(p + 28);
    const raw = buf.subarray(p + 46, p + 46 + nameLength);
    entries.push({
      name: flags & 0x800 ? raw.toString("utf8") : cp437(raw),
      flags,
      method: buf.readUInt16LE(p + 10),
      crc: buf.readUInt32LE(p + 16),
      compressedSize: buf.readUInt32LE(p + 20),
      size: buf.readUInt32LE(p + 24),
      localOffset: buf.readUInt32LE(p + 42),
    });
    p += 46 + nameLength + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
  }
  return entries;
}

/** One member's bytes (Python's ZipFile.read(name)), with its CRC-32 checked. */
export function zipRead(buf: Buffer, e: ZipEntry): Buffer {
  if (e.flags & 1) throw new Error(`File '${e.name}' is encrypted; encrypted members are not supported`);
  const p = e.localOffset;
  if (buf.readUInt32LE(p) !== 0x04034b50) throw new Error("Bad magic number for file header");
  const start = p + 30 + buf.readUInt16LE(p + 26) + buf.readUInt16LE(p + 28);
  const body = buf.subarray(start, start + e.compressedSize);
  let data: Buffer;
  if (e.method === 0) data = Buffer.from(body);
  else if (e.method === 8) data = inflateRawSync(body);
  else throw new Error(`compression method ${e.method} is not supported`);
  if (crc32(data) !== e.crc) throw new Error(`Bad CRC-32 for file '${e.name}'`);
  return data;
}
