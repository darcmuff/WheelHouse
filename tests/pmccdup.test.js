// pmccdup.test.js — LEAP buy back must not leave a second open STO; duplicate sells are refused (fake figures only).
const { extractFn } = require('./extract');
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok || x === undefined ? '' : '  → ' + JSON.stringify(x))); };
const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  ['pmccShortsFor','pmccStats','pmccFormLeg','pmccBtcMatch','pmccBuyBack','pmccTradeEvents','pmccDupOf'].map(extractFn).join('\n') +
  '\nreturn {OPTS,pmccStats,pmccFormLeg,pmccBuyBack,pmccTradeEvents,pmccDupOf};')();
const leap = { id: 'L', groupId: 'L', underlying: 'EXMPL', type: 'C', side: 'long', strike: 150, expiry: '2027-12-17', qty: 5, entryPrice: 33.7, entryDate: '2026-10-22', fees: 2.7, status: 'open' };
const sto = S.pmccFormLeg({ strike: 170, expiry: '2026-11-13', qty: 3, price: 1.67, date: '2026-10-23', fees: 1.62, newId: 's1' }, leap).leg;
let legs = [leap, sto];
// buy back exactly as savePmcc's btc branch does: replace in place by id
const b = S.pmccBuyBack({ strike: '170', expiry: '2026-11-13', price: '0.54', date: '2026-10-29', fees: '1.62' }, leap, legs);
legs = legs.map(x => x.id === b.leg.id ? b.leg : x);
check('buy back keeps leg count (no new leg)', legs.length === 2, legs.length);
check('short is closed, none open', S.pmccStats(leap, legs, '2026-10-29').open.length === 0);
const ev = S.pmccTradeEvents(leap, legs).map(e => e.action);
check('history = BTC, STO, BTO (one STO)', ev.join() === 'BTC,STO,BTO', ev);
const btcEv = S.pmccTradeEvents(leap, legs).find(e => e.action === 'BTC');
check('BTC net = 499.38 - 163.62 = 335.76', Math.abs(btcEv.net - 335.76) < 0.005, btcEv.net);
// re-adding the same sell (re-paste / double Save) is caught
const again = S.pmccFormLeg({ strike: 170, expiry: '2026-11-13', qty: 3, price: 1.67, date: '2026-10-23', fees: 1.62, newId: 's2' }, leap).leg;
check('duplicate of closed sell is detected', S.pmccDupOf(again, legs) && S.pmccDupOf(again, legs).id === 's1');
check('duplicate of open sell is detected', !!S.pmccDupOf(again, [leap, sto]));
const other = S.pmccFormLeg({ strike: 175, expiry: '2026-11-13', qty: 3, price: 1.2, date: '2026-10-29', fees: 1.62, newId: 's3' }, leap).leg;
check('a genuinely new sell is allowed', S.pmccDupOf(other, legs) === null);
// Marc's state: closed s1 + stray open s2 → Delete short call targets the open one only
const marc = [...legs, again];
const cur = S.pmccStats(leap, marc, '2026-10-29').cur;
check('Edit → Delete short call targets the stray open copy', cur && cur.id === 's2', cur && cur.id);
// v93 LEAP card: Close/Roll top right, always-visible trades, collapse key, roll-mode modal
{const SRC=require('fs').readFileSync(require('path').join(__dirname,'..','app','index.html'),'utf8');
check('v93: Close + Roll in LEAP header', /class="lc-lacts"[^\n]*openOptClose\('\$\{esc\(gid\)\}','close'\)">Close<[^\n]*openLeapRoll\(/.test(SRC));
check('v93: new collapse key, default expanded', SRC.includes("localStorage.getItem('wh-collapsedLeaps')")&&!SRC.includes('expandedLeaps'));
check('v93: no stale Edit → Close LEAP pointers', !/Edit → Close LEAP/.test(SRC));
check('v93: hint', SRC.includes('Paste any trade or roll confirmation — any broker, any layout. Nothing is saved until you check the details and press Save.'));
check('v93: only Save roll when a roll is found', /pmccRollPreview\(rr\);document\.getElementById\('pcc-scan-btn'\)\.style\.display='none'/.test(SRC));}

console.log(`\n${pass} pass / ${fail} fail`);
if (fail) process.exit(1);
