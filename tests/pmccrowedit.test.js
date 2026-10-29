// pmccrowedit.test.js — per-row Edit on the LEAP short-call list: Delete removes exactly that leg id (fake figures only).
const { extractFn } = require('./extract');
let pass = 0, fail = 0;
const check = (n, ok, x) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (ok || x === undefined ? '' : '  → ' + JSON.stringify(x))); };
const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
  ['pmccShortsFor','pmccFormLeg','pmccBtcMatch','pmccBuyBack','pmccTradeEvents','pmccShortEvents','pmccDeleteLegFrom','pmccEditLeg'].map(extractFn).join('\n') +
  '\nreturn {pmccFormLeg,pmccBuyBack,pmccShortEvents,pmccDeleteLegFrom,pmccEditLeg};')();
const leap = { id: 'L', groupId: 'L', underlying: 'EXMPL', type: 'C', side: 'long', strike: 150, expiry: '2027-12-17', qty: 5, entryPrice: 33.7, entryDate: '2026-10-22', fees: 2.7, status: 'open' };
const s1 = S.pmccFormLeg({ strike: 170, expiry: '2026-11-13', qty: 3, price: 1.67, date: '2026-10-23', fees: 1.62, newId: 's1' }, leap).leg;
const closed = S.pmccBuyBack({ strike: '170', expiry: '2026-11-13', price: '0.54', date: '2026-10-29', fees: '1.62' }, leap, [leap, s1]).leg;
const s2 = S.pmccFormLeg({ strike: 170, expiry: '2026-11-13', qty: 3, price: 1.67, date: '2026-10-23', fees: 1.62, newId: 's2' }, leap).leg;
const legs = [leap, closed, s2];
const ev = S.pmccShortEvents(leap, legs);
check('list is short calls only: no LEAP BTO', ev.every(e => e.kind === 'short') && !ev.some(e => e.action === 'BTO'), ev.map(e => e.action));
check('list newest first: BTC first', ev[0].action === 'BTC');
const afterOpen = S.pmccDeleteLegFrom(legs, 's2');
check('Delete on the open duplicate removes only s2', afterOpen.length === 2 && afterOpen.some(x => x.id === 's1' && x.status === 'closed') && !afterOpen.some(x => x.id === 's2'));
const afterClosed = S.pmccDeleteLegFrom(legs, 's1');
check('Delete on the closed leg removes only s1 (open s2 + LEAP stay)', afterClosed.length === 2 && afterClosed.some(x => x.id === 's2') && afterClosed.some(x => x.id === 'L'));
check('Delete never removes the LEAP or another leg sharing groupId', S.pmccDeleteLegFrom([leap, { ...s2, groupId: 's1' }, closed], 's1').length === 2);
const ed = S.pmccEditLeg(closed, { strike: '170', expiry: '2026-11-13', qty: '3', price: '1.70', date: '2026-10-23', fees: '1.62', cprice: '0.50', cdate: '2026-10-29', cfees: '1.62' });
check('row Edit on a closed leg updates sell and buyback fields of that leg', ed.leg.id === 's1' && ed.leg.entryPrice === 1.7 && ed.leg.closePrice === 0.5 && ed.leg.status === 'closed');
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
