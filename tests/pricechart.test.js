const test = require('node:test');
const assert = require('node:assert');
const { extractFn, extractConst } = require('./extract');
const F = new Function(['shareRealisations', 'breakevenSteps', 'chartMarkers', 'priceChartSVG', 'earningsDays', 'calcWheel'].map(extractFn).join('\n') + '\n' + extractConst('CHART_KINDS') +
  '\nconst esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;"}[c]));let db;\nreturn {breakevenSteps,chartMarkers,priceChartSVG,earningsDays,calcWheel,setDb:d=>db=d};')();
const opt = (i, a, ent, exp, k, p, ew) => { const g = p * 400, tot = Math.round((['CSP', 'STOC', 'STC'].includes(a) ? g - 1.08 : g + 1.08) * 100) / 100;
  return { id: 't' + i, wheelId: 'w1', action: a, entered: ent, expiry: exp, strike: k, premium: p, fees: 1.08, shares: 400, total: tot, ...(ew ? { expiredWorthless: true } : {}) }; };
const T = [opt(1, 'CSP', '2026-01-02', '2026-01-16', 52, 1.00, 1), opt(2, 'CSP', '2026-01-20', '2026-02-20', 50, 1.20), opt(3, 'BTC', '2026-02-18', '2026-02-20', 50, 2.10),
  opt(4, 'CSP', '2026-02-18', '2026-03-20', 48, 2.60), opt(5, 'BTC', '2026-03-18', '2026-03-20', 48, 3.40), opt(6, 'CSP', '2026-03-18', '2026-04-17', 46, 3.10),
  { id: 't7', wheelId: 'w1', action: 'IN', entered: '2026-04-17', strike: 46, shares: 400, total: 18400 },
  opt(8, 'STOC', '2026-04-22', '2026-05-15', 48, 1.10), opt(9, 'BTC', '2026-05-13', '2026-05-15', 48, 2.00), opt(10, 'STOC', '2026-05-13', '2026-06-19', 50, 1.90),
  { id: 't11', wheelId: 'w1', action: 'DIV', entered: '2026-06-15', shares: 400, total: 100 }];
test('breakeven steps start at assignment and use only trades up to each date', () => {
  const s = F.breakevenSteps(T).map(x => [x.date, x.value.toFixed(2)]);
  assert.deepStrictEqual(s, [['2026-04-17', '43.62'], ['2026-04-22', '42.52'], ['2026-05-13', '42.62'], ['2026-06-15', '42.37']]);
});
test('dividend lowers breakeven only from its own date', () => {
  const s = F.breakevenSteps(T.slice(0, 10));
  assert.strictEqual(s[s.length - 1].value.toFixed(2), '42.62'); // as of 01/06 — no future dividend
});
test('final step equals calcWheel breakeven', () => {
  F.setDb({ trades: T }); const m = F.calcWheel({ id: 'w1' });
  const s = F.breakevenSteps(T); assert.strictEqual(s[s.length - 1].value.toFixed(4), m.breakeven.toFixed(4));
});
test('markers: one per option/assignment trade, coloured by type, tip with vs breakeven', () => {
  const steps = F.breakevenSteps(T), mk = F.chartMarkers(T, steps);
  assert.strictEqual(mk.length, 10); // DIV has no marker
  assert.deepStrictEqual([...new Set(mk.map(m => m.kind))].sort(), ['btc', 'call', 'in', 'put']);
  const cc = mk.find(m => m.date === '2026-05-13' && m.kind === 'call');
  assert.strictEqual(cc.tip, 'CC · Strike $50.00 · 400 sh · 13/05→19/06 · Net +$758.92 · vs breakeven +$7.38');
  assert.ok(!mk.find(m => m.kind === 'put').tip.includes('vs breakeven')); // no shares held yet
  assert.strictEqual(mk.find(m => m.kind === 'put').color, '#7c5cd6');
});
test('chart svg has price line, markers, breakeven label and open strike', () => {
  const cs = []; for (let d = new Date('2026-01-01'); d <= new Date('2026-06-01'); d.setDate(d.getDate() + 1)) cs.push({ date: d.toISOString().slice(0, 10), close: 47 });
  const steps = F.breakevenSteps(T.slice(0, 10)), svg = F.priceChartSVG(cs, F.chartMarkers(T, steps), steps, 50, 'All', '2026-01-02');
  assert.ok(svg.includes('<polyline')); assert.ok(svg.includes('Breakeven $42.62')); assert.ok(svg.includes('Open strike $50'));
  assert.strictEqual((svg.match(/class="ii pc-mk"/g) || []).length, 10);
  assert.ok((F.priceChartSVG(cs, [], [], null, '1M').match(/<text[^>]*>\w{3}<\/text>/g) || []).length <= 2);
});
test('earnings days', () => { assert.strictEqual(F.earningsDays('2026-11-03', '2026-10-28'), 6); assert.strictEqual(F.earningsDays(null, '2026-10-28'), null); });
test('candles function parses Cboe rows, drops zeros, filters dates', async () => {
  const c = require('../netlify/functions/candles.js');
  const rows = c.parseCandles({ data: [{ date: '2020-01-01', close: 0 }, { date: '2026-01-02', close: 49.2 }, { date: '2026-01-01', close: 48 }, { date: '2027-01-01', close: 1 }] }, '2026-01-01', '2026-12-31');
  assert.deepStrictEqual(rows, [{ date: '2026-01-01', close: 48 }, { date: '2026-01-02', close: 49.2 }]);
  const got = await c.getCandles('SOFI', '2026-01-01', '2026-12-31', { fetchImpl: async u => ({ ok: true, json: async () => ({ data: [{ date: '2026-03-03', close: 20 }] }) }) });
  assert.strictEqual(got.length, 1);
  await assert.rejects(c.getCandles('X', null, null, { fetchImpl: async () => ({ ok: false, status: 403 }) }));
});
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
