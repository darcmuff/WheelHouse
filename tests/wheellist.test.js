const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { extractFn } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const names = ['walkLegPairs', 'wheelSellOutcomes', 'realisedPremium', 'wheelListCmp', 'wheelLegOcc', 'capturedCellHtml', 'ppdCellHtml', 'toStrike', 'closedCapturedHtml', 'wheelCloseSlices', 'wheelRemainLabel', 'wheelCapturedOnClose', 'wheelListCells'];
const F = new Function('fmtMoney', 'fmt2', names.map(extractFn).join('\n') + `\nreturn {${names.join(',')}};`)(
  v => '$' + v.toFixed(2), v => v.toFixed(2));
const tr = (id, a, ent, exp, k, p, sh, tot, x) => ({ id, action: a, entered: ent, expiry: exp, strike: k, premium: p, shares: sh, total: tot, ...(x || {}) });
test('bought-back CSP: kept % from buy-back price, net = sell total − buy-back total', () => {
  const T = [tr('a', 'CSP', '2026-01-02', '2026-02-20', 50, 1.20, 400, 478.92), tr('b', 'BTC', '2026-02-10', '2026-02-20', 50, 0.30, 400, 121.08)];
  const o = F.wheelSellOutcomes(T);
  assert.strictEqual(o.a.kept, 75); assert.strictEqual(o.a.net, 357.84); assert.strictEqual(o.a.end, '2026-02-10'); assert.strictEqual(o.a.px, 0.3);
  assert.strictEqual(o.b, undefined);
});
test('expired worthless and assigned sells keep the whole premium', () => {
  const T = [tr('a', 'CSP', '2026-01-02', '2026-01-16', 52, 1, 400, 398.92, { expiredWorthless: true }),
    tr('c', 'CSP', '2026-01-20', '2026-02-20', 46, 1, 400, 398.92), tr('d', 'IN', '2026-02-20', null, 46, 46, 400, 18400)];
  const o = F.wheelSellOutcomes(T);
  assert.strictEqual(o.a.kept, 100); assert.strictEqual(o.a.net, 398.92);
  assert.strictEqual(o.c.kept, 100); assert.strictEqual(o.c.net, 398.92);
});
test('open sell has no realised outcome', () => {
  assert.deepStrictEqual(F.wheelSellOutcomes([tr('a', 'STOC', '2026-10-01', '2099-01-01', 50, 1, 100, 99)]), {});
});
test('same day: own buy back above its sell, new sell above other close', () => {
  const T = [tr('s1', 'CSP', '2026-03-01', '2026-03-20', 50, 1, 100, 99), tr('b1', 'BTC', '2026-03-18', '2026-03-20', 50, .5, 100, 51),
    tr('s2', 'CSP', '2026-03-18', '2026-04-17', 48, 1.2, 100, 119), tr('s3', 'CSP', '2026-03-18', '2026-03-18', 47, .1, 100, 9), tr('b3', 'BTC', '2026-03-18', '2026-03-18', 47, .05, 100, 6)];
  const { pairs } = F.walkLegPairs(T);
  const ord = [...T].sort((a, b) => F.wheelListCmp(a, b, pairs, x => T.indexOf(x))).map(t => t.id);
  assert.ok(ord.indexOf('s2') < ord.indexOf('b1'));
  assert.ok(ord.indexOf('b3') < ord.indexOf('s3'));
  assert.strictEqual(ord[ord.length - 1], 's1');
});
test('OCC symbol and shared cells match LEAP formatting', () => {
  assert.strictEqual(F.wheelLegOcc('spcx', { action: 'CSP', expiry: '2026-11-20', strike: 19.5 }), 'SPCX261120P00019500');
  assert.strictEqual(F.toStrike(144.57, 170).text, '+17.6% · $25.43');
  assert.strictEqual(F.capturedCellHtml(60, 123, true).html, '60% <span class="g">+$123.00</span>');
  assert.strictEqual(F.capturedCellHtml(null).html, '—');
  assert.ok(F.ppdCellHtml(10, 4).startsWith('$10.00'));
});
test('bought-back Captured is drawn on the BTC row; the CSP row keeps PPD and a dash', () => {
  const T = [tr('c2', 'CSP', '2026-11-09', '2026-11-23', 130, 2.51, 400, 1001.84, { fees: 2.16 }), tr('b2', 'BTC', '2026-11-11', '2026-11-23', 130, 2.10, 400, 842.16, { fees: 2.16 })];
  const L = { trades: T, outcomes: F.wheelSellOutcomes(T), openIds: new Set(), spot: 0, today: '2026-11-11', marks: {} };
  const csp = F.wheelListCells(T[0], L), btc = F.wheelListCells(T[1], L);
  assert.strictEqual(csp.cap, '—');
  assert.ok(csp.ppd.includes('$79.84') && csp.ppd.includes('(2d)'), csp.ppd);
  assert.ok(btc.cap.includes('16%') && btc.cap.includes('at $2.10') && btc.cap.includes('+$159.68'), btc.cap);
  assert.strictEqual(btc.ppd, '—');
});
test('partial buy-back: each BTC keeps its own contracts, the rest expires on the sale', () => {
  const T = [tr('c', 'CSP', '2026-10-01', '2026-10-17', 50, 1, 500, 500),
    tr('b1', 'BTC', '2026-10-08', '2026-10-17', 50, 0.4, 200, 80),
    tr('b2', 'BTC', '2026-10-12', '2026-10-17', 50, 0.3, 100, 30)];
  const L = { trades: T, outcomes: F.wheelSellOutcomes(T), openIds: new Set(), spot: 0, today: '2026-11-12', marks: {} };
  const b1 = F.wheelListCells(T[1], L), b2 = F.wheelListCells(T[2], L), csp = F.wheelListCells(T[0], L);
  assert.ok(b1.cap.includes('60%') && b1.cap.includes('at $0.40') && b1.cap.includes('+$120.00'), b1.cap);
  assert.ok(b2.cap.includes('70%') && b2.cap.includes('at $0.30') && b2.cap.includes('+$70.00'), b2.cap);
  assert.ok(csp.cap.includes('100%') && csp.cap.includes('at $0.00') && csp.cap.includes('+$200.00'), csp.cap);
  assert.strictEqual(F.wheelRemainLabel(T[0], T, '2026-11-12'), '2 expired of 5');
  assert.strictEqual(F.wheelRemainLabel(T[0], T, '2026-10-15'), '2 open of 5');
  const asn = tr('in', 'IN', '2026-10-16', null, 50, 50, 200, 10000);
  const { open: left, pairs } = F.walkLegPairs([T[0], T[1], asn]);
  assert.strictEqual(left.find(o => o.id === 'c')._rem, 100);
  assert.strictEqual(pairs.in[0].shares, 200);
  const prem = F.realisedPremium([tr('cc', 'STOC', '2026-10-01', '2026-10-17', 50, 1, 300, 300), tr('stc', 'STC', '2026-10-10', '2026-10-17', 50, 0.4, 200, 80)], '2026-11-12');
  assert.ok(prem.events.some(e => e.amount === -80), JSON.stringify(prem.events));
});
test('expiry and assignment keep Captured on the opener', () => {
  const T = [tr('a', 'CSP', '2026-01-02', '2026-01-16', 52, 1, 400, 398.92, { expiredWorthless: true }),
    tr('c', 'CSP', '2026-01-20', '2026-02-20', 46, 1, 400, 398.92), tr('d', 'IN', '2026-02-20', null, 46, 46, 400, 18400)];
  const L = { trades: T, outcomes: F.wheelSellOutcomes(T), openIds: new Set(), spot: 0, today: '2026-02-20', marks: {} };
  assert.ok(F.wheelListCells(T[0], L).cap.includes('100%'));
  assert.ok(F.wheelListCells(T[1], L).cap.includes('100%'));
  assert.strictEqual(F.wheelListCells(T[2], L).cap, '—');
});
test('wheel card table uses the LEAP list header, row Edit and list cells', () => {
  assert.match(SRC, /trade-body open pmcc-open wheel-list[\s\S]{0,700}tradeTableHead\(\{lastCol:'Captured',toStrike:true\}\)/);
  assert.match(SRC, /renderTradeRow\(t,m\.trades,\{list:_L\}\)/);
  assert.match(SRC, /opts\.editBtn\?`<button class="btn btn-ghost btn-sm" onclick="\$\{editOn\};event\.stopPropagation\(\)">Edit<\/button>`/);
});
