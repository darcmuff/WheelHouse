const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
// Earnings helpers (were in pricechart.test.js; the wheel price chart itself was removed in sw v268).
const F = new Function(extractFn('earningsDays') + '\nreturn {earningsDays};')();
test('earnings days', () => { assert.strictEqual(F.earningsDays('2026-11-03', '2026-10-28'), 6); assert.strictEqual(F.earningsDays(null, '2026-10-28'), null); });
test('earnings function: Finnhub first, Nasdaq fallback scanning days', async () => {
  const e = require('../netlify/functions/earnings.js');
  assert.strictEqual(e.finnhubNext({ earningsCalendar: [{ symbol: 'SOFI', date: '2026-10-01' }, { symbol: 'SOFI', date: '2027-01-27' }] }, 'SOFI', '2026-10-28'), '2027-01-27');
  assert.ok(e.nasdaqHit({ data: { rows: [{ symbol: 'TSLA', time: 'time-after-hours' }] } }, 'TSLA'));
  const calls = [];
  const fake = async u => { calls.push(u); if (u.includes('finnhub')) return { ok: false, status: 403 };
    return { ok: true, json: async () => ({ data: { rows: u.includes('2026-11-04') ? [{ symbol: 'SOFI' }] : [] } }) }; };
  const r = await e.nextEarnings('SOFI', '2026-10-28', { fetchImpl: fake, finnhubKey: 'k' });
  assert.deepStrictEqual(r, { date: '2026-11-04', source: 'nasdaq', partial: false });
  assert.ok(calls[0].includes('finnhub'));
  const none = await e.nextEarnings('SOFI', '2026-10-28', { fetchImpl: async () => ({ ok: true, json: async () => ({ data: { rows: [] } }) }) });
  assert.strictEqual(none.date, null);
});
