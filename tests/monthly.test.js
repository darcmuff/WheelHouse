// monthly.test.js — Dashboard "All options, by month": wheel (existing calcMonthlyPnL pNet) + realised options by close date. READ-ONLY.
const { extractFn } = require('./extract');
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok || x === undefined ? '' : '  → ' + JSON.stringify(x))); };
const stubs = `const fmtMoney=n=>(n<0?'-':'')+'$'+Math.abs(n).toFixed(2);let optDemo=false;
let db={wheels:[{id:'w1',ticker:'SOFI',status:'open'}],trades:[
 {id:'t1',wheelId:'w1',action:'CSP',entered:'2026-09-03',total:120},{id:'t2',wheelId:'w1',action:'BTC',entered:'2026-09-20',total:30},
 {id:'t3',wheelId:'w1',action:'STOC',entered:'2026-10-02',total:85},{id:'t4',wheelId:'w1',action:'IN',entered:'2026-09-21',total:2000},
 {id:'t5',wheelId:'w1',action:'CSP',entered:'2025-12-10',total:50}],opts:[]};`;
const S = new Function(stubs + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' + ['calcMonthlyPnL', 'optsMonthly', 'allOptionsByMonth', 'renderAllOptionsByMonth'].map(extractFn).join('\n') +
  '\nreturn {db,calcMonthlyPnL,optsMonthly,allOptionsByMonth,renderAllOptionsByMonth};')();
const legs = [
  { id: 'L', side: 'long', type: 'C', qty: 1, entryPrice: 40, fees: 0.65, status: 'closed', closePrice: 55, closeDate: '2026-10-05', closeFees: 0.65 },           // +1500 −1.30
  { id: 's1', side: 'short', type: 'C', qty: 2, entryPrice: 5, fees: 1.30, status: 'closed', closePrice: 1, closeDate: '2026-09-12', closeFees: 1.30 },           // +1000−200−2.60
  { id: 's2', side: 'short', type: 'C', qty: 2, entryPrice: 4, fees: 1.30, status: 'expired', closePrice: 0, closeDate: null, expiry: '2026-09-18', closeFees: 0 },// +800−1.30
  { id: 's3', side: 'short', type: 'C', qty: 1, entryPrice: 6, fees: 0.65, status: 'open', mark: 2 },                                                           // open +400−0.65
  { id: 'L2', side: 'long', type: 'C', qty: 1, entryPrice: 30, fees: 0, status: 'open', mark: null },                                                            // unmarked
];
S.db.opts = legs;
const before = JSON.stringify({ w: S.db.wheels, t: S.db.trades, o: S.db.opts });
const O = S.optsMonthly(legs);
check('LEAP sold: proceeds − cost − fees, by close month', O.byMonth['2026-10'] === 1498.70, O.byMonth);
check('short bought back + expired (no close date → expiry month), net of fees', O.byMonth['2026-09'] === Math.round((797.40 + 798.70) * 100) / 100, O.byMonth);
check('open legs not in months; open P&L from marks, unmarked counted', O.openPl === 399.35 && O.unmarked === 1 && O.openN === 2, O);
const wm = S.calcMonthlyPnL();
const A = S.allOptionsByMonth(wm, legs, '2026-10-23');
check('wheel column = existing calcMonthlyPnL pNet (premium only; share IN excluded)', A.rows.find(r => r.ym === '2026-09').wheel === 90 && A.rows.find(r => r.ym === '2026-10').wheel === 85);
check('newest month first, union of wheel and options months', A.rows.map(r => r.ym).join() === '2026-10,2026-09,2025-12');
check('total = wheel + options', A.rows.every(r => Math.abs(r.total - (r.wheel + r.opts)) < 0.001));
check('YTD only this year; all-time includes 2025', A.ytd.wheel === 175 && A.all.wheel === 225 && Math.abs(A.ytd.total - (175 + 1498.70 + 1596.10)) < 0.01, A);
const h = S.renderAllOptionsByMonth(wm);
check('renders table, YTD + all-time rows and the open line', /All options, by month/.test(h) && /Year to date 2026/.test(h) && /All time/.test(h) && /Open, not yet banked/.test(h) && /1 without a mark/.test(h));
check('READ-ONLY: wheels, trades and option legs unchanged after compute + render', JSON.stringify({ w: S.db.wheels, t: S.db.trades, o: S.db.opts }) === before);
const src = ['optsMonthly', 'allOptionsByMonth', 'renderAllOptionsByMonth'].map(extractFn).join('\n');
check('no write calls in the feature code', !/_save|setDoc|deleteDoc|saveDB|\.push\(|db\.(trades|wheels|opts)\s*=/.test(src));
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
