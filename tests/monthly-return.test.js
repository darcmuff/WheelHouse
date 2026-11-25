const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const Ledger = require('../app/ledger.js');
const { extractFn } = require('./extract');

const stubs = `
function returnBase(rs,cawTotal){return rs&&rs.base==='account'&&rs.account>0?rs.account:(cawTotal||0);}
function monthReturnPct(profit,capital,target){
  if(!(capital>0))return null;
  const pct=(profit||0)/capital*100;return{pct,ok:target>0?pct>=target:null};
}
`;
const Fns = new Function(stubs +
  ['monthReturnCapital','averageAutoMonthReturn','capitalTipMoney','reportFigures','reportSentences','reportMoney','reportMonthName'].map(extractFn).join('\n') +
  '\nfunction fmtMoney(n){if(n==null||isNaN(n))return"—";const abs=Math.abs(n).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g,",");return(n<0?"-$":"$")+abs;}\n' +
  'return {monthReturnPct,monthReturnCapital,averageAutoMonthReturn,capitalTipMoney,reportFigures,reportSentences,fmtMoney};')();

const W = (id) => ({ id, status: 'open', ticker: 'X' });
const csp = (id, entered, expiry, extra) => ({
  id, wheelId: 'w1', ticker: 'X', action: 'CSP', entered, expiry,
  strike: 20, shares: 100, premium: 1, total: 100, ...extra
});

test('scaling: $15k earning $300 and $60k earning $1,200 are both 2%, and the Auto average is 2%', () => {
  const rows = [
    { ym: '2026-01', profit: 300, leapNet: 0 },
    { ym: '2026-02', profit: 1200, leapNet: 0 },
    { ym: '2026-03', profit: 0, leapNet: 0 }
  ];
  const monthlyCap = { '2026-01': 15000, '2026-02': 60000, '2026-03': 0 };
  const jan = Fns.monthReturnPct(300, Fns.monthReturnCapital({ base: 'caw' }, '2026-01', monthlyCap), 2);
  const feb = Fns.monthReturnPct(1200, Fns.monthReturnCapital({ base: 'caw' }, '2026-02', monthlyCap), 2);
  assert.equal(+jan.pct.toFixed(4), 2);
  assert.equal(+feb.pct.toFixed(4), 2);
  const F = Fns.reportFigures(rows, '2026-03-15', 60000, { base: 'caw', target: 2 }, [], monthlyCap);
  assert.equal(+F.ret.pct.toFixed(4), 2);
  assert.equal(F.ret.ok, true);
  assert.equal(F.retMonths, 2);
  // Old Auto (avg dollars / today's $60k) would have been 1.25%, not 2%.
  const oldPct = ((300 + 1200) / 2) / 60000 * 100;
  assert.equal(+oldPct.toFixed(4), 1.25);
  const s = Fns.reportSentences(F).join(' ');
  assert.match(s, /Average monthly return on option income over 2 complete months is \+2\.00% of each month's peak deployed capital, meeting your 2% target\./);

  // Same numbers from real trades through monthlyDeployedCapital.
  const tr = [
    { id: 'a', wheelId: 'w1', ticker: 'X', action: 'CSP', entered: '2026-01-02', expiry: '2026-01-30', strike: 150, shares: 100, premium: 3, total: 300 },
    { id: 'b', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: '2026-01-20', expiry: '2026-01-30', strike: 150, shares: 100, premium: 0, total: 0 },
    { id: 'c', wheelId: 'w1', ticker: 'X', action: 'CSP', entered: '2026-02-02', expiry: '2026-02-27', strike: 600, shares: 100, premium: 12, total: 1200 },
    { id: 'd', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: '2026-02-20', expiry: '2026-02-27', strike: 600, shares: 100, premium: 0, total: 0 }
  ];
  const cap = Ledger.monthlyDeployedCapital([W('w1')], tr, [], { today: '2026-03-15' });
  assert.equal(cap['2026-01'], 15000);
  assert.equal(cap['2026-02'], 60000);
  assert.equal(cap['2026-03'], 0);
});

test('same-day put roll does not double-count collateral in the monthly %', () => {
  const tr = [
    csp('c1', '2026-01-01', '2026-01-16'),
    { id: 'b1', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: '2026-01-10', expiry: '2026-01-16', strike: 20, shares: 100, premium: 0.4, total: 40, rollId: 'r' },
    csp('c2', '2026-01-10', '2026-01-23', { strike: 18, total: 80, rollId: 'r' })
  ];
  const cap = Ledger.monthlyDeployedCapital([W('w1')], tr, [], { today: '2026-01-15' });
  assert.equal(cap['2026-01'], 2000);
  assert.ok(cap['2026-01'] < 2000 + 1800);
  const mr = Fns.monthReturnPct(80, cap['2026-01'], null);
  assert.equal(+mr.pct.toFixed(4), 4);
});

test('same-day assignment into shares does not double-count collateral in the monthly %', () => {
  const tr = [
    csp('c', '2026-01-01', '2026-01-23'),
    { id: 'in', wheelId: 'w1', ticker: 'X', action: 'IN', entered: '2026-01-23', strike: 20, shares: 100, total: 2000 }
  ];
  const cap = Ledger.monthlyDeployedCapital([W('w1')], tr, [], { today: '2026-01-31' });
  assert.equal(cap['2026-01'], 2000);
  const mr = Fns.monthReturnPct(100, cap['2026-01'], null);
  assert.equal(+mr.pct.toFixed(4), 5);
});

test('opened in Month 1 and closed on the 1st of Month 2 still counts in Month 2', () => {
  const tr = [
    csp('a', '2026-01-15', '2026-02-20'),
    { id: 'b', wheelId: 'w1', ticker: 'X', action: 'BTC', entered: '2026-02-01', expiry: '2026-02-20', strike: 20, shares: 100, premium: 0.2, total: 20 }
  ];
  const cap = Ledger.monthlyDeployedCapital([W('w1')], tr, [], { today: '2026-02-20' });
  assert.equal(cap['2026-01'], 2000);
  assert.equal(cap['2026-02'], 2000);
  const feb = Fns.monthReturnPct(80, Fns.monthReturnCapital({ base: 'caw' }, '2026-02', cap), null);
  assert.equal(+feb.pct.toFixed(4), 4);
});

test('Manual mode overrides Auto with no regressions on Home, Report and the table tip', () => {
  const rows = [
    { ym: '2026-01', profit: 300, leapNet: 0 },
    { ym: '2026-02', profit: 1200, leapNet: 0 }
  ];
  const monthlyCap = { '2026-01': 15000, '2026-02': 60000 };
  const rsMan = { base: 'account', account: 50000, target: 2 };
  assert.equal(Fns.monthReturnCapital(rsMan, '2026-01', monthlyCap), 50000);
  assert.equal(Fns.monthReturnCapital(rsMan, '2026-02', monthlyCap), 50000);
  const F = Fns.reportFigures(rows, '2026-03-15', 60000, rsMan, [], monthlyCap);
  // Unchanged Manual figure: avg of $300 and $1,200 = $750 / $50,000 = 1.5%
  assert.equal(+F.ret.pct.toFixed(4), 1.5);
  const s = Fns.reportSentences(F).join(' ');
  assert.match(s, /Average monthly return on option income over 2 complete months is \+1\.50% of your account size, against your 2% target\./);
  assert.equal(Fns.capitalTipMoney(50000) + ' manual capital', '$50,000 manual capital');
  assert.equal(Fns.capitalTipMoney(17400) + ' peak deployed capital', '$17,400 peak deployed capital');
  // A $0-capital Auto month is — , but Manual still uses the override.
  assert.equal(Fns.monthReturnCapital({ base: 'caw' }, '2026-04', { '2026-04': 0 }), 0);
  assert.equal(Fns.monthReturnPct(100, 0, 2), null);
  const manZeroMonth = Fns.monthReturnPct(100, Fns.monthReturnCapital(rsMan, '2026-04', { '2026-04': 0 }), 2);
  assert.equal(+manZeroMonth.pct.toFixed(4), 0.2);
});

test('Monthly P&L table adds a % column and a denominator tooltip', () => {
  const H = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const start = H.indexOf('function renderMonthlyForMeasure');
  const fn = H.slice(start, H.indexOf('\n}\n', start));
  assert.ok(fn.includes("'%'") || fn.includes('"%s"') || fn.includes("'%']") || fn.includes(",'%']") || fn.includes(",'%']"), 'has a % column');
  assert.ok(fn.includes("Net','%'") || fn.includes("Profit','%'") || fn.includes(",'%'"));
  assert.ok(fn.includes('Based on ') && fn.includes('peak deployed capital') && fn.includes('manual capital'));
  assert.ok(fn.includes('title=') && fn.includes('mpl-pct'));
  assert.ok(fn.includes('monthReturnCapital(rs,r.ym,monthlyCap)'));
});
