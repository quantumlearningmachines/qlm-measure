import { crc32, deflateRawSync } from "node:zlib";

/** A minimal zip writer for test fixtures: stored or deflated members, optional UTF-8 flag. */
export function makeZip(members: { name: string | Buffer; data: Buffer | string; method?: 0 | 8; utf8Flag?: boolean; flags?: number; crcOverride?: number }[], comment = ""): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const m of members) {
    const data = Buffer.isBuffer(m.data) ? m.data : Buffer.from(m.data, "utf8");
    const name = Buffer.isBuffer(m.name) ? m.name : Buffer.from(m.name, "utf8");
    const method = m.method ?? 8;
    const body = method === 8 ? deflateRawSync(data) : data;
    const crc = m.crcOverride ?? crc32(data);
    const flags = (m.flags ?? 0) | (m.utf8Flag ? 0x800 : 0);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc >>> 0, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(3, 28); // extra field length, to check the reader skips it
    const extra = Buffer.from([1, 2, 3]);
    locals.push(local, name, extra, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc >>> 0, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + 3 + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(members.length, 8);
  end.writeUInt16LE(members.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  const c = Buffer.from(comment, "latin1");
  end.writeUInt16LE(c.length, 20);
  return Buffer.concat([...locals, cd, end, c]);
}
