// exportcsv.test.js — trade CSV Status column (active/closed) and importer round-trip
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFn, extractConst } = require('./extract');

function exportCsvFrom(db, logQ) {
  let captured = '';
  const document = { createElement() { return { href: '', download: '', click() {} }; } };
  const URL = {
    createObjectURL(blob) { captured = blob && blob._text != null ? blob._text : ''; return 'blob:test'; },
    revokeObjectURL() {}
  };
  function Blob(parts, opts) { this._text = (parts || []).join(''); this.type = opts && opts.type; }
  const run = new Function('document', 'URL', 'Blob', 'db', 'logQ',
    extractFn('wheelLabelDisplay') + '\n' + extractFn('exportCSV') + '\nexportCSV();'
  );
  run(document, URL, Blob, db, logQ || '');
  return captured;
}

const L = new Function([
  extractConst('MON_PAT'), extractConst('MON_MAP'), extractConst('CREDITS'),
  extractConst('ACTION_MAP'), extractConst('VALID_ACTIONS'),
  extractFn('isCredit'), extractFn('computeTotal'), extractFn('parseCSVLine'), extractFn('normDate'),
  extractFn('brokerCSVLib')
].join('\n') + '\nreturn brokerCSVLib();')();

const wheels = [
  { id: 'w-open', ticker: 'SOFI', label: 'CSP Chain — Mar 2026 / Ongoing', status: 'open' },
  { id: 'w-closed', ticker: 'SOFI', label: 'Sep/Nov 2025', status: 'closed' }
];
const trades = [
  { ticker: 'SOFI', action: 'CSP', wheelId: 'w-open', entered: '2026-03-10', expiry: '2026-03-20', strike: 17, premium: 0.45, fees: 1.3, shares: 100, total: 43.7, days: 10, verified: true, comment: 'open wheel' },
  { ticker: 'SOFI', action: 'CSP', wheelId: 'w-closed', entered: '2025-09-15', expiry: '2025-09-26', strike: 21, premium: 0.45, fees: 1.3, shares: 100, total: 43.7, days: 11, verified: false, comment: 'closed wheel' },
  { ticker: 'SOFI', action: 'BTC', wheelId: 'no-such', entered: '2026-01-02', expiry: '2026-01-16', strike: 14, premium: 0.10, fees: 1, shares: 100, total: 11, days: 5, verified: false, comment: '' }
];

test('Status is the last column: active for open wheels, closed otherwise; labels unchanged', () => {
  const csv = exportCsvFrom({ wheels, trades }, '');
  const lines = csv.trim().split('\n');
  const hdr = lines[0].split(',');
  assert.deepEqual(hdr, ['Ticker','Action','Wheel','Entered','Expiry','Strike Price','Premium/Price','Fees','Shares','Total','Days','PPD','Verified','Comment','Status']);
  assert.strictEqual(hdr[hdr.length - 1], 'Status');
  const rows = lines.slice(1).map(line => {
    const cells = line.match(/"((?:[^"]|"")*)"/g).map(c => c.slice(1, -1).replace(/""/g, '"'));
    const rec = {};
    hdr.forEach((h, i) => { rec[h] = cells[i]; });
    return rec;
  });
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0].Status, 'active');
  assert.strictEqual(rows[0].Wheel, 'CSP Chain — Mar 2026 / Ongoing');
  assert.strictEqual(rows[1].Status, 'closed');
  assert.strictEqual(rows[1].Wheel, 'Sep/Nov 2025');
  assert.strictEqual(rows[2].Status, 'closed'); // missing wheel
});

test('importer still parses the new export: CoveredWheel, trades intact, Status ignored', () => {
  const csv = exportCsvFrom({ wheels, trades }, '');
  const parsed = L.parseBrokerCSV(csv);
  assert.strictEqual(parsed.broker, 'CoveredWheel');
  assert.strictEqual(parsed.error, undefined);
  assert.strictEqual(parsed.rows.length, 3);
  assert.deepEqual(parsed.skipped, []);
  assert.deepEqual(parsed.unrecognised, []);
  assert.strictEqual(parsed.rows[0].ticker, 'SOFI');
  assert.strictEqual(parsed.rows[0].action, 'CSP');
  assert.strictEqual(parsed.rows[0].entered, '2026-03-10');
  assert.strictEqual(parsed.rows[0].strike, 17);
  assert.strictEqual(parsed.rows[0].premium, 0.45);
  assert.strictEqual(parsed.rows[0].total, 43.7);
  assert.strictEqual(parsed.rows[0].comment, 'open wheel');
  assert.strictEqual(parsed.rows[0].verified, true);
  assert.strictEqual(parsed.rows[1].entered, '2025-09-15');
  assert.strictEqual(parsed.rows[1].verified, false);
  assert.strictEqual(parsed.rows[2].action, 'BTC');
  // Status is not mapped onto the trade
  parsed.rows.forEach(r => {
    assert.strictEqual(r.status, undefined);
    assert.ok(!('Status' in r));
  });
});
