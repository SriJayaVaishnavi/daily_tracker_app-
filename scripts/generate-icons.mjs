// Generates the app's PWA icons as PNGs with no image-library dependency.
// Kitty mark: white cat head + ears + plum eyes + gold bow on a pink (#ff8cc0)
// tile. Run: `node scripts/generate-icons.mjs`.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const PINK = [0xff, 0x8c, 0xc0];  // --primary
const WHITE = [0xff, 0xff, 0xff];
const PLUM = [0x4a, 0x2c, 0x3a];  // eyes
const GOLD = [0xff, 0xce, 0x4a];  // bow + nose

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Point-in-triangle via consistent edge sign.
function inTri(px, py, a, b, c) {
  const d1 = (px - b[0]) * (a[1] - b[1]) - (a[0] - b[0]) * (py - b[1]);
  const d2 = (px - c[0]) * (b[1] - c[1]) - (b[0] - c[0]) * (py - c[1]);
  const d3 = (px - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (py - a[1]);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function makePng(size) {
  const S = size;
  const stride = S * 4 + 1; // +1 filter byte per row
  const raw = Buffer.alloc(stride * S);

  const head = { cx: 0.5 * S, cy: 0.55 * S, rx: 0.3 * S, ry: 0.27 * S };
  const earL = [[0.2 * S, 0.34 * S], [0.28 * S, 0.08 * S], [0.44 * S, 0.28 * S]];
  const earR = [[0.8 * S, 0.34 * S], [0.72 * S, 0.08 * S], [0.56 * S, 0.28 * S]];
  const eyeL = { cx: 0.4 * S, cy: 0.55 * S, r: 0.035 * S };
  const eyeR = { cx: 0.6 * S, cy: 0.55 * S, r: 0.035 * S };
  const nose = { cx: 0.5 * S, cy: 0.63 * S, rx: 0.03 * S, ry: 0.02 * S };
  const bowL = [[0.72 * S, 0.1 * S], [0.62 * S, 0.04 * S], [0.62 * S, 0.16 * S]];
  const bowR = [[0.72 * S, 0.1 * S], [0.82 * S, 0.04 * S], [0.82 * S, 0.16 * S]];
  const knot = { cx: 0.72 * S, cy: 0.1 * S, r: 0.028 * S };

  for (let y = 0; y < S; y++) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < S; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let c = PINK;
      if (inTri(px, py, earL[0], earL[1], earL[2]) || inTri(px, py, earR[0], earR[1], earR[2])) c = WHITE;
      const hx = (px - head.cx) / head.rx;
      const hy = (py - head.cy) / head.ry;
      if (Math.sqrt(hx * hx + hy * hy) <= 1) c = WHITE;
      if (inTri(px, py, bowL[0], bowL[1], bowL[2]) || inTri(px, py, bowR[0], bowR[1], bowR[2])) c = GOLD;
      if (Math.hypot(px - knot.cx, py - knot.cy) <= knot.r) c = GOLD;
      if (Math.hypot(px - eyeL.cx, py - eyeL.cy) <= eyeL.r || Math.hypot(px - eyeR.cx, py - eyeR.cy) <= eyeR.r) c = PLUM;
      const nx = (px - nose.cx) / nose.rx;
      const ny = (py - nose.cy) / nose.ry;
      if (Math.sqrt(nx * nx + ny * ny) <= 1) c = GOLD;

      const o = y * stride + 1 + x * 4;
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
      raw[o + 3] = 255;
    }
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

for (const size of [192, 512]) {
  const out = new URL(`../public/icon-${size}.png`, import.meta.url);
  writeFileSync(out, makePng(size));
  console.log(`wrote public/icon-${size}.png`);
}
