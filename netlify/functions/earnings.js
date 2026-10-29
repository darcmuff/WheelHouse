// Next earnings date for a symbol. Finnhub first (if FINNHUB_KEY is set), else Nasdaq's public earnings calendar
// scanned day by day (parallel batches) up to ~90 days ahead. Read-only proxy; returns {date:null} when none found.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const DAYS = 90, BATCH = 10;
const resp = (code, body, maxAge) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': maxAge ? `public, max-age=3600, s-maxage=${maxAge}` : 'no-store' }, body: JSON.stringify(body) });
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5));
const isWeekday = s => { const w = new Date(s + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6; };

// Pure: does Nasdaq's calendar JSON for one day list this symbol? Returns {time} or null.
function nasdaqHit(json, sym) {
  const rows = json && json.data && Array.isArray(json.data.rows) ? json.data.rows : [];
  const r = rows.find(x => x && String(x.symbol || '').toUpperCase() === sym);
  return r ? { time: r.time || null } : null;
}
// Pure: Finnhub calendar JSON → earliest date >= today for the symbol, or null.
function finnhubNext(json, sym, today) {
  const rows = json && Array.isArray(json.earningsCalendar) ? json.earningsCalendar : [];
  const d = rows.filter(r => r && String(r.symbol || '').toUpperCase() === sym && r.date >= today).map(r => r.date).sort()[0];
  return d || null;
}

async function viaFinnhub(sym, today, key, fetchImpl) {
  const r = await fetchImpl(`https://finnhub.io/api/v1/calendar/earnings?symbol=${encodeURIComponent(sym)}&from=${today}&to=${addDays(today, 120)}&token=${key}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return undefined;
  return finnhubNext(await r.json(), sym, today);
}
async function viaNasdaq(sym, today, fetchImpl) {
  const days = []; for (let i = 0; i <= DAYS; i++) { const d = addDays(today, i); if (isWeekday(d)) days.push(d); }
  let errors = 0;
  for (let i = 0; i < days.length; i += BATCH) {
    const batch = days.slice(i, i + BATCH);
    const res = await Promise.all(batch.map(async d => {
      try {
        const r = await fetchImpl(`https://api.nasdaq.com/api/calendar/earnings?date=${d}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) { errors++; return null; }
        return nasdaqHit(await r.json(), sym) ? d : null;
      } catch (e) { errors++; return null; }
    }));
    const hit = res.find(Boolean);
    if (hit) return { date: hit, errors };
  }
  return { date: null, errors };
}

async function nextEarnings(sym, today, { fetchImpl = fetch, finnhubKey } = {}) {
  if (finnhubKey) {
    try { const d = await viaFinnhub(sym, today, finnhubKey, fetchImpl); if (d) return { date: d, source: 'finnhub' }; } catch (e) { /* fall back */ }
  }
  const n = await viaNasdaq(sym, today, fetchImpl);
  return { date: n.date, source: 'nasdaq', partial: n.errors > 0 };
}

exports.handler = async (event) => {
  const sym = String((event.queryStringParameters || {}).symbol || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (!sym) return resp(400, { error: 'Missing symbol parameter' });
  const today = iso(new Date());
  try {
    const r = await nextEarnings(sym, today, { finnhubKey: process.env.FINNHUB_KEY });
    return resp(200, { symbol: sym, ...r }, r.partial && !r.date ? 1800 : 43200);
  } catch (e) {
    return resp(502, { symbol: sym, date: null, error: e.message });
  }
};
Object.assign(exports, { nasdaqHit, finnhubNext, nextEarnings, addDays });
