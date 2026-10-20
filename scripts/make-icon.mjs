// Draws the app icon (a 16x16 pixel sprout helper) as a 1024px PNG, with no
// image library: raw RGBA rows, zlib, and the three PNG chunks.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const art = [
  "______LL________",
  "_____LGGL_______",
  "______GD________",
  "____SSSSSS______",
  "___SSSSSSSS_____",
  "___SWESSWES_____",
  "___SEESSEES_____",
  "___SPSSSSPS_____",
  "____SSDDSS______",
  "_____SSSS_______",
  "____BBBBBB______",
  "___BBBBBBBB_____",
  "___SBBBBBBS_____",
  "____BBBBBB______",
  "____DD__DD______",
  "________________",
];
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const colours = { L: "#9fe3a8", G: "#6fcf7a", D: "#2f7d46", S: "#f6d2b0", E: "#1d2433", P: "#f29bb3", W: "#ffffff", B: "#3b6fd8" };
const size = 1024, cell = 52, bg = hex("#fff6e6");
const ox = Math.floor((size - 16 * cell) / 2) + cell * 2, oy = Math.floor((size - 16 * cell) / 2) + Math.floor(cell / 2);
const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) {
  raw[y * (size * 4 + 1)] = 0;
  for (let x = 0; x < size; x++) {
    // Rounded square background.
    const r = 200, m = 40, cx = Math.min(Math.max(x, m + r), size - m - r), cy = Math.min(Math.max(y, m + r), size - m - r);
    let px = (x >= m && x < size - m && y >= m && y < size - m && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) ? bg : [0, 0, 0, 0];
    const gx = Math.floor((x - ox) / cell), gy = Math.floor((y - oy) / cell);
    if (gx >= 0 && gx < 16 && gy >= 0 && gy < 16 && colours[art[gy][gx]]) px = hex(colours[art[gy][gx]]);
    raw.set(px, y * (size * 4 + 1) + 1 + x * 4);
  }
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync("app-icon.png", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("app-icon.png written");
