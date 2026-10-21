// optchain — delayed option marks + greeks for specific contracts, from Cboe's public delayed-quotes JSON.
// No API key. Cboe sends no CORS header, so the browser must go through this proxy.
// GET /.netlify/functions/optchain?symbol=TSLA&contracts=TSLA251114C00450000,TSLA251121C00400000
const INDEX = new Set(['SPX', 'SPXW', 'NDX', 'RUT', 'VIX', 'XSP', 'DJX', 'OEX', 'XEO']);

// Cboe's timestamp is UTC (checked 21 Oct 2026 against wall clock)
function pick(raw, wanted) {
  const d = raw && raw.data ? raw.data : {};
  const want = new Set(wanted);
  const contracts = {};
  for (const o of d.options || []) {
    // Cboe index roots carry a prefix (e.g. SPXW…); match on the OCC tail too
    const sym = String(o.option || '');
    const hit = want.has(sym) ? sym : [...want].find(w => sym.endsWith(w.replace(/^[A-Z.]+/, '')) && sym.startsWith(w.match(/^[A-Z.]+/)[0]));
    if (!hit) continue;
    contracts[hit] = { bid: o.bid, ask: o.ask, last: o.last_trade_price, iv: o.iv, delta: o.delta, gamma: o.gamma, theta: o.theta, vega: o.vega, oi: o.open_interest, volume: o.volume };
  }
  return { asOf: raw && raw.timestamp ? raw.timestamp.replace(' ', 'T') + 'Z' : null, spot: d.current_price ?? d.close ?? null, delayed: true, source: 'cboe', contracts };
}

exports.pick = pick;
exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const sym = String(q.symbol || '').toUpperCase().replace(/[^A-Z.]/g, '');
  const wanted = String(q.contracts || '').toUpperCase().split(',').map(s => s.trim()).filter(s => /^[A-Z.]+\d{6}[CP]\d{8}$/.test(s)).slice(0, 60);
  if (!sym || !wanted.length) return { statusCode: 400, body: JSON.stringify({ error: 'symbol and contracts required' }) };
  const root = INDEX.has(sym) ? '_' + sym : sym;
  try {
    const res = await fetch(`https://cdn.cboe.com/api/global/delayed_quotes/options/${encodeURIComponent(root)}.json`,
      { headers: { 'User-Agent': 'Mozilla/5.0 WheelHouse' }, signal: AbortSignal.timeout(12000), redirect: 'follow' });
    if (!res.ok) return { statusCode: res.status === 403 ? 404 : res.status, body: JSON.stringify({ error: `Cboe returned ${res.status}` }) };
    const out = pick(await res.json(), wanted);
    return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=60' }, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
};
