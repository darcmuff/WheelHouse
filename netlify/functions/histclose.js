// Historical underlying price at open for delta-at-open estimates.
// Daily close by default. When a fill timestamp is given, try 1-minute, then
// 5-minute, then hourly bars, then the daily close. Finnhub first (already
// used by quote/symbol/earnings); Yahoo as a public fallback if Finnhub has
// no bars. Display-only — does not change P&L or pricing.
const NY = 'America/New_York';

function nyDate(ms) {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: NY });
}

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function parseAts(raw) {
  return String(raw || '').split(',').map(s => s.trim()).filter(Boolean).filter(s => isFinite(Date.parse(s)));
}

function parseDates(raw) {
  return String(raw || '').split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
}

function ageDays(ms, now) {
  return (now - ms) / 864e5;
}

function pickCloseOnOrBefore(closes, date) {
  if (closes[date] != null) return { price: closes[date], date, precision: 'day', bar: '1d' };
  for (let i = 1; i <= 10; i++) {
    const d = addDays(date, -i);
    if (closes[d] != null) return { price: closes[d], date: d, precision: 'day', bar: '1d' };
  }
  return null;
}

function pickBar(times, closes, fillMs, precision, bar) {
  if (!times || !times.length) return null;
  let i = -1;
  for (let k = 0; k < times.length; k++) {
    if (times[k] * 1000 <= fillMs) i = k;
    else break;
  }
  if (i < 0) return null;
  const px = closes[i];
  if (!(px > 0)) return null;
  const width = bar === '1m' ? 60e3 : bar === '5m' ? 300e3 : 3600e3;
  if (fillMs - times[i] * 1000 > width * 2) return null;
  return { price: Math.round(px * 10000) / 10000, precision, bar, at: new Date(times[i] * 1000).toISOString() };
}

async function finnhubCandle(symbol, resolution, fromSec, toSec, fetchImpl, key) {
  const url = `https://finnhub.io/api/v1/stock/candle?symbol=${encodeURIComponent(symbol)}&resolution=${encodeURIComponent(resolution)}&from=${fromSec}&to=${toSec}&token=${key}`;
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const j = await r.json();
  if (!j || j.s !== 'ok' || !Array.isArray(j.t) || !Array.isArray(j.c)) return null;
  return { t: j.t, c: j.c, source: 'finnhub' };
}

async function yahooChart(symbol, interval, fromSec, toSec, fetchImpl) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&period1=${fromSec}&period2=${toSec}`;
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) return null;
  const j = await r.json();
  const res = j && j.chart && j.chart.result && j.chart.result[0];
  const ts = res && res.timestamp;
  const close = res && res.indicators && res.indicators.quote && res.indicators.quote[0] && res.indicators.quote[0].close;
  if (!Array.isArray(ts) || !Array.isArray(close)) return null;
  const t = [], c = [];
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] && close[i] > 0) { t.push(ts[i]); c.push(close[i]); }
  }
  return t.length ? { t, c, source: 'yahoo' } : null;
}

async function candles(symbol, resolution, fromSec, toSec, { fetchImpl, finnhubKey }) {
  if (finnhubKey) {
    try {
      const fh = await finnhubCandle(symbol, resolution, fromSec, toSec, fetchImpl, finnhubKey);
      if (fh) return fh;
    } catch (e) { /* fall through */ }
  }
  const yahooInterval = resolution === '1' ? '1m' : resolution === '5' ? '5m' : resolution === '60' ? '60m' : '1d';
  try {
    return await yahooChart(symbol, yahooInterval, fromSec, toSec, fetchImpl);
  } catch (e) {
    return null;
  }
}

function dailyMap(candle) {
  const out = {};
  if (!candle) return out;
  for (let i = 0; i < candle.t.length; i++) {
    if (candle.c[i] > 0) out[nyDate(candle.t[i] * 1000)] = candle.c[i];
  }
  return out;
}

async function histClose(symbol, dates, ats, { fetchImpl = fetch, finnhubKey, now } = {}) {
  const sym = String(symbol || '').toUpperCase().trim();
  const nowMs = now || Date.now();
  const dateSet = new Set(dates || []);
  (ats || []).forEach(a => {
    const d = nyDate(Date.parse(a));
    if (d) dateSet.add(d);
  });
  const dateList = [...dateSet].sort();
  const closes = {};
  const spots = {};
  const sources = [];

  let minDate = dateList[0], maxDate = dateList[dateList.length - 1];
  (ats || []).forEach(a => {
    const d = nyDate(Date.parse(a));
    if (!minDate || d < minDate) minDate = d;
    if (!maxDate || d > maxDate) maxDate = d;
  });
  if (minDate) minDate = addDays(minDate, -12);
  if (maxDate) maxDate = addDays(maxDate, 1);

  if (minDate && maxDate) {
    const from = Math.floor(Date.parse(minDate + 'T00:00:00Z') / 1000);
    const to = Math.floor(Date.parse(maxDate + 'T23:59:59Z') / 1000);
    const daily = await candles(sym, 'D', from, to, { fetchImpl, finnhubKey });
    Object.assign(closes, dailyMap(daily));
    if (daily && daily.source && !sources.includes(daily.source)) sources.push(daily.source);
  }

  const byDate = {};
  dateList.forEach(d => {
    const hit = pickCloseOnOrBefore(closes, d);
    if (hit) byDate[d] = hit;
  });

  for (const at of (ats || [])) {
    const fillMs = Date.parse(at);
    const age = ageDays(fillMs, nowMs);
    const day = nyDate(fillMs);
    const windowStart = Math.floor(fillMs / 1000) - 3 * 3600;
    const windowEnd = Math.floor(fillMs / 1000) + 3 * 3600;
    let hit = null, src = null;

    const tryRes = async (res, precision, bar, maxAge) => {
      if (hit || age > maxAge) return;
      const c = await candles(sym, res, windowStart, windowEnd, { fetchImpl, finnhubKey });
      if (!c) return;
      const barHit = pickBar(c.t, c.c, fillMs, precision, bar);
      if (barHit) {
        hit = barHit;
        src = c.source;
      }
    };

    await tryRes('1', 'minute', '1m', 30);
    await tryRes('5', 'minute', '5m', 60);
    await tryRes('60', 'hour', '60m', 730);
    if (hit) {
      spots[at] = hit;
      if (src && !sources.includes(src)) sources.push(src);
    } else {
      const dayHit = pickCloseOnOrBefore(closes, day);
      if (dayHit) spots[at] = dayHit;
    }
  }

  return { symbol: sym, closes: byDate, spots, source: sources[0] || null, sources };
}

const _handler = async (event) => {
  const q = event.queryStringParameters || {};
  const sym = String(q.symbol || '').toUpperCase().trim();
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600', 'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=86400' };
  if (!sym || !/^[A-Z][A-Z0-9.]{0,9}$/.test(sym)) {
    return { statusCode: 400, headers: { ...headers, 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Missing or bad symbol' }) };
  }
  const dates = parseDates(q.dates);
  const ats = parseAts(q.at);
  if (!dates.length && !ats.length) {
    return { statusCode: 400, headers: { ...headers, 'Cache-Control': 'no-store' }, body: JSON.stringify({ error: 'Missing dates or at' }) };
  }
  try {
    const out = await histClose(sym, dates, ats, { finnhubKey: process.env.FINNHUB_KEY });
    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (e) {
    return { statusCode: 200, headers: { ...headers, 'Cache-Control': 'no-store' }, body: JSON.stringify({ symbol: sym, closes: {}, spots: {}, source: null, error: 'lookup failed' }) };
  }
};

exports.histClose = histClose;
exports.pickCloseOnOrBefore = pickCloseOnOrBefore;
exports.pickBar = pickBar;
exports.parseDates = parseDates;
exports.parseAts = parseAts;
exports.nyDate = nyDate;
exports.handler = require('../lib/origin').guard(_handler);
