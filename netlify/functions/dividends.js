// Next ex-dividend date and cash amount for a symbol.
// Nasdaq's quote dividend table first (one request; covers Nasdaq-listed names, including announced future dates).
// For symbols Nasdaq does not keep a table for (typically NYSE — "Dividend History for Non-Nasdaq symbols is not available"),
// scan the public dividend calendar in weekday batches up to ~90 days and stop on the first hit.
// Finnhub's dividend endpoint is premium — not used. Returns {date:null,amount:null} when none is found.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const DAYS = 90, BATCH = 10;
const resp = (code, body, maxAge) => ({ statusCode: code, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': maxAge ? `public, max-age=3600, s-maxage=${maxAge}` : 'no-store' }, body: JSON.stringify(body) });
const iso = d => d.toISOString().slice(0, 10);
const addDays = (s, n) => iso(new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5));
const isWeekday = s => { const w = new Date(s + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6; };

// Pure: "11/19/2026" or "2026-11-19" → ISO date, or null.
function parseMdY(s) {
  if (!s || s === 'N/A') return null;
  const t = String(s).trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  return null;
}
// Pure: "$0.27", "1.48", 0.53 → number, or null.
function parseAmount(s) {
  if (s == null || s === '' || s === 'N/A') return null;
  if (typeof s === 'number' && isFinite(s)) return s;
  const n = parseFloat(String(s).replace(/[$,]/g, ''));
  return isFinite(n) ? n : null;
}
function isCashType(t) {
  if (t == null || t === '' || t === 'N/A') return true;
  return /cash/i.test(String(t));
}

// Pure: Nasdaq quote/{SYM}/dividends JSON → next cash ex-div on or after today, or null.
// A present row table with only past dates means none upcoming (do not calendar-scan).
// Returns {date, amount} | null, and {unavailable:true} when Nasdaq has no table for this symbol.
function nasdaqQuoteNext(json, today) {
  const data = json && json.data;
  const msg = json && json.message ? String(json.message) : '';
  if (/not available/i.test(msg) && !(data && data.dividends && Array.isArray(data.dividends.rows))) {
    return { unavailable: true };
  }
  if (!data) return null;
  const rows = data.dividends && Array.isArray(data.dividends.rows) ? data.dividends.rows : null;
  if (!rows) {
    if (/not available/i.test(msg) || data.exDividendDate === 'N/A') return { unavailable: true };
    return null;
  }
  const cands = [];
  rows.forEach(r => {
    if (!r || !isCashType(r.type)) return;
    const date = parseMdY(r.exOrEffDate);
    const amount = parseAmount(r.amount);
    if (date && date >= today && amount != null && amount > 0) cands.push({ date, amount });
  });
  cands.sort((a, b) => a.date.localeCompare(b.date));
  return cands[0] || null;
}

// Pure: one day's Nasdaq dividend calendar JSON → {date, amount} if this symbol is listed, else null.
function nasdaqCalHit(json, sym, today) {
  const cal = json && json.data && json.data.calendar;
  const rows = Array.isArray(cal) ? cal : (cal && Array.isArray(cal.rows) ? cal.rows : []);
  const r = rows.find(x => x && String(x.symbol || '').toUpperCase() === sym);
  if (!r) return null;
  const date = parseMdY(r.dividend_Ex_Date || r.exOrEffDate || r.dividend_ex_date);
  const amount = parseAmount(r.dividend_Rate ?? r.dividend_rate ?? r.amount);
  if (!date || date < today) return null;
  return { date, amount: amount != null && amount > 0 ? amount : null };
}

async function viaQuote(sym, today, fetchImpl) {
  const r = await fetchImpl(`https://api.nasdaq.com/api/quote/${encodeURIComponent(sym)}/dividends?assetclass=stocks`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return { unavailable: true, error: true };
  return nasdaqQuoteNext(await r.json(), today);
}

async function viaCalendar(sym, today, fetchImpl) {
  const days = []; for (let i = 0; i <= DAYS; i++) { const d = addDays(today, i); if (isWeekday(d)) days.push(d); }
  let errors = 0;
  for (let i = 0; i < days.length; i += BATCH) {
    const batch = days.slice(i, i + BATCH);
    const res = await Promise.all(batch.map(async d => {
      try {
        const r = await fetchImpl(`https://api.nasdaq.com/api/calendar/dividends?date=${d}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) { errors++; return null; }
        return nasdaqCalHit(await r.json(), sym, today);
      } catch (e) { errors++; return null; }
    }));
    const hit = res.find(Boolean);
    if (hit) return { ...hit, errors };
  }
  return { date: null, amount: null, errors };
}

async function nextDividend(sym, today, { fetchImpl = fetch } = {}) {
  try {
    const q = await viaQuote(sym, today, fetchImpl);
    if (q && q.date) return { date: q.date, amount: q.amount, source: 'nasdaq' };
    if (!q || !q.unavailable) return { date: null, amount: null, source: 'nasdaq' };
  } catch (e) { /* fall back to the calendar */ }
  const n = await viaCalendar(sym, today, fetchImpl);
  return { date: n.date || null, amount: n.amount || null, source: 'nasdaq-cal', partial: n.errors > 0 };
}

const _handler = async (event) => {
  const sym = String((event.queryStringParameters || {}).symbol || '').toUpperCase().replace(/[^A-Z0-9.\-]/g, '');
  if (!sym) return resp(400, { error: 'Missing symbol parameter' });
  const today = iso(new Date());
  try {
    const r = await nextDividend(sym, today);
    return resp(200, { symbol: sym, ...r }, r.partial && !r.date ? 1800 : 43200);
  } catch (e) {
    return resp(502, { symbol: sym, date: null, amount: null, error: e.message });
  }
};
Object.assign(exports, { parseMdY, parseAmount, nasdaqQuoteNext, nasdaqCalHit, nextDividend, addDays });
exports.handler = require('../lib/origin').guard(_handler);
