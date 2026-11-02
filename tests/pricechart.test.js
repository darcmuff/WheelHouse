const test = require('node:test');
const assert = require('node:assert');
const { extractFn, extractConst } = require('./extract');
const F = new Function(['walkLegPairs','realisedPremium','shareRealisations', 'breakevenSteps', 'chartMarkers', 'priceChartSVG', 'chartWindow', 'stackTags', 'snapMarkers', 'wheelEndDate', 'earningsDays', 'calcWheel'].map(extractFn).join('\n') + '\n' + extractConst('CHART_KINDS') +
  '\nconst esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;"}[c]));let db;\nreturn {breakevenSteps,chartMarkers,priceChartSVG,chartWindow,stackTags,snapMarkers,wheelEndDate,earningsDays,calcWheel,setDb:d=>db=d};')();
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
const daily = (a, b, px = 20) => { const o = []; for (let d = new Date(a + 'T12:00:00Z'); d <= new Date(b + 'T12:00:00Z'); d = new Date(d.getTime() + 864e5)) o.push({ date: d.toISOString().slice(0, 10), close: px }); return o; };
test('closed wheel ranges count back from the wheel end date, open wheels from the latest price', () => {
  const cs = daily('2025-01-01', '2026-10-27');
  assert.deepStrictEqual(F.chartWindow(cs, '1M', '2026-03-02', '2026-06-30'), { from: '2026-05-30', end: '2026-06-30' });
  assert.deepStrictEqual(F.chartWindow(cs, '3M', '2026-03-02', null), { from: '2026-07-27', end: '2026-10-27' });
  assert.strictEqual(F.chartWindow(cs, 'All', '2026-03-02', '2026-06-30').from, '2026-03-02');
  assert.strictEqual(F.wheelEndDate([{ entered: '2026-06-01', expiry: '2026-06-30' }, { entered: '2026-06-20' }]), '2026-06-30');
  const trades = [{ action: 'CSP', entered: '2026-05-01', expiry: '2026-06-30', strike: 20, total: 50, shares: 100 }];
  const svg = F.priceChartSVG(cs, F.chartMarkers(trades, []), [], null, '1M', '2026-05-01', '2026-06-30');
  assert.strictEqual((svg.match(/class="ii pc-mk"/g) || []).length, 0); // marker 01/05 is outside 1M before end
  assert.ok(svg.includes('<polyline'));
});
test('assignment / call-away rows stored as share buys/sells (no strike) still get markers at the share price', () => {
  const t = [{ action: 'IN', entered: '2026-06-12', strike: null, premium: 16, shares: 400, total: 6400 },
    { action: 'OUT', entered: '2026-09-18', strike: '', premium: 0, shares: 400, total: 7200 }];
  const mk = F.chartMarkers(t, []);
  assert.deepStrictEqual(mk.map(m => [m.kind, m.strike]), [['in', 16], ['out', 18]]);
  assert.ok(mk[0].tip.startsWith('Assigned · At $16.00'));
});
test('no always-on marker text; right-edge tags never overlap; markers have a big hit area', () => {
  const cs = daily('2026-09-01', '2026-10-27', 130.2);
  const svg = F.priceChartSVG(cs, F.chartMarkers([{ action: 'CSP', entered: '2026-10-23', expiry: '2026-11-13', strike: 130, total: 666.92, shares: 400 }], []), [], 130, 'All', '2026-10-23');
  assert.ok(!svg.includes('pc-ml'));
  assert.ok(svg.includes('width="28" height="28" fill="transparent"'));
  const ys = F.stackTags([{ y: 100 }, { y: 104 }, { y: 101 }], 18, 10, 250).map(t => t.y).sort((a, b) => a - b);
  assert.ok(ys[1] - ys[0] >= 18 && ys[2] - ys[1] >= 18);
});
const weekdays = (a, b, px = 27) => daily(a, b, px).filter(c => { const w = new Date(c.date + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6; });
test('closed wheel: called-away row dated on a Saturday still gets a marker (snapped to Friday)', () => {
  const cs = weekdays('2025-08-01', '2026-10-27');
  const trades = [{ action: 'CSP', entered: '2025-09-15', expiry: '2025-10-03', strike: 28, total: 200, shares: 400 },
    { action: 'IN', entered: '2025-10-03', premium: 28, shares: 400, total: 11200 },
    { action: 'STOC', entered: '2025-11-21', expiry: '2025-11-28', strike: 27, total: 100, shares: 400 },
    { action: 'OUT', entered: '2025-11-29', premium: 27, shares: 400, total: 10800 }];
  const end = F.wheelEndDate(trades); assert.strictEqual(end, '2025-11-29');
  const mk = F.chartMarkers(trades, []);
  const svg = F.priceChartSVG(cs, mk, [], null, 'All', '2025-09-15', end);
  assert.strictEqual((svg.match(/class="ii pc-mk"/g) || []).length, 4);
  assert.ok(svg.includes('Called away · At $27.00'));
  const snapped = F.snapMarkers(mk, cs.filter(c => c.date <= '2025-11-29'), end);
  assert.strictEqual(snapped.find(m => m.kind === 'out').date, '2025-11-28');
});
test('duplicate share rows (two 200-share assignments same day/price) merge into one 400-share marker', () => {
  const mk = F.chartMarkers([{ action: 'IN', entered: '2025-10-03', premium: 28, shares: 200, total: 5600 }, { action: 'IN', entered: '2025-10-03', premium: 28, shares: 200, total: 5600 }], []);
  assert.strictEqual(mk.length, 1); assert.ok(mk[0].tip.startsWith('Assigned · At $28.00 · 400 sh · 03/10'));
});
test('open wheel: range always contains a recent marker, even when the last candle is before the trade', () => {
  const cs = weekdays('2026-06-12', '2026-10-22', 148);
  const mk = F.chartMarkers([{ action: 'CSP', entered: '2026-10-23', expiry: '2026-11-13', strike: 130, total: 666.92, shares: 400 }], []);
  for (const r of ['1M', '3M', '6M', 'All']) {
    const svg = F.priceChartSVG(cs, mk, [], 130, r, '2026-10-23', null);
    assert.strictEqual((svg.match(/class="ii pc-mk"/g) || []).length, 1, r);
  }
});
