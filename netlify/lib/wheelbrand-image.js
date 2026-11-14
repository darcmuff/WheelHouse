// Raster logo → brand colour + white watermark mask (Node + sharp).
'use strict';

const sharp = require('sharp');
const { gradientFromBrand, unhex, hexc, oklch } = require('./wheelbrand-color');

function isNeutralRgb(rgb) {
  return oklch(rgb)[1] < 0.035;
}

async function analyseLogoPng(pngBuf) {
  const { data, info } = await sharp(pngBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels } = info;
  const px = (x, y) => {
    const i = (y * W + x) * channels;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };

  const border = [];
  for (let x = 0; x < W; x++) {
    border.push(px(x, 0), px(x, 1), px(x, H - 1), px(x, H - 2));
  }
  for (let y = 2; y < H - 2; y++) {
    border.push(px(0, y), px(1, y), px(W - 1, y), px(W - 2, y));
  }

  let opaqueBorder = 0;
  const borderRgb = [];
  for (const p of border) {
    if (p[3] > 250) {
      opaqueBorder++;
      borderRgb.push(p.slice(0, 3));
    }
  }
  const borderUniform =
    opaqueBorder > border.length * 0.95 &&
    borderRgb.length &&
    Math.max(...borderRgb.map((r) => Math.max(...borderRgb[0].map((v, i) => Math.abs(v - r[i]))))) < 30;

  let brand;
  let neutral = false;
  let colourFrom = 'dominant logo colour';
  let method = 'transparent';
  const mask = Buffer.alloc(W * H);

  if (borderUniform) {
    method = 'tile-bg';
    const bg = borderRgb[Math.floor(borderRgb.length / 2)];
    const bgMed = medianRgb(borderRgb);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = px(x, y);
        const dist = Math.max(Math.abs(p[0] - bgMed[0]), Math.abs(p[1] - bgMed[1]), Math.abs(p[2] - bgMed[2]));
        const fg = Math.min(1, Math.max(0, (dist - 18) / 40)) * (p[3] / 255);
        mask[y * W + x] = Math.round(fg * 255);
      }
    }
    brand = bgMed;
    if (!isNeutralRgb(brand)) colourFrom = 'tile background';
    else {
      neutral = true;
      brand = dominantChromatic(data, W, H, channels, mask) || [20, 20, 22];
    }
  } else {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = px(x, y);
        mask[y * W + x] = p[3];
      }
    }
    brand = dominantChromatic(data, W, H, channels, mask) || [20, 20, 22];
    if (isNeutralRgb(brand)) {
      neutral = true;
      colourFrom = 'neutral';
    }
  }

  const cover = mask.filter((v) => v > 20).length;
  if (cover < W * H * 0.004) return null;

  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (mask[y * W + x] > 20) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x + 1);
        y1 = Math.max(y1, y + 1);
      }
    }
  }
  const cropW = x1 - x0;
  const cropH = y1 - y0;
  const cropMask = Buffer.alloc(cropW * cropH);
  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      cropMask[y * cropW + x] = mask[(y0 + y) * W + (x0 + x)];
    }
  }

  const rgba = Buffer.alloc(cropW * cropH * 4);
  for (let i = 0; i < cropW * cropH; i++) {
    const a = cropMask[i];
    const o = i * 4;
    rgba[o] = 255;
    rgba[o + 1] = 255;
    rgba[o + 2] = 255;
    rgba[o + 3] = a;
  }
  const whitePng = await sharp(rgba, { raw: { width: cropW, height: cropH, channels: 4 } }).png().toBuffer();

  return {
    brand,
    neutral,
    colourFrom,
    method,
    aspect: cropW / cropH,
    maskPng: whitePng,
    gradient: gradientFromBrand(brand, neutral),
    brandHex: hexc(brand),
  };
}

function medianRgb(list) {
  const out = [0, 1, 2].map((c) => {
    const s = list.map((p) => p[c]).sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  });
  return out;
}

function dominantChromatic(data, W, H, channels, mask) {
  const samples = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const m = mask[y * W + x];
      if (m < 128) continue;
      const i = (y * W + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const sat = max === 0 ? 0 : (max - min) / max;
      const val = max;
      if (sat > 0.12 && val > 0.15) samples.push([r, g, b, sat]);
    }
  }
  if (samples.length < 8) return null;
  const buckets = new Array(36).fill(0);
  const bucketPx = Array.from({ length: 36 }, () => []);
  for (const s of samples) {
    const [r, g, b, sat] = s;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    if (max !== min) {
      const d = max - min;
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    const bin = Math.min(35, Math.floor((h / 360) * 36));
    buckets[bin] += sat;
    if (bucketPx[bin].length < 200) bucketPx[bin].push([r, g, b]);
  }
  let best = 0;
  for (let i = 1; i < 36; i++) if (buckets[i] > buckets[best]) best = i;
  if (buckets[best] <= 0) return null;
  const px = bucketPx[best];
  return medianRgb(px);
}

function applyBrandOverride(entry, override) {
  if (override && override.brand) {
    const rgb = unhex(override.brand);
    const neutral = isNeutralRgb(rgb);
    entry.brandHex = override.brand;
    entry.brand = rgb;
    entry.neutral = neutral;
    entry.colourFrom = 'override';
    entry.gradient = gradientFromBrand(rgb, neutral);
  }
  return entry;
}

module.exports = { analyseLogoPng, applyBrandOverride, isNeutralRgb };