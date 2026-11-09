// symbol — Finnhub symbol search for the New wheel box.
// GET /.netlify/functions/symbol?q=tesla → {results:[{symbol,name}]}
const OK = /common stock|etp|adr|reit|equity/i;
function pick(raw) {
  const out = [], seen = new Set();
  for (const r of (raw && raw.result) || []) {
    const symbol = String(r.displaySymbol || r.symbol || '').toUpperCase().trim();
    const name = String(r.description || '').replace(/\s+/g, ' ').trim();
    if (!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(symbol) || seen.has(symbol)) continue;
    if (r.type && !OK.test(String(r.type))) continue;
    seen.add(symbol);
    out.push({ symbol, name });
    if (out.length >= 8) break;
  }
  return out;
}
async function searchSymbols(q, { fetchImpl = fetch, finnhubKey } = {}) {
  const query = String(q || '').trim().slice(0, 40);
  if (!query) return { results: [] };
  if (!finnhubKey) return { results: [], error: 'no key' };
  const r = await fetchImpl(`https://finnhub.io/api/v1/search?q=${encodeURIComponent(query)}&token=${finnhubKey}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  if (j && j.error) throw new Error('search');
  return { results: pick(j) };
}
exports.pick = pick; exports.searchSymbols = searchSymbols;
const _handler = async (event) => {
  const q = String((event.queryStringParameters || {}).q || '').trim().slice(0, 40);
  if (!q) return { statusCode: 400, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Missing q' }) };
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=30', 'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=60' };
  try {
    const out = await searchSymbols(q, { finnhubKey: process.env.FINNHUB_KEY });
    return { statusCode: 200, headers, body: JSON.stringify({ results: out.results }) };
  } catch (e) {
    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'no-store' }, body: JSON.stringify({ results: [], error: 'lookup failed' }) };
  }
};
exports.handler = require('../lib/origin').guard(_handler);
