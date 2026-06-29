/**
 * Zero-dependency PWA icon generator. Draws the Samadhan mark — a white hexagon
 * (Setu's ⬡) on a civic-teal (#0E6F6B, Doc 3) field — and writes PNGs to
 * public/icons/. Run once; the PNGs are committed.
 *
 *   node scripts/gen-icons.mjs
 *
 * Pure Node (zlib) PNG encoder so there's no image dependency.
 */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'public', 'icons');

const BG = [0x0e, 0x6f, 0x6b]; // --civic
const FG = [0xff, 0xff, 0xff]; // white hexagon

// CRC32 (PNG)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

// Pointy-top regular hexagon vertices.
function hexVertices(cx, cy, r) {
  const v = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    v.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return v;
}
function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function makePng(size, hexFactor) {
  const poly = hexVertices(size / 2, size / 2, size * hexFactor);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter byte: none
    for (let x = 0; x < size; x++) {
      const c = pointInPoly(x + 0.5, y + 0.5, poly) ? FG : BG;
      raw[o++] = c[0]; raw[o++] = c[1]; raw[o++] = c[2]; raw[o++] = 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync(OUT, { recursive: true });
const targets = [
  ['icon-192.png', 192, 0.34],
  ['icon-512.png', 512, 0.34],
  ['icon-maskable-512.png', 512, 0.28], // extra padding for the maskable safe zone
  ['apple-touch-icon.png', 180, 0.34],
];
for (const [name, size, f] of targets) {
  fs.writeFileSync(path.join(OUT, name), makePng(size, f));
  console.log(`wrote public/icons/${name} (${size}x${size})`);
}
console.log('done.');
