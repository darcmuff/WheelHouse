// optchain — delayed option marks + greeks for specific contracts.
// Source order: 1) Cboe public delayed quotes (no key)  2) Finnhub option chain (app's FINNHUB_KEY; skipped silently
// on any failure/unauthorised)  3) nothing → the app falls back to manual marks + local Black-Scholes.
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
async function getMarks(sym, wanted, { fetchImpl = fetch, finnhubKey } = {}) {
  const out = { asOf: null, spot: null, delayed: true, sources: [], contracts: {} };
  const tryJson = async (url, opts) => { try { const r = await fetchImpl(url, opts); if (!r.ok) return null; return await r.json(); } catch (e) { return null; } };
  const cboe = await tryJson(`https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(INDEX.has(sym) ? '_' + sym : sym)}.json`,
    { headers: { 'User-Agent': 'Mozilla/5.0 WheelHouse' }, signal: AbortSignal.timeout(12000), redirect: 'follow' });
  if (cboe) { const p = pick(cboe, wanted); Object.assign(out.contracts, p.contracts); out.asOf = p.asOf; out.spot = p.spot; if (Object.keys(p.contracts).length) out.sources.push('cboe'); }
  const missing = wanted.filter(w => !out.contracts[w]);
  if (missing.length && finnhubKey) {
    const fh = await tryJson(`https://finnhub.io/api/v1/stock/option-chain?symbol=${encodeURIComponent(sym)}&token=${finnhubKey}`, { signal: AbortSignal.timeout(12000) });
    if (fh && !fh.error) { const p = pickFinnhub(fh, missing); Object.assign(out.contracts, p.contracts); if (out.spot == null) out.spot = p.spot; if (Object.keys(p.contracts).length) out.sources.push('finnhub'); }
  }
  if (!out.asOf) out.asOf = new Date().toISOString();
  return out;
}

exports.pick = pick; exports.pickFinnhub = pickFinnhub; exports.getMarks = getMarks;
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
