// On-demand brand assets for tickers not in committed shards.
const fs = require('fs');
const path = require('path');
const { fetchLogoPng } = require('../lib/logo-dev');
const { analyseLogoPng, applyBrandOverride } = require('../lib/wheelbrand-image');
const { fallbackHueTicker, etfBg } = require('../lib/wheelbrand-color');

const OVERRIDES_PATHS = [
  path.join(__dirname, '../../app/brand/overrides.json'),
  path.join(process.cwd(), 'app/brand/overrides.json'),
];
const TOP250_PATHS = [
  path.join(__dirname, '../../app/brand/top250-options.json'),
  path.join(process.cwd(), 'app/brand/top250-options.json'),
];

const HEADERS_HIT = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=86400',
  'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=604800, stale-while-revalidate=86400',
};

const HEADERS_MISS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Netlify-CDN-Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

function readOverrides() {
  for (const p of OVERRIDES_PATHS) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      delete j._doc;
      return j;
    } catch {
      /* try next */
    }
  }
  return {};
}

function readTop250Allow() {
  for (const p of TOP250_PATHS) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      return new Set((j.symbols || []).map((s) => String(s).toUpperCase()));
    } catch {
      /* try next */
    }
  }
  return null;
}

const HAND_MARK_ONLY = new Set(['AMD', 'KO', 'NVDA', 'SOFI']);

function logoAllowed(ticker, ov, allow) {
  if (ov.disable_logo || ov.force_fallback) return false;
  if (ov.allow_logo) return true;
  if (HAND_MARK_ONLY.has(ticker)) return false;
  return allow ? allow.has(ticker) : false;
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

function safeWhy(msg) {
  return String(msg || 'error')
    .slice(0, 120)
    .replace(/sk_[a-zA-Z0-9]+/gi, 'sk_…')
    .replace(/Bearer\s+\S+/gi, 'Bearer …');
}

function fallbackResponse(sym, why, extra, headers = HEADERS_MISS) {
  const { gradient } = fallbackHueTicker(sym);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ ...leanJson(sym, { fallback: true, gradient, watermarkOpacity: 0.13, ...extra }), why }),
  };
}

const _handler = async (event) => {
  const ticker = String((event.queryStringParameters || {}).ticker || (event.queryStringParameters || {}).t || '')
    .trim()
    .toUpperCase()
    .slice(0, 12);
  if (!ticker || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(ticker)) {
    return {
      statusCode: 400,
      headers: HEADERS_MISS,
      body: JSON.stringify({ error: 'Bad ticker', why: 'bad_ticker' }),
    };
  }

  const overrides = readOverrides();
  const ov = overrides[ticker] || {};
  const top250 = readTop250Allow();

  if (ov.disable_logo || ov.force_fallback) {
    return fallbackResponse(ticker, 'disabled');
  }

  if (!logoAllowed(ticker, ov, top250)) {
    return fallbackResponse(ticker, 'not_in_list');
  }

  if (etfBg(ticker)) {
    const { gradient } = fallbackHueTicker(ticker);
    return fallbackResponse(ticker, 'etf', { etf: true, legacyBg: etfBg(ticker), gradient });
  }

  const secret = process.env.LOGO_DEV_SECRET_KEY;
  if (!secret) {
    return fallbackResponse(ticker, 'no_key');
  }

  try {
    const hit = await fetchLogoPng(ticker, secret);
    if (!hit || hit.why) {
      return fallbackResponse(ticker, hit && hit.why ? hit.why : 'no_logo');
    }
    const png = hit.png;
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
      credits: hit.credits,
      api: hit.route,
    };
    return { statusCode: 200, headers: HEADERS_HIT, body: JSON.stringify(body) };
  } catch (e) {
    return fallbackResponse(ticker, `error:${safeWhy(e.message)}`);
  }
};

exports.handler = require('../lib/origin').guard(_handler);