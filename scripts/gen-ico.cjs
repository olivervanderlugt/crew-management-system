// Generate apps/web/public/icons/app.ico — blue rounded square with a white "C".
// Pure Node (zlib + manual PNG), 256x256, 4x supersampled for smooth edges,
// wrapped in an ICO container (PNG-compressed entry, supported on Windows Vista+).
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

function crc32(buf) {
  let c, table = [];
  for (let i = 0; i < 256; i++) {
    c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function pngRGBA(w, h, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const rowLen = 1 + w * 4;
  const raw = Buffer.alloc(h * rowLen);
  for (let y = 0; y < h; y++) pixels.copy(raw, y * rowLen + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    sig, pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const OUT = 256, S = 4;
const BRAND = [37, 99, 235], WHITE = [255, 255, 255];
const inset = 6, radius = 46;
// "C" glyph in 256-space: an annulus with the right-hand wedge cut out.
const CX = 128, CY = 128, C_OUTER = 68, C_INNER = 44, C_GAP = 26;

function inRoundRect(x, y) {
  const x0 = inset, y0 = inset, x1 = OUT - inset, y1 = OUT - inset, r = radius;
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
  const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}
function inC(x, y) {
  const dx = x - CX, dy = y - CY, d = Math.sqrt(dx * dx + dy * dy);
  if (d > C_OUTER || d < C_INNER) return false;
  return !(dx > 0 && Math.abs(dy) < C_GAP); // right-hand opening
}

const pixels = Buffer.alloc(OUT * OUT * 4);
for (let oy = 0; oy < OUT; oy++) {
  for (let ox = 0; ox < OUT; ox++) {
    let rs = 0, gs = 0, bs = 0, covered = 0;
    for (let sy = 0; sy < S; sy++) {
      for (let sx = 0; sx < S; sx++) {
        const x = ox + (sx + 0.5) / S, y = oy + (sy + 0.5) / S;
        if (inRoundRect(x, y)) {
          const c = inC(x, y) ? WHITE : BRAND;
          rs += c[0]; gs += c[1]; bs += c[2]; covered++;
        }
      }
    }
    const off = (oy * OUT + ox) * 4, n = S * S;
    if (covered > 0) {
      pixels[off] = Math.round(rs / covered);
      pixels[off + 1] = Math.round(gs / covered);
      pixels[off + 2] = Math.round(bs / covered);
      pixels[off + 3] = Math.round((255 * covered) / n);
    }
  }
}

const png = pngRGBA(OUT, OUT, pixels);
const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(1, 4);
const ent = Buffer.alloc(16);
ent[0] = 0; ent[1] = 0;             // 0 => 256 px
ent.writeUInt16LE(1, 4);            // color planes
ent.writeUInt16LE(32, 6);           // bits per pixel
ent.writeUInt32LE(png.length, 8);   // size of PNG
ent.writeUInt32LE(22, 12);          // offset (6 + 16)
const ico = Buffer.concat([dir, ent, png]);

const outDir = path.join(__dirname, "..", "apps", "web", "public", "icons");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "app.ico"), ico);
console.log("Wrote", path.join(outDir, "app.ico"), "(" + ico.length + " bytes)");
