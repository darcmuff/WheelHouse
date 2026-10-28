// Daily closes for a symbol from Cboe's free delayed-quotes history (no key). Read-only proxy.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const INDEX = new Set(['SPX', 'VIX', 'NDX', 'RUT', 'XSP', 'DJX']);
const ok = (body, maxAge) => ({ statusCode: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': `public, max-age=600, s-maxage=${maxAge}` }, body: JSON.stringify(body) });
const fail = (code, msg) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: msg, candles: [] }) });

// Pure: Cboe history JSON → [{date, close}] between from and to (YYYY-MM-DD), zero/garbage rows dropped, sorted.
function parseCandles(json, from, to) {
  const rows = (json && Array.isArray(json.data)) ? json.data : [];
  return rows
    .filter(r => r && typeof r.date === 'string' && Number(r.close) > 0 && (!from || r.date >= from) && (!to || r.date <= to))
    .map(r => ({ date: r.date.slice(0, 10), close: Math.round(Number(r.close) * 10000) / 10000 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function getCandles(sym, from, to, { fetchImpl = fetch } = {}) {
  const s = INDEX.has(sym) ? '_' + sym : sym;
  const r = await fetchImpl(`https://cdn.cboe.com/api/global/delayed_quotes/charts/historical/${encodeURIComponent(s)}.json`,
    { headers: { 'User-Agent': UA, Accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw Object.assign(new Error('Cboe returned ' + r.status), { status: r.status });
  return parseCandles(await r.json(), from, to);
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const sym = String(q.symbol || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (!sym) return fail(400, 'Missing symbol parameter');
  const today = new Date().toISOString().slice(0, 10);
  const from = /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10);
  try {
    const candles = await getCandles(sym, from, today);
    return ok({ symbol: sym, from, to: today, source: 'cboe', candles }, 21600);
  } catch (e) {
    return fail(e.status === 404 || e.status === 403 ? 404 : 502, e.message);
  }
};
exports.parseCandles = parseCandles;
exports.getCandles = getCandles;
