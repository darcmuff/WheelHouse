// pmccsameday.test.js — separate BTC + STO on one day: no chain, newest-first order; explicit roll still chains (fake figures).
const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const S = new Function(['isCredit','computeTotal','detectRollPaste','parseRollTrades','optionsLib','pmccShortsFor','pmccBtcMatch','pmccBuyBack','pmccFormLeg','pmccRollApply','pmccRollParents','pmccChainMap','pmccTradeEvents','nearStrike','strikeStep','exactSubset'].map(extractFn).join('\n') +
  '\nconst OPTS=optionsLib();return{pmccBuyBack,pmccFormLeg,pmccRollApply,pmccRollParents,pmccChainMap,pmccTradeEvents};')();
const leap = { id: 'L', groupId: 'L', underlying: 'EXMPL', type: 'C', side: 'long', strike: 150, expiry: '2027-12-17', qty: 5, entryPrice: 33.7, entryDate: '2026-10-22', fees: 2.7, status: 'open' };
const sto1 = S.pmccFormLeg({ strike: 170, expiry: '2026-11-13', qty: 3, price: 1.67, date: '2026-10-23', fees: 1.62, newId: 's1' }, leap).leg;
const label = ev => ev.filter(e => e.kind === 'short').map(e => e.action + e.strike).join(',');

test('separate BTC then STO same day (no timestamps): no chain, STO165 > BTC170 > STO170', () => {
  let legs = [leap, sto1];
  const b = S.pmccBuyBack({ strike: '170', price: '0.54', date: '2026-10-29', fees: '1.62' }, leap, legs);
  legs = legs.map(x => x.id === b.leg.id ? b.leg : x);
  const s2 = S.pmccFormLeg({ strike: 165, expiry: '2026-11-20', qty: 3, price: 1.52, date: '2026-10-29', fees: 1.62, newId: 's2' }, leap).leg;
  legs.push(s2);
  assert.equal(s2.rolledFrom, undefined);
  assert.deepEqual(S.pmccRollParents(legs), {});
  const ev = S.pmccTradeEvents(leap, legs);
  assert.equal(Object.keys(S.pmccChainMap(ev)).length, 0);
  assert.equal(label(ev), 'STO165,BTC170,STO170');
});

test('timestamps decide same-day order when known', () => {
  const c = { ...sto1, status: 'closed', closePrice: 0.54, closeDate: '2026-10-29', closeTs: '2026-10-29T15:00:00Z' };
  const s2 = { ...S.pmccFormLeg({ strike: 165, expiry: '2026-11-20', qty: 3, price: 1.52, date: '2026-10-29', fees: 1.62, newId: 's2' }, leap).leg, ts: '2026-10-29T10:00:00Z' };
  assert.equal(label(S.pmccTradeEvents(leap, [leap, c, s2])), 'BTC170,STO165,STO170');
  assert.equal(label(S.pmccTradeEvents(leap, [leap, { ...c, closeTs: '2026-10-29T09:00:00Z' }, s2])), 'STO165,BTC170,STO170');
});

test('explicit roll via pmccRollApply still shows a chain', () => {
  const r = { kind: 'short', close: { ticker: 'EXMPL', strike: 170, expiry: '2026-11-13', qty: 3, price: 0.54, date: '2026-10-29', fees: 1.62 }, open: { ticker: 'EXMPL', strike: 165, expiry: '2026-11-20', qty: 3, price: 1.52, date: '2026-10-29', fees: 1.62 } };
  const a = S.pmccRollApply(r, leap, [leap, sto1], 'N1');
  assert.ok(a.save, a.err);
  const legs = [leap, ...a.save];
  assert.deepEqual(S.pmccRollParents(legs), { N1: ['s1'] });
  const ev = S.pmccTradeEvents(leap, legs);
  const m = S.pmccChainMap(ev);
  assert.ok(m.s1 === 0 && m.N1 === 0);
  assert.equal(label(ev), 'STO165,BTC170,STO170');
});
