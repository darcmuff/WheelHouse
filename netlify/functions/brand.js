// On-demand brand assets for tickers not in committed shards.
const fs = require('fs');
const path = require('path');
const { fetchLogoPng } = require('../../scripts/brand/logo-fetch');
const { analyseLogoPng, applyBrandOverride } = require('../lib/wheelbrand-image');
const { fallbackHueTicker, etfBg } = require('../lib/wheelbrand-color');

const OVERRIDES_PATH = path.join(__dirname, '../../app/brand/overrides.json');

function readOverrides() {
  try {
    const j = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
    delete j._doc;
    return j;
  } catch {
    return {};
  }
}

function leanJson(sym, data) {
  const g = data.gradient;
  return {
    ticker: sym,
    g: { f: g.frm, t: g.to, gl: g.glow, k: g.kind },
    fb: !!data.fallback,
    etf: !!data.etf,
    wo: data.watermarkOpacity ?? 0.16,
    mark: data.mark || null,
    a: data.aspect,
    legacyBg: data.legacyBg || null,
  };
}

const _handler = async (event) => {
  const ticker = String((event.queryStringParameters || {}).ticker || (event.queryStringParameters || {}).t || '')
    .trim()
    .toUpperCase()
    .slice(0, 12);
  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400',
    'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=604800, stale-while-revalidate=86400',
  };
  if (!ticker || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
    return { statusCode: 400, headers: { ...headers, 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Bad ticker' }) };
  }

  const overrides = readOverrides();
  const ov = overrides[ticker] || {};

  if (ov.disable_logo || ov.force_fallback) {
    const { gradient } = fallbackHueTicker(ticker);
    return { statusCode: 200, headers, body: JSON.stringify(leanJson(ticker, { fallback: true, gradient, watermarkOpacity: 0.13 })) };
  }

  const etf = etfBg(ticker);
  if (etf) {
    const { gradient } = fallbackHueTicker(ticker);
    return { statusCode: 200, headers, body: JSON.stringify(leanJson(ticker, { fallback: true, etf: true, gradient, legacyBg: etf, watermarkOpacity: 0.13 })) };
  }

  const secret = process.env.LOGO_DEV_SECRET_KEY;
  if (!secret) {
    const { gradient } = fallbackHueTicker(ticker);
    return { statusCode: 200, headers, body: JSON.stringify(leanJson(ticker, { fallback: true, gradient, watermarkOpacity: 0.13 })) };
  }

  try {
    const hit = await fetchLogoPng(ticker, secret);
    const png = hit && hit.png;
    if (!png) {
      const { gradient } = fallbackHueTicker(ticker);
      return { statusCode: 200, headers, body: JSON.stringify(leanJson(ticker, { fallback: true, gradient, watermarkOpacity: 0.13 })) };
    }
    let entry = await analyseLogoPng(png);
    entry = applyBrandOverride(entry, ov);
    const mask = entry.maskPng || png;
    const body = {
      ...leanJson(ticker, {
        fallback: false,
        gradient: entry.gradient,
        aspect: entry.aspect,
        mark: `${ticker}.png`,
        watermarkOpacity: 0.16,
      }),
      markBase64: mask.toString('base64'),
    };
    return { statusCode: 200, headers, body: JSON.stringify(body) };
  } catch (e) {
    const { gradient } = fallbackHueTicker(ticker);
    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'no-store' }, body: JSON.stringify(leanJson(ticker, { fallback: true, gradient, watermarkOpacity: 0.13 })) };
  }
};

exports.handler = require('../lib/origin').guard(_handler);