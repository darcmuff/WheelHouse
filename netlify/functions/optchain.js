// optchain — delayed option marks + greeks for specific contracts.
// Source order: 1) Cboe public delayed quotes (no key)  2) Nasdaq public option-chain (no key)
//  3) Finnhub option chain (app's FINNHUB_KEY; skipped silently on any failure/unauthorised)
//  4) nothing → the app falls back to manual marks + local Black-Scholes.
// GET /.netlify/functions/optchain?symbol=TSLA&contracts=TSLA251114C00450000,TSLA251121C00400000
const INDEX = new Set(['SPX', 'SPXW', 'NDX', 'RUT', 'VIX', 'XSP', 'DJX', 'OEX', 'XEO']);
// OCC root + expiry/right/strike. Matching is exact on that tail. A shorter root that merely
// shares a prefix (F vs FCX) is a different contract and must not be used.
const PARTS = /^([A-Z.]+)(\d{6}[CP]\d{8})$/;
const parts = sym => { const m = PARTS.exec(sym); return m ? { root: m[1], tail: m[2] } : null; };
const rootsMatch = (a, b) => a === b || ([a, b].sort().join() === 'SPX,SPXW'); // Cboe lists SPX weeklies under SPXW
function matchWanted(sym, want) {
  sym = String(sym || '').replace(/\s+/g, '');
  if (want.has(sym)) return sym;
  const got = parts(sym); if (!got) return undefined;
  for (const w of want) {
    const need = parts(w);
    if (need && need.tail === got.tail && rootsMatch(need.root, got.root)) return w;
  }
  return undefined;
}
// Exact root wins over an alias. An alias never replaces a quote already stored for that contract.
function take(list, want, symOf, rowOf) {
  const contracts = {}, exact = new Set();
  for (const o of list) {
    const sym = String(symOf(o) || '').replace(/\s+/g, '');
    const hit = matchWanted(sym, want);
    if (!hit || exact.has(hit)) continue;
    if (sym === hit) exact.add(hit);
    else if (contracts[hit]) continue;
    contracts[hit] = rowOf(o);
  }
  return contracts;
}

// Cboe's timestamp is UTC (checked 21 Oct 2026 against wall clock)
function pick(raw, wanted) {
  const d = raw && raw.data ? raw.data : {};
  const want = new Set(wanted);
  const contracts = take(d.options || [], want, o => o.option, o => (
    { src: 'cboe', bid: o.bid, ask: o.ask, last: o.last_trade_price, prevClose: o.prev_day_close > 0 ? o.prev_day_close : null, iv: o.iv, delta: o.delta, gamma: o.gamma, theta: o.theta, vega: o.vega, oi: o.open_interest, volume: o.volume }));
  return { asOf: raw && raw.timestamp ? raw.timestamp.replace(' ', 'T') + 'Z' : null, spot: d.current_price ?? d.close ?? null, contracts };
}
// Finnhub /stock/option-chain shape: {lastTradePrice?, data:[{expirationDate, options:{CALL:[...], PUT:[...]}}]}
function pickFinnhub(raw, wanted) {
  const want = new Set(wanted), list = [];
  for (const exp of (raw && raw.data) || []) {
    for (const side of ['CALL', 'PUT']) for (const o of ((exp.options || {})[side]) || []) list.push(o);
  }
  const contracts = take(list, want, o => o.contractName, o => {
    let iv = o.impliedVolatility; if (iv > 3) iv = iv / 100; // Finnhub reports IV in percent
    return { src: 'finnhub', bid: o.bid, ask: o.ask, last: o.lastPrice, prevClose: o.previousClose > 0 ? o.previousClose : null, iv, delta: o.delta, gamma: o.gamma, theta: o.theta, vega: o.vega, oi: o.openInterest, volume: o.volume };
  });
  return { spot: raw && raw.lastTradePrice || null, contracts };
}
// Nasdaq /api/quote/{sym}/option-chain: one row holds the call and put at a strike. The OCC lives in drillDownURL
// as ".../tsla--261120c00400000" (always the call form); the put is the same expiry/strike with P.
function num(v) { if (v == null) return null; const s = String(v).replace(/[$,]/g, '').trim(); if (!s || s === '--') return null; const n = +s; return Number.isFinite(n) ? n : null; }
function pickNasdaq(raw, wanted) {
  const d = raw && raw.data ? raw.data : {};
  const list = [];
  for (const r of (d.table && d.table.rows) || []) {
    const m = /([A-Z0-9]+)--(\d{6})[cC](\d{8})/i.exec(String(r.drillDownURL || '').replace(/\s+/g, ''));
    if (!m) continue;
    const root = m[1].toUpperCase();
    const call = root + m[2] + 'C' + m[3], put = root + m[2] + 'P' + m[3];
    const add=(option,side)=>{const o={option,bid:num(r[side+'_Bid']),ask:num(r[side+'_Ask']),last:num(r[side+'_Last']),volume:num(r[side+'_Volume']),oi:num(r[side+'_Openinterest'])};if(o.bid==null&&o.ask==null&&o.last==null)return;list.push(o);};
    add(call,'c');add(put,'p');
  }
  const contracts = take(list, new Set(wanted), o => o.option, o => (
    { src: 'nasdaq', bid: o.bid, ask: o.ask, last: o.last, prevClose: null, iv: null, delta: null, gamma: null, theta: null, vega: null, oi: o.oi, volume: o.volume }));
  const spotM = /\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)/.exec(String(d.lastTrade || ''));
  return { spot: spotM ? +spotM[1].replace(/,/g, '') : null, contracts };
}
function nasdaqUrl(sym) {
  const iso = d => d.toISOString().slice(0, 10);
  const from = new Date(); from.setUTCDate(from.getUTCDate() - 5);
  const to = new Date(); to.setUTCFullYear(to.getUTCFullYear() + 3);
  const asset = INDEX.has(sym) ? 'index' : 'stocks';
  return `https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/option-chain?assetclass=${asset}&fromdate=${iso(from)}&todate=${iso(to)}`;
}
// Cboe moved the file to cdn-api.cboe.com and Cloudflare 403s requests that have no www.cboe.com Referer
// (the old UA-only fetch followed the 307 and got an empty challenge page).
const CBOE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 WheelHouse',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.cboe.com/'
};
const NASDAQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nasdaq.com/',
  'Origin': 'https://www.nasdaq.com'
};

async function getMarks(sym, wanted, { fetchImpl = fetch, finnhubKey } = {}) {
  const out = { asOf: null, spot: null, delayed: true, sources: [], contracts: {} };
  const tryJson = async (url, opts) => { try { const r = await fetchImpl(url, opts); if (!r.ok) return null; return await r.json(); } catch (e) { return null; } };
  const cboe = await tryJson(`https://cdn-api.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(INDEX.has(sym) ? '_' + sym : sym)}.json`,
    { headers: CBOE_HEADERS, signal: AbortSignal.timeout(12000), redirect: 'follow' });
  if (cboe) { const p = pick(cboe, wanted); Object.assign(out.contracts, p.contracts); out.asOf = p.asOf; out.spot = p.spot; if (Object.keys(p.contracts).length) out.sources.push('cboe'); }
  let missing = wanted.filter(w => !out.contracts[w]);
  if (missing.length) {
    const nd = await tryJson(nasdaqUrl(sym), { headers: NASDAQ_HEADERS, signal: AbortSignal.timeout(12000) });
    if (nd) {
      const p = pickNasdaq(nd, missing);
      Object.assign(out.contracts, p.contracts);
      if (out.spot == null) out.spot = p.spot;
      if (Object.keys(p.contracts).length) out.sources.push('nasdaq');
    }
    missing = wanted.filter(w => !out.contracts[w]);
  }
  if (missing.length && finnhubKey) {
    const fh = await tryJson(`https://finnhub.io/api/v1/stock/option-chain?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`, { signal: AbortSignal.timeout(12000) });
    if (fh && !fh.error) { const p = pickFinnhub(fh, missing); Object.assign(out.contracts, p.contracts); if (out.spot == null) out.spot = p.spot; if (Object.keys(p.contracts).length) out.sources.push('finnhub'); }
  }
  if (!out.asOf) out.asOf = new Date().toISOString();
  return out;
}

exports.pick = pick; exports.pickFinnhub = pickFinnhub; exports.pickNasdaq = pickNasdaq; exports.getMarks = getMarks;
const _handler = async (event) => {
  const q = event.queryStringParameters || {};
  const sym = String(q.symbol || '').toUpperCase().replace(/[^A-Z.]/g, '');
  const wanted = String(q.contracts || '').toUpperCase().split(',').map(s => s.trim()).filter(s => /^[A-Z.]+\d{6}[CP]\d{8}$/.test(s)).slice(0, 60);
  if (!sym || !wanted.length) return { statusCode: 400, body: JSON.stringify({ error: 'symbol and contracts required' }) };
  const out = await getMarks(sym, wanted, { finnhubKey: process.env.FINNHUB_KEY });
  // 200 even when empty: the app shows "no quote" for that contract. A manual mark is left alone.
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60', 'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=60' }, body: JSON.stringify(out) };
};

exports.handler = require('../lib/origin').guard(_handler);
