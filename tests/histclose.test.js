// histclose.test.js — pick a daily close or the bar at fill time.
const test = require('node:test');
const assert = require('node:assert');
const H = require('../netlify/functions/histclose.js');

test('daily close uses that date, or the previous session if the date is a weekend', () => {
  const closes = { '2026-01-16': 100, '2026-01-15': 99 };
  assert.deepStrictEqual(H.pickCloseOnOrBefore(closes, '2026-01-16'), { price: 100, date: '2026-01-16', precision: 'day', bar: '1d' });
  const sun = H.pickCloseOnOrBefore(closes, '2026-01-18');
  assert.strictEqual(sun.price, 100);
  assert.strictEqual(sun.date, '2026-01-16');
  assert.strictEqual(sun.precision, 'day');
  assert.strictEqual(H.pickCloseOnOrBefore({}, '2026-01-16'), null);
});

test('pickBar uses the bar that contains the fill, and skips a bar that is too old', () => {
  const t0 = Date.parse('2026-01-16T15:31:00-05:00') / 1000;
  const times = [t0, t0 + 60, t0 + 120];
  const closes = [10, 10.5, 11];
  const fill = Date.parse('2026-01-16T15:32:40-05:00');
  const hit = H.pickBar(times, closes, fill, 'minute', '1m');
  assert.strictEqual(hit.price, 10.5);
  assert.strictEqual(hit.precision, 'minute');
  assert.strictEqual(hit.bar, '1m');
  const late = Date.parse('2026-01-16T16:00:00-05:00');
  assert.strictEqual(H.pickBar(times, closes, late, 'minute', '1m'), null);
});

test('histClose tries 1-minute bars first, then falls back to the daily close', async () => {
  const fill = '2026-01-16T15:32:40-05:00';
  const fillSec = Date.parse(fill) / 1000;
  const calls = [];
  const fake = async (url) => {
    calls.push(url);
    if (url.includes('resolution=1') || url.includes('interval=1m')) {
      return { ok: true, json: async () => ({ s: 'ok', t: [fillSec - 40], c: [123.45], chart: { result: [{ timestamp: [fillSec - 40], indicators: { quote: [{ close: [123.45] }] } }] } }) };
    }
    if (url.includes('resolution=D') || url.includes('interval=1d')) {
      // Finnhub daily: midnight UTC 16 Jan is still 15 Jan in New York, so use 21:00 UTC = 16:00 ET
      const day = Date.parse('2026-01-16T21:00:00Z') / 1000;
      return { ok: true, json: async () => ({ s: 'ok', t: [day], c: [120], chart: { result: [{ timestamp: [day], indicators: { quote: [{ close: [120] }] } }] } }) };
    }
    return { ok: false, status: 404, json: async () => ({ s: 'no_data' }) };
  };
  const r = await H.histClose('AAPL', ['2026-01-16'], [fill], { fetchImpl: fake, finnhubKey: 'k', now: Date.parse('2026-01-20T00:00:00Z') });
  assert.ok(calls.some(u => u.includes('finnhub') && u.includes('resolution=1')), calls);
  assert.ok(r.spots[fill]);
  assert.strictEqual(r.spots[fill].precision, 'minute');
  assert.strictEqual(r.spots[fill].price, 123.45);
  assert.strictEqual(r.closes['2026-01-16'].price, 120);
  assert.strictEqual(r.closes['2026-01-16'].precision, 'day');
});

test('histClose falls back to the daily close when no intraday bars exist', async () => {
  const fill = '2025-06-02T10:00:00-04:00';
  const fake = async (url) => {
    if (url.includes('resolution=D') || url.includes('interval=1d')) {
      const day = Date.parse('2025-06-02T20:00:00Z') / 1000;
      return { ok: true, json: async () => ({ s: 'ok', t: [day], c: [50], chart: { result: [{ timestamp: [day], indicators: { quote: [{ close: [50] }] } }] } }) };
    }
    return { ok: true, json: async () => ({ s: 'no_data', chart: { result: [null] } }) };
  };
  const r = await H.histClose('KO', [], [fill], { fetchImpl: fake, finnhubKey: 'k', now: Date.parse('2026-11-23T00:00:00Z') });
  assert.ok(r.spots[fill]);
  assert.strictEqual(r.spots[fill].precision, 'day');
  assert.strictEqual(r.spots[fill].price, 50);
});
