const test = require('node:test');
const assert = require('node:assert');
const sharp = require('sharp');
const { analyseLogoPng } = require('../netlify/lib/wheelbrand-image');

const svgPng = (body) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${body}</svg>`)).png().toBuffer();

async function maskAt(entry, fx, fy) {
  const { data, info } = await sharp(entry.maskPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const x = Math.min(info.width - 1, Math.round(fx * (info.width - 1)));
  const y = Math.min(info.height - 1, Math.round(fy * (info.height - 1)));
  return data[(y * info.width + x) * 4 + 3];
}

// A white "T" (bar 136..376 x 120..180, stem 226..286 x 180..400) on a 512 tile.
const T = '<rect x="136" y="120" width="240" height="60" fill="#fff"/><rect x="226" y="180" width="60" height="220" fill="#fff"/>';

test('rounded-corner tile: flat tile colour is keyed out, logo kept', async () => {
  const e = await analyseLogoPng(await svgPng(`<rect width="512" height="512" rx="96" fill="#e31937"/>${T}`));
  assert.strictEqual(e.method, 'tile-bg');
  assert.ok(e.aspect > 0.8 && e.aspect < 0.9, `cropped to the T, aspect ${e.aspect}`);
  assert.ok((await maskAt(e, 0.5, 0.1)) > 200, 'T bar is opaque');
  assert.ok((await maskAt(e, 0.05, 0.9)) < 20, 'tile colour beside the stem is transparent');
});

test('inset tile with uneven edge (logo touching the edge) is still keyed', async () => {
  const e = await analyseLogoPng(
    await svgPng(`<rect x="24" y="24" width="464" height="464" rx="60" fill="#111"/><rect x="24" y="230" width="464" height="40" fill="#fff"/>${T}`)
  );
  assert.strictEqual(e.method, 'tile-bg');
  assert.ok((await maskAt(e, 0.5, 0.5)) > 200);
});

test('transparent logo is not mistaken for a tile', async () => {
  const e = await analyseLogoPng(await svgPng(T.replace(/#fff/g, '#e31937')));
  assert.strictEqual(e.method, 'transparent');
  assert.ok((await maskAt(e, 0.5, 0.1)) > 200);
});
