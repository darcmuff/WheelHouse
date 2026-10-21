// options.test.js — non-wheel options positions maths (optionsLib in app/index.html).
// Run: node tests/options.test.js
const { extractFn } = require('./extract');
const O = new Function(extractFn('optionsLib') + '\nreturn optionsLib();')();
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok || x === undefined ? '' : '  → ' + JSON.stringify(x))); };
const near = (a, b, e = 0.006) => a != null && Math.abs(a - b) < e;
const TODAY = '2026-01-10';
const L = (o) => ({ id: 'l' + Math.random(), underlying: 'AAPL', type: 'C', side: 'long', strike: 200, expiry: '2026-02-20', qty: 2, entryPrice: 3.5, entryDate: '2026-01-02', fees: 1.3, status: 'open', ...o });

// P&L
const lc = L({ mark: 5 });
let p = O.legPnL(lc);
check('long call cost basis = 700 + fees', p.costBasis === 701.3, p);
check('long call unrealized = (5-3.5)*200 - fees', near(p.unrealized, 298.7), p);
p = O.legPnL(L({ side: 'short', type: 'P', entryPrice: 2, qty: 1, fees: 0.65, mark: 0.5 }));
check('short put unrealized = (2-0.5)*100 - fees', near(p.unrealized, 149.35), p);
p = O.legPnL(L({ status: 'closed', closePrice: 1, closeFees: 1.3 }));
check('long call closed at loss: (1-3.5)*200 - 2.6', near(p.realized, -502.6), p);
p = O.legPnL(L({ side: 'short', status: 'expired', entryPrice: 1.2, qty: 3, fees: 2 }));
check('short expired worthless keeps premium - fees', near(p.realized, 358), p);
check('open leg without mark → unrealized null', O.legPnL(L({})).unrealized === null);

// tenor / DTE
check('dte', O.dte('2026-01-17', TODAY) === 7);
check('weekly', O.tenor(L({ expiry: '2026-01-16' }), TODAY) === 'weekly');
check('monthly', O.tenor(L({ expiry: '2026-02-20' }), TODAY) === 'monthly');
check('leap', O.tenor(L({ expiry: '2027-01-15' }), TODAY) === 'leap');

// Black-Scholes sanity: ATM 1y 20% vol r=4% call ≈ 9.93 (S=K=100)
const g = O.bs('C', 100, 100, 1, 0.2, 0.04);
check('BS call price', near(g.price, 9.93, 0.05), g);
check('BS call delta ≈ 0.618', near(g.delta, 0.618, 0.005), g);
check('BS theta negative', g.theta < 0);
const gp = O.bs('P', 100, 100, 1, 0.2, 0.04);
check('put-call parity', near(g.price - gp.price, 100 - 100 * Math.exp(-0.04), 0.02));
check('implied vol round-trips', near(O.impliedVol('C', g.price, 100, 100, 1, 0.04), 0.2, 0.001));
check('implied vol below intrinsic → null', O.impliedVol('C', 1, 150, 100, 0.5) === null);
const gg = O.legGreeks(L({ mark: 5, strike: 200 }), 200, TODAY);
check('position greeks from mark via BS: long call +delta, -theta', gg && gg.delta > 0 && gg.theta < 0 && gg.src === 'bs', gg);
const gs = O.legGreeks(L({ side: 'short', qty: 1, delta: 0.3, theta: -0.05, markSrc: 'cboe', mark: 2 }), 200, TODAY);
check('live greeks scaled by side×qty×100', near(gs.delta, -30) && near(gs.theta, 5), gs);

// OCC + strategies
check('occ symbol', O.occ({ underlying: 'aapl', expiry: '2026-02-20', type: 'P', strike: 197.5 }) === 'AAPL260220P00197500');
check('vertical', O.strategyName([L({ side: 'long' }), L({ side: 'short', strike: 210 })]) === 'Call vertical');
check('strangle', O.strategyName([L({ side: 'short', type: 'P', strike: 180 }), L({ side: 'short', type: 'C', strike: 220 })]) === 'Strangle (short)');
check('calendar', O.strategyName([L({}), L({ side: 'short', expiry: '2026-01-23' })]) === 'Calendar');
check('iron condor', O.strategyName([L({ type: 'P', strike: 170 }), L({ type: 'P', side: 'short', strike: 180 }), L({ side: 'short', strike: 220 }), L({ strike: 230 })]) === 'Iron condor');

// groups + summary
const g1 = 'g1';
const legs = [L({ id: 'a', groupId: g1, mark: 4 }), L({ id: 'b', groupId: g1, side: 'short', strike: 210, entryPrice: 1.5, fees: 1.3, mark: 2 }), L({ id: 'c', status: 'closed', closePrice: 5, closeFees: 1.3 })];
const gr = O.groups(legs);
check('groups by groupId', gr.length === 2 && gr[0].legs.length === 2);
const sm = O.groupSummary(gr[0].legs, TODAY);
check('vertical group unrealized', near(sm.unrealized, (4 - 3.5) * 200 - 1.3 + (1.5 - 2) * 200 - 1.3), sm);
const pf = O.portfolio(legs, { AAPL: 205 }, TODAY);
check('portfolio counts + realized', pf.open === 2 && pf.closed === 1 && near(pf.realized, 297.4), pf);
check('portfolio long/short premium', near(pf.longPremium, 701.3) && near(pf.shortPremium, 298.7), pf);

// close / roll
const cl = O.closeLeg(L({ id: 'x' }), 4, '2026-01-09', 1.3);
check('closeLeg', cl.status === 'closed' && cl.closePrice === 4 && cl.closeDate === '2026-01-09');
const [old, nw] = O.rollLeg(L({ id: 'r', side: 'short', strike: 210 }), { price: 0.4, date: '2026-01-09', fees: 0.65 }, { strike: 215, expiry: '2026-03-20', price: 1.8, fees: 0.65 }, 'r2');
check('roll: old closed, new open in same group', old.status === 'closed' && nw.status === 'open' && nw.groupId === 'r' && old.groupId === 'r' && nw.rolledFrom === 'r' && nw.strike === 215 && nw.mark === null);

// import fills: BTO then partial STC then expiry
let n = 0; const mk = () => 'n' + (++n);
const res = O.applyFills([], [
  { ticker: 'TSLA', side: 'long', effect: 'open', type: 'C', strike: 450, expiry: '2025-11-14', qty: 2, price: 15, fees: 2.1, date: '2025-11-05' },
  { ticker: 'TSLA', side: 'long', effect: 'close', type: 'C', strike: 450, expiry: '2025-11-14', qty: 1, price: 3.32, fees: 1.05, date: '2025-11-11' },
  { ticker: 'TSLA', side: 'long', effect: 'close', type: 'C', strike: 450, expiry: '2025-11-14', qty: 1, price: 0, fees: 0, date: '2025-11-14', expired: true },
  { ticker: 'NVDA', side: 'long', effect: 'close', type: 'C', strike: 100, expiry: '2025-11-14', qty: 1, price: 1, date: '2025-11-11' }], mk);
const closedL = res.legs.find(l => l.status === 'closed'), expL = res.legs.find(l => l.status === 'expired');
check('applyFills: partial close splits leg', res.legs.length === 2 && closedL.qty === 1 && expL.qty === 1, res.legs);
check('applyFills: realized on closed half', near(O.legPnL(closedL).realized, -1500 - 2.1 + 332 - 1.05), O.legPnL(closedL));
check('applyFills: unmatched close reported', res.unmatched.length === 1 && res.unmatched[0].ticker === 'NVDA');

// health
const H = O.health([
  L({ id: 'h1', expiry: '2026-01-02' }),                    // open past expiry
  L({ id: 'h2', strike: null }),                            // no strike
  L({ id: 'h3', wheelId: 'gone' }),                         // dangling rotation
  L({ id: 'h4', wheelId: 'w1' }),                           // different underlying
  L({ id: 'h5', status: 'closed', closePrice: null }),      // closed without price
  L({ id: 'h6', status: 'closed', closePrice: 1, closeDate: '2025-12-01' }), // closed before open
  L({ id: 'h7', entryDate: '2026-03-01' }),                 // opened after expiry
], [{ id: 'w1', ticker: 'SOFI' }], TODAY);
const has = (id, re) => H.some(i => i.legId === id && re.test(i.text));
check('health: open past expiry', has('h1', /still open/));
check('health: no strike', has('h2', /no strike/));
check('health: dangling rotation', has('h3', /no longer exists/));
check('health: wrong underlying', has('h4', /different underlying/));
check('health: closed no price', has('h5', /no close price/));
check('health: closed before open', has('h6', /closed before/));
check('health: opened after expiry', has('h7', /after its expiry/));
check('health: clean leg → no issues', O.health([L({ id: 'ok' })], [], TODAY).length === 0);

// ── render smoke test (Options view) ──
{
  const stubs = `const localStorage={getItem:()=>null,setItem(){}};const esc=s=>String(s??'');const fmt2=n=>Number(n).toFixed(2);
  const fmtMoney=n=>(n<0?'-':'')+'$'+Math.abs(n).toFixed(2);let quotes={AAPL:{price:205}};let view='options';let _optsLoadError='';
  let db={wheels:[{id:'w1',ticker:'AAPL',label:'Rotation 1',status:'open'}],trades:[],opts:[]};`;
  const R = new Function(stubs + extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    ['setOptFilter','_optSpots','_legLine','renderOptions'].map(extractFn).join('\n') +
    `\nlet optFilter={status:'open',tenor:'all',side:'all'};let _optMarkStatus='';\nreturn {render:renderOptions,setDb:d=>{db.opts=d;}};`)();
  check('render: empty state', /No option positions yet/.test(R.render()));
  R.setDb([L({ id: 'a', groupId: 'g', mark: 4, wheelId: 'w1' }), L({ id: 'b', groupId: 'g', side: 'short', strike: 210, entryPrice: 1.5, mark: 2 })]);
  const h = R.render();
  check('render: vertical row, attached rotation, summary cards', /Call vertical/.test(h) && /↳ AAPL/.test(h) && /Unrealised P&amp;L|Unrealised P&L/.test(h) && /never added to wheel P&L/.test(h), h.slice(0, 300));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
