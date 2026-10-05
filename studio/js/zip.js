// ─────────────────────────────────────────────────────────────
// Minimal ZIP writer (STORE / no compression — PNGs are already
// compressed, so this is both fastest and lossless).
// Zero dependencies. Streams parts into a Blob at close().
// ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(u8) {
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d = new Date()) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

function u8str(s) { return new TextEncoder().encode(s); }

export class ZipWriter {
  constructor() {
    this.parts = [];
    this.entries = [];
    this.offset = 0;
    this._dt = dosTime();
  }

  get bytes() { return this.offset; }

  /** @param {string} name @param {Uint8Array} data */
  add(name, data) {
    const nameBytes = u8str(name);
    const crc = crc32(data);
    const size = data.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);           // version needed
    local.setUint16(6, 0x0800, true);       // UTF-8 filename flag
    local.setUint16(8, 0, true);            // method: store
    local.setUint16(10, this._dt.time, true);
    local.setUint16(12, this._dt.date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);

    this.parts.push(new Uint8Array(local.buffer), nameBytes, data);
    this.entries.push({ nameBytes, crc, size, offset: this.offset });
    this.offset += 30 + nameBytes.length + size;
    return this;
  }

  close() {
    const central = [];
    let cdSize = 0;
    for (const e of this.entries) {
      const h = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x02014b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 20, true);
      h.setUint16(8, 0x0800, true);
      h.setUint16(10, 0, true);
      h.setUint16(12, this._dt.time, true);
      h.setUint16(14, this._dt.date, true);
      h.setUint32(16, e.crc, true);
      h.setUint32(20, e.size, true);
      h.setUint32(24, e.size, true);
      h.setUint16(28, e.nameBytes.length, true);
      h.setUint32(42, e.offset, true);
      central.push(new Uint8Array(h.buffer), e.nameBytes);
      cdSize += 46 + e.nameBytes.length;
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, this.offset, true);
    const blob = new Blob([...this.parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
    this.parts = []; this.entries = [];
    return blob;
  }
}
