// Bounded PNG pixel decoder (AUG-1303 / AUG-1301). Pure node, no deps. Every allocation is capped
// before it happens: file bytes, dimensions, inflated size. Supports 8-bit, non-interlaced
// gray / RGB / RGBA / palette (what simulator screenshots are). Anything else is rejected, not guessed.
import { inflateSync, crc32 } from 'node:zlib';

export const LIMITS = Object.freeze({ maxFileBytes: 40 * 1024 * 1024, maxDim: 8192, maxPixels: 24_000_000, maxChunks: 4096 });
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function parseChunks(buf, limits = LIMITS) {
  if (buf.length > limits.maxFileBytes) throw new Error(`png too large (${buf.length} bytes)`);
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  const chunks = []; let o = 8;
  while (o < buf.length) {
    if (chunks.length >= limits.maxChunks) throw new Error('too many png chunks');
    if (o + 12 > buf.length) throw new Error('truncated png chunk header');
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8);
    if (len > buf.length - o - 12) throw new Error(`truncated png chunk ${type}`);
    const data = buf.subarray(o + 8, o + 8 + len);
    if (buf.readUInt32BE(o + 8 + len) !== crc32(buf.subarray(o + 4, o + 8 + len)) >>> 0) throw new Error(`png crc mismatch in ${type}`);
    chunks.push({ type, data }); o += 12 + len;
    if (type === 'IEND') break;
  }
  if (chunks[0]?.type !== 'IHDR' || chunks[0].data.length !== 13) throw new Error('png missing IHDR');
  if (chunks.at(-1).type !== 'IEND') throw new Error('png missing IEND');
  return chunks;
}

export function decodePng(buf, limits = LIMITS) {
  const chunks = parseChunks(buf, limits);
  const h = chunks[0].data;
  const width = h.readUInt32BE(0), height = h.readUInt32BE(4), depth = h[8], ctype = h[9], interlace = h[12];
  if (!width || !height || width > limits.maxDim || height > limits.maxDim || width * height > limits.maxPixels) throw new Error(`png dimensions out of bounds ${width}x${height}`);
  if (depth !== 8 || !(ctype in CHANNELS)) throw new Error(`unsupported png format depth=${depth} colorType=${ctype}`);
  if (interlace !== 0 || h[10] !== 0 || h[11] !== 0) throw new Error('unsupported png (interlaced or nonstandard method)');
  const bpp = CHANNELS[ctype], stride = width * bpp, expected = (stride + 1) * height;
  const idat = Buffer.concat(chunks.filter(c => c.type === 'IDAT').map(c => c.data));
  if (!idat.length) throw new Error('png has no IDAT');
  let raw;
  try { raw = inflateSync(idat, { maxOutputLength: expected }); } catch (e) { throw new Error(`png inflate failed: ${e.code ?? e.message}`); }
  if (raw.length !== expected) throw new Error(`png pixel data length ${raw.length} != ${expected}`);
  const px = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    if (ft > 4) throw new Error(`png bad filter type ${ft}`);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[dst + x - bpp] : 0, b = y ? px[dst - stride + x] : 0, c = x >= bpp && y ? px[dst - stride + x - bpp] : 0;
      let p = 0;
      if (ft === 2) p = b; else if (ft === 1) p = a; else if (ft === 3) p = (a + b) >> 1;
      else if (ft === 4) { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[dst + x] = (raw[src + x] + p) & 255;
    }
  }
  return { width, height, channels: bpp, colorType: ctype, pixels: px };
}

// Distinct pixel values (capped) and fraction of pixels equal to the most common one.
export function pixelStats({ pixels, channels }, cap = 64) {
  const counts = new Map(); const n = pixels.length / channels;
  for (let i = 0; i < pixels.length; i += channels) {
    const k = pixels.readUIntBE(i, channels);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    if (counts.size > cap) return { distinct: counts.size, dominant: null, capped: true };
  }
  return { distinct: counts.size, dominant: Math.max(...counts.values()) / n, capped: false };
}
