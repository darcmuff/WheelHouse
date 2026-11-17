const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const { parseMdY, parseAmount, nasdaqQuoteNext, nasdaqCalHit, nextDividend } = require('../netlify/functions/dividends.js');

const F = new Function(
  ['earningsDays', 'earningsBeforeExpiry', 'earlyAssignmentFlag', 'fmtDayMon'].map(extractFn).join('\n') +
  '\nreturn {earningsDays,earningsBeforeExpiry,earlyAssignmentFlag,fmtDayMon};'
)();

test('earnings before expiry: known date on or after today and on or before expiry', () => {
  assert.strictEqual(F.earningsBeforeExpiry('2026-11-23', '2026-11-27', '2026-11-17'), true);
  assert.strictEqual(F.earningsBeforeExpiry('2026-11-17', '2026-11-27', '2026-11-17'), true); // today
  assert.strictEqual(F.earningsBeforeExpiry('2026-11-27', '2026-11-27', '2026-11-17'), true); // on expiry
  assert.strictEqual(F.earningsBeforeExpiry('2026-12-04', '2026-11-27', '2026-11-17'), false); // after expiry
  assert.strictEqual(F.earningsBeforeExpiry('2026-11-10', '2026-11-27', '2026-11-17'), false); // past
  assert.strictEqual(F.earningsBeforeExpiry(null, '2026-11-27', '2026-11-17'), false);
  assert.strictEqual(F.earningsBeforeExpiry('2026-11-23', null, '2026-11-17'), false);
  assert.strictEqual(F.earningsBeforeExpiry('2026-01-20', '2026-03-20', '2026-11-17'), false);
});

test('earnings row label is day plus short month, any horizon', () => {
  assert.strictEqual(F.fmtDayMon('2026-01-23'), '23 Jan');
  assert.strictEqual(F.fmtDayMon('2026-11-07'), '7 Nov');
  assert.strictEqual(F.fmtDayMon(null), '');
});

test('early assignment: red when ITM and time value is below the dividend', () => {
  const r = F.earlyAssignmentFlag({ exDate: '2026-11-20', amount: 1.15, expiry: '2026-11-27', today: '2026-11-17', spot: 145.20, strike: 140, mark: 5.28 });
  // intrinsic 5.20, TV 0.08 < 1.15
  assert.deepStrictEqual(r, { kind: 'risk', date: '2026-11-20', amount: 1.15, tv: 0.08 });
});

test('early assignment: grey Ex-div when ITM but time value covers the dividend', () => {
  const r = F.earlyAssignmentFlag({ exDate: '2026-11-20', amount: 0.50, expiry: '2026-11-27', today: '2026-11-17', spot: 145.20, strike: 140, mark: 6.00 });
  // TV 0.80 >= 0.50
  assert.deepStrictEqual(r, { kind: 'exdiv', date: '2026-11-20', amount: 0.50 });
});

test('early assignment: grey Ex-div when ITM but no mark, or no dividend amount', () => {
  assert.deepStrictEqual(
    F.earlyAssignmentFlag({ exDate: '2026-11-20', amount: 1.15, expiry: '2026-11-27', today: '2026-11-17', spot: 145.20, strike: 140, mark: null }),
    { kind: 'exdiv', date: '2026-11-20', amount: 1.15 }
  );
  assert.deepStrictEqual(
    F.earlyAssignmentFlag({ exDate: '2026-11-20', amount: null, expiry: '2026-11-27', today: '2026-11-17', spot: 145.20, strike: 140, mark: 5.28 }),
    { kind: 'exdiv', date: '2026-11-20', amount: null }
  );
});

test('early assignment: nothing when OTM, ex-div on or after expiry, or date in the past or missing', () => {
  const base = { exDate: '2026-11-20', amount: 1.15, expiry: '2026-11-27', today: '2026-11-17', spot: 145.20, strike: 140, mark: 5.28 };
  assert.strictEqual(F.earlyAssignmentFlag({ ...base, spot: 139.90 }), null); // OTM
  assert.strictEqual(F.earlyAssignmentFlag({ ...base, spot: 140 }), null); // ATM is not ITM
  assert.strictEqual(F.earlyAssignmentFlag({ ...base, exDate: '2026-11-27' }), null); // ex-div on expiry: not < expiry
  assert.strictEqual(F.earlyAssignmentFlag({ ...base, exDate: '2026-11-28' }), null);
  assert.strictEqual(F.earlyAssignmentFlag({ ...base, exDate: '2026-11-10' }), null);
  assert.strictEqual(F.earlyAssignmentFlag({ ...base, exDate: null }), null);
  assert.strictEqual(F.earlyAssignmentFlag({ ...base, expiry: null }), null);
});

test('Nasdaq dividend date and amount parsing', () => {
  assert.strictEqual(parseMdY('11/19/2026'), '2026-11-19');
  assert.strictEqual(parseMdY('9/4/2026'), '2026-09-04');
  assert.strictEqual(parseMdY('2026-11-19'), '2026-11-19');
  assert.strictEqual(parseMdY('N/A'), null);
  assert.strictEqual(parseMdY(''), null);
  assert.strictEqual(parseAmount('$0.27'), 0.27);
  assert.strictEqual(parseAmount('$1.48'), 1.48);
  assert.strictEqual(parseAmount(0.53), 0.53);
  assert.strictEqual(parseAmount('N/A'), null);
});

test('Nasdaq quote table: earliest future cash row, skip past and stock dividends', () => {
  const json = {
    data: {
      exDividendDate: '08/20/2026',
      dividends: {
        rows: [
          { exOrEffDate: '11/19/2026', type: 'Cash', amount: '$0.98' },
          { exOrEffDate: '08/20/2026', type: 'Cash', amount: '$0.91' },
          { exOrEffDate: '02/18/2027', type: 'Stock', amount: '$0.10' },
          { exOrEffDate: '05/20/2027', type: 'Cash', amount: '$1.02' }
        ]
      }
    }
  };
  assert.deepStrictEqual(nasdaqQuoteNext(json, '2026-11-17'), { date: '2026-11-19', amount: 0.98 });
  // All past → none upcoming, table was present so not "unavailable"
  assert.strictEqual(nasdaqQuoteNext({
    data: { dividends: { rows: [{ exOrEffDate: '08/20/2026', type: 'Cash', amount: '$0.91' }] } }
  }, '2026-11-17'), null);
});

test('Nasdaq quote table missing for non-Nasdaq symbols is marked unavailable', () => {
  const json = {
    data: { exDividendDate: 'N/A', dividends: { rows: null } },
    message: 'Dividend History for Non-Nasdaq symbols is not available'
  };
  assert.deepStrictEqual(nasdaqQuoteNext(json, '2026-11-17'), { unavailable: true });
});

test('Nasdaq dividend calendar hit parses ex-date and rate', () => {
  const json = { data: { calendar: [
    { symbol: 'INK', dividend_Ex_Date: '11/17/2026', dividend_Rate: 0.35 },
    { symbol: 'KO', dividend_Ex_Date: '12/01/2026', dividend_Rate: 0.51 }
  ] } };
  assert.deepStrictEqual(nasdaqCalHit(json, 'KO', '2026-11-17'), { date: '2026-12-01', amount: 0.51 });
  assert.strictEqual(nasdaqCalHit(json, 'PEP', '2026-11-17'), null);
});

test('nextDividend uses the quote table when it has a future cash date, and does not scan the calendar', async () => {
  const calls = [];
  const fake = async u => {
    calls.push(u);
    return { ok: true, json: async () => ({ data: { dividends: { rows: [{ exOrEffDate: '11/19/2026', type: 'Cash', amount: '$0.98' }] } } }) };
  };
  const r = await nextDividend('MSFT', '2026-11-17', { fetchImpl: fake });
  assert.deepStrictEqual(r, { date: '2026-11-19', amount: 0.98, source: 'nasdaq' });
  assert.strictEqual(calls.length, 1);
  assert.ok(calls[0].includes('/quote/MSFT/dividends'));
});

test('nextDividend falls back to the calendar only when the quote table is unavailable', async () => {
  const calls = [];
  const fake = async u => {
    calls.push(u);
    if (u.includes('/quote/')) return { ok: true, json: async () => ({ data: { exDividendDate: 'N/A', dividends: { rows: null } }, message: 'Dividend History for Non-Nasdaq symbols is not available' }) };
    return { ok: true, json: async () => ({ data: { calendar: u.includes('2026-12-01') ? [{ symbol: 'KO', dividend_Ex_Date: '12/01/2026', dividend_Rate: 0.51 }] : [] } }) };
  };
  const r = await nextDividend('KO', '2026-11-17', { fetchImpl: fake });
  assert.strictEqual(r.date, '2026-12-01');
  assert.strictEqual(r.amount, 0.51);
  assert.strictEqual(r.source, 'nasdaq-cal');
  assert.ok(calls[0].includes('/quote/KO/dividends'));
  assert.ok(calls.some(u => u.includes('/calendar/dividends?date=2026-12-01')));
  assert.ok(calls.length > 1 && calls.length < 30, 'should stop after the hit, not scan the whole window; got ' + calls.length);
});
