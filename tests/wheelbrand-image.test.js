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

test('mask is stored at full resolution: never upscaled, capped at MASK_MAX', async () => {
  const { MASK_MAX } = require('../netlify/lib/wheelbrand-image');
  const small = await analyseLogoPng(await svgPng(`<rect width="512" height="512" rx="96" fill="#e31937"/>${T}`));
  const s = await sharp(small.maskPng).metadata();
  assert.ok(s.width <= 240 + 2 && s.height <= 280 + 2, `no upscale (${s.width}x${s.height})`);
  const bigSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="3000" height="3000"><rect width="3000" height="3000" rx="500" fill="#e31937"/><rect x="300" y="500" width="2400" height="2000" fill="#fff"/></svg>`;
  const big = await analyseLogoPng(await sharp(Buffer.from(bigSvg)).png().toBuffer());
  const b = await sharp(big.maskPng).metadata();
  assert.ok(Math.max(b.width, b.height) <= MASK_MAX && Math.max(b.width, b.height) >= MASK_MAX - 2, `capped (${b.width}x${b.height})`);
});

test('Logo.dev download asks for the largest free size (800, retina)', async () => {
  const { fetchLogoPng } = require('../netlify/lib/logo-dev');
  const png = await svgPng(T);
  let dlUrl = null;
  const fake = async (url) => {
    url = String(url);
    if (url.startsWith('https://api.logo.dev')) {
      return new Response(JSON.stringify({ logo: { url: 'https://img.logo.dev/assets/X', etag: 'e1', source: { width: 512, height: 512, is_vector: true } } }), {
        status: 200,
        headers: { 'credits-remaining': '30' },
      });
    }
    dlUrl = new URL(url);
    return new Response(png, { status: 200 });
  };
  const hit = await fetchLogoPng('TSLA', 'sk_test', fake);
  assert.strictEqual(dlUrl.searchParams.get('size'), '800');
  assert.strictEqual(dlUrl.searchParams.get('retina'), 'true');
  assert.strictEqual(dlUrl.searchParams.get('format'), 'png');
  assert.strictEqual(hit.meta.etag, 'e1');
  assert.strictEqual(hit.creditsRemaining, 30);
});
