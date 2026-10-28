const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { extractFn } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const L = new Function('db', ['shareRealisations', 'calcWheel', 'wheelCardSummary', 'wheelStage'].map(extractFn).join('\n') + '\nreturn {shareRealisations,calcWheel,wheelCardSummary,wheelStage};');
// ACME example wheel: 400 shares, fees $1.08 per option
const opt = (i, a, ent, exp, k, p, ew) => { const g = p * 400, tot = Math.round((['CSP', 'STOC', 'STC'].includes(a) ? g - 1.08 : g + 1.08) * 100) / 100;
  return { id: 't' + i, wheelId: 'w1', ticker: 'ACME', action: a, entered: ent, expiry: exp, strike: k, premium: p, fees: 1.08, shares: 400, total: tot, ...(ew ? { expiredWorthless: true } : {}) }; };
const T = [opt(1, 'CSP', '2026-01-02', '2026-01-16', 52, 1.00, 1), opt(2, 'CSP', '2026-01-20', '2026-02-20', 50, 1.20), opt(3, 'BTC', '2026-02-18', '2026-02-20', 50, 2.10),
  opt(4, 'CSP', '2026-02-18', '2026-03-20', 48, 2.60), opt(5, 'BTC', '2026-03-18', '2026-03-20', 48, 3.40), opt(6, 'CSP', '2026-03-18', '2026-04-17', 46, 3.10),
  { id: 't7', wheelId: 'w1', action: 'IN', entered: '2026-04-17', strike: 46, premium: 46, fees: 0, shares: 400, total: 18400 },
  opt(8, 'STOC', '2026-04-22', '2026-05-15', 48, 1.10), opt(9, 'BTC', '2026-05-13', '2026-05-15', 48, 2.00), opt(10, 'STOC', '2026-05-13', '2026-06-19', 50, 1.90),
  { id: 't11', wheelId: 'w1', action: 'DIV', entered: '2026-06-15', shares: 400, total: 100 },
  opt(12, 'STOC', '2026-06-22', '2026-07-17', 50, 1.40),
  { id: 't13', wheelId: 'w1', action: 'OUT', entered: '2026-07-17', strike: 50, premium: 50, fees: 0, shares: 400, total: 20000 }];
const at = (k, status = 'open') => { const db = { wheels: [{ id: 'w1', status }], trades: T.slice(0, k) }; const F = L(db); const m = F.calcWheel(db.wheels[0]);
  const lots = F.shareRealisations(db.trades); return { F, m, open: lots.open.w1 || { shares: 0, cost: 0 }, realised: (lots.byWheel && lots.byWheel.w1) }; };
test('stage 2 (assigned): breakeven $43.62, assigned at $46, sell calls above $43.62', () => {
  const { F, m, open } = at(7);
  const s = F.wheelCardSummary({ sharesHeld: m.sharesHeld, breakeven: m.breakeven, openShares: open.shares, openCost: open.cost, openPos: null, premiumNet: m.premiumNet, divs: 0, closed: false });
  assert.ok(s.held); assert.strictEqual(s.breakeven.toFixed(2), '43.62'); assert.strictEqual(s.assignedAt, 46);
  assert.strictEqual(s.sellAbove, 43.62); assert.strictEqual(s.below, false); assert.strictEqual(s.showAddButtons, true);
});
test('stage 3 (call open): breakeven $42.37 after premium + dividend; sell-calls memo rounds up to $42.38', () => {
  const { F, m, open } = at(11);
  assert.strictEqual(Math.round(m.premiumNet * 100) / 100, 1350.28);
  const s = F.wheelCardSummary({ sharesHeld: m.sharesHeld, breakeven: m.breakeven, openShares: open.shares, openCost: open.cost, openPos: { action: 'STOC', strike: 50 }, premiumNet: m.premiumNet, divs: 100, closed: false });
  assert.strictEqual(s.breakeven.toFixed(2), '42.37'); assert.strictEqual(s.sellAbove, 42.38); assert.strictEqual(s.below, false);
});
test('a call struck below breakeven is flagged', () => {
  const s = L({ wheels: [], trades: [] }).wheelCardSummary({ sharesHeld: 400, breakeven: 42.3743, openShares: 400, openCost: 18400, openPos: { action: 'STOC', strike: 40 } });
  assert.strictEqual(s.below, true); assert.strictEqual(s.callStrike, 40);
});
test('closed wheel: total result $3,609.20 and add buttons hidden', () => {
  const { F, m } = at(13, 'closed');
  assert.strictEqual(m.sharesHeld, 0);
  const s = F.wheelCardSummary({ sharesHeld: 0, breakeven: m.breakeven, premiumNet: m.premiumNet, sharesRealised: 1600, divs: 100, closed: true });
  assert.strictEqual(s.total, 3609.2); assert.strictEqual(s.showAddButtons, false); assert.strictEqual(s.held, false);
});
test('card markup: breakeven box first, memo with tip, no Last action / Cycle return / Open leg boxes', () => {
  assert.ok(SRC.includes('<div class="wl-facts">${_f2}${_fCur}${_f3}${_fCall}${_fTot}${_fAroc}${_fPrem}${_fDays}</div>'));
  assert.ok(SRC.includes('<span>Breakeven</span><b>$${fmt2(_cs.breakeven)}</b>'));
  assert.ok(SRC.includes('Your breakeven after all premium and dividends. Calls struck above this lock in a profit if called away.'));
  assert.ok(!SRC.includes("_fact('Last action',lastAct)"));
  assert.ok(SRC.includes('${_cs.showAddButtons?`<button class="btn btn-primary btn-sm" onclick="openPasteTrade'));
  assert.ok(SRC.includes('Holding ${m.sharesHeld} shares · no call yet'));
});

test('wheel card: no More numbers disclosure; premium collected and days in cycle sit in the facts row', () => {
  const card = SRC.slice(SRC.indexOf('const wheelCardBody='), SRC.indexOf('const metricsBar='));
  const ret = SRC.slice(SRC.indexOf('${wheelCardBody}'), SRC.indexOf('${wheelCardBody}') + 40);
  assert.ok(!/wl-more/.test(ret));
  assert.ok(SRC.includes("_fact('Premium collected'") && SRC.includes("_fact('Days in cycle'"));
  assert.ok(card.includes('${_fPrem}${_fDays}'));
});

test('metrics rows: space-between, first flush left, last flush right, single row', () => {
  assert.ok(SRC.includes('.wl-facts{display:flex;justify-content:space-between;gap:0.75rem;flex-wrap:nowrap;padding-inline:3rem}.wl-facts>.wl-f{flex:0 1 auto;min-width:0}'));
  assert.ok(SRC.includes('.lc-hero{display:flex;justify-content:space-between;gap:1.75rem;margin-top:0.75rem;flex-wrap:nowrap;padding-inline:3rem}'));
  assert.ok(!/\.wl-facts>\.wl-f\{flex:1 1 0/.test(SRC));
  assert.ok(SRC.includes('.wl-facts>.wl-f:last-child:not(:first-child){text-align:right}'));
});

test('wheel card: open-option cell is labelled Profit with signed $ and % underneath', () => {
  assert.ok(SRC.includes('<span>Profit</span>'));
  assert.ok(!SRC.includes("<span>Current value</span>"));
  assert.ok(SRC.includes("${_curPft>=0?'+':'-'}${fmtMoney(Math.abs(_curPft))}"));
});

test('wheel card Profit is chain-aware', () => {
  assert.ok(SRC.includes('const _curChain=wheelChainProfit(m.trades,_curOpt,_curVal);'));
  assert.ok(SRC.includes('const _curPft=_curChain?_curChain.profit:wheelCurrentProfit(_curOpt,_curVal);'));
});
