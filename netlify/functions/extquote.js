// extquote — pre-market / after-hours stock prices (display only) from Yahoo's chart feed.
// GET /.netlify/functions/extquote?symbols=SPCX,TSLA → {SPCX:{session:'pre'|'post',price,at,base}, ...}
// Only tickers currently in pre-market or after-hours with a fresh print are returned; anything else is quietly left out.
const lastExt = (raw, now) => {
  const r = raw && raw.chart && raw.chart.result && raw.chart.result[0]; if (!r) return null;
  const m = r.meta || {}, tp = m.currentTradingPeriod || {}, ts = r.timestamp || [], cl = ((r.indicators || {}).quote || [{}])[0].close || [];
  const nowS = Math.floor(now / 1000);
  const sess = ['pre', 'post'].find(k => tp[k] && nowS >= tp[k].start && nowS < tp[k].end);
  if (!sess) return null;
  for (let i = ts.length - 1; i >= 0; i--) {
    if (cl[i] == null) continue;
    if (ts[i] < tp[sess].start) return null;
    const base = m.regularMarketPrice;
    if (!(base > 0)) return null;
    return { session: sess, price: Math.round(cl[i] * 100) / 100, at: ts[i] * 1000, base };
  }
  return null;
};
async function getExt(syms, { fetchImpl = fetch, now = Date.now() } = {}) {
  const out = {};
  await Promise.all(syms.map(async s => {
    try {
      const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?includePrePost=true&interval=1m&range=1d`,
        { headers: { 'User-Agent': 'Mozilla/5.0 WheelHouse' }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return;
      const e = lastExt(await r.json(), now); if (e) out[s] = e;
    } catch (e) { /* quiet: no extended price */ }
  }));
  return out;
}
exports.lastExt = lastExt; exports.getExt = getExt;
exports.handler = async (event) => {
  const syms = String(event.queryStringParameters?.symbols || '').toUpperCase().split(',').map(s => s.trim()).filter(s => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(s)).slice(0, 40);
  const body = syms.length ? await getExt(syms) : {};
  return { statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=30' }, body: JSON.stringify(body) };
};
