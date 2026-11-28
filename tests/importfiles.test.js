// importfiles.test.js — what kind of file did the user pick, and how do we get text out of it?
// (importFileLib in app/app.js; pure, no DOM.)  Run: node tests/importfiles.test.js
const fs = require('fs'), path = require('path');
const { extractFn, extractConst } = require('./extract');
const code = [extractConst('MON_PAT'), extractConst('MON_MAP'), extractConst('CREDITS'),
  extractConst('ACTION_MAP'), extractConst('VALID_ACTIONS'),
  extractFn('isCredit'), extractFn('computeTotal'), extractFn('parseCSVLine'), extractFn('normDate'),
  extractFn('brokerCSVLib'), extractFn('importFileLib'), extractFn('rhPlan')].join('\n');
const F = new Function(code + '\nconst B=brokerCSVLib();B.rhPlan=rhPlan;return {B,F:importFileLib()};')();
const L = F.B, I = F.F;
const fx = n => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', n)));
const bytes = s => new TextEncoder().encode(s);

let pass = 0, fail = 0;
const check = (name, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok || extra === undefined ? '' : '  → ' + JSON.stringify(extra))); };
const key = r => [r.entered, r.ticker, r.action, r.strike, r.expiry, r.shares, r.premium, r.fees, r.total].join('|');

(async () => {
  // ── sniffing by content, never by file name ──
  check('sniff pdf', I.sniff(bytes('%PDF-1.7\n...'), 'x.csv').kind === 'pdf');
  check('sniff xlsx (zip with xl/workbook.xml)', I.sniff(fx('trades-dates.xlsx'), 'trades.csv').kind === 'xlsx');
  check('sniff png', I.sniff(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]), 'a.csv').kind === 'image');
  check('sniff jpeg', I.sniff(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), 'a.pdf').kind === 'image');
  check('sniff heic', I.sniff(bytes('\0\0\0\x18ftypheic\0\0\0\0'), 'IMG_1.HEIC').kind === 'image');
  check('sniff webp', I.sniff(bytes('RIFF\x10\0\0\0WEBPVP8 '), 'a.webp').kind === 'image');
  check('sniff legacy .xls', I.sniff(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]), 'a.xls').kind === 'xls');
  check('sniff random binary', I.sniff(new Uint8Array(Array.from({ length: 400 }, (_, i) => (i * 37) % 7 === 0 ? 0 : (i * 91) % 256)), 'x.csv').kind === 'binary');
  check('sniff csv text', I.sniff(bytes('Date,Symbol\n1,2\n'), 'x.csv').kind === 'text');
  check('sniff html', I.sniff(bytes('<!DOCTYPE html><html><body><table><tr><td>a</td></tr></table></body></html>'), 'x.html').kind === 'html');
  check('sniff empty', I.sniff(new Uint8Array(0), 'x.csv').kind === 'empty');
  check('sniff other zip (docx)', I.sniff(bytes('PK\x03\x04junk'), 'x.docx').kind === 'zip');

  // ── text decoding ──
  const eur = 'Date,Symbol,Action,Quantity,Price,Fees,Amount\n01/10/2025,AAPL 250117P00150000,Sell to Open,1,£1.25,£0.05,£124.95\n';
  const cp1252 = Uint8Array.from(Buffer.from(eur, 'latin1'));
  check('windows-1252 £ decodes (not U+FFFD)', I.decodeText(cp1252).includes('£1.25'), I.decodeText(cp1252).slice(60, 90));
  const u16 = Uint8Array.from(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(eur, 'utf16le')]));
  check('UTF-16LE with BOM decodes', I.decodeText(u16) === eur);
  const u16be = Uint8Array.from(Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(eur, 'utf16le').swap16()]));
  check('UTF-16BE with BOM decodes', I.decodeText(u16be) === eur);
  const u16nb = Uint8Array.from(Buffer.from(eur, 'utf16le'));
  check('UTF-16LE without BOM decodes', I.decodeText(u16nb) === eur);
  check('UTF-8 BOM stripped', I.decodeText(bytes('\uFEFFa,b')) === 'a,b');
  const p16 = L.parseBrokerCSV(I.decodeText(u16));
  check('a UTF-16 file parses end to end', p16.rows.length === 1 && p16.rows[0].premium === 1.25, p16.error);
  const pcp = L.parseBrokerCSV(I.decodeText(cp1252));
  check('a windows-1252 file parses end to end (£ prices)', pcp.rows.length === 1 && pcp.rows[0].premium === 1.25, pcp.error || pcp.rows);

  // ── xlsx ──
  const sheets = await I.xlsxSheets(fx('trades-dates.xlsx'));
  check('xlsx: both sheets read, in order', sheets.length === 2 && sheets[0].name === 'Summary' && sheets[1].name === 'Trades', sheets.map(s => s.name));
  const trades = sheets[1].text;
  check('xlsx: date cells come out as ISO dates', /2025-01-10/.test(trades) && /2025-01-15/.test(trades) && /2025-01-13/.test(trades), trades);
  const px = L.parseBrokerCSV(trades);
  check('xlsx: the Trades sheet parses to 3 trades', px.rows.length === 3 && px.rows.map(r => r.action).join() === 'CSP,BTC,STOC', px.error || px.rows);
  check('xlsx: price/fees survive number formats', px.rows[0].premium === 1.25 && px.rows[0].fees === 0.05 && px.rows[2].premium === 3.1, px.rows);
  const best = await I.xlsxToText(fx('trades-dates.xlsx'), t => L.parseBrokerCSV(t).rows.length);
  check('xlsxToText picks the sheet that parses (skips Summary)', best === trades);
  const rs = await I.xlsxSheets(fx('robinhood-style.xlsx'));
  const pr0 = L.parseBrokerCSV(rs[0].text);
  const prRows = pr0.rh ? L.rhPlan(pr0.rh, [], [], () => 'x').wheelRows : pr0.rows;
  check('xlsx: text dates + $ and (neg) strings parse (Robinhood layout)', prRows.length === 2 && prRows[0].action === 'CSP' && prRows[0].premium === 1.25, pr0.error || prRows);

  // ── html table (saved broker page) ──
  const html = '<html><body><h1>Activity</h1><table><thead><tr><th>Date</th><th>Symbol</th><th>Action</th><th>Quantity</th><th>Price</th><th>Fees</th><th>Amount</th></tr></thead><tbody><tr><td>01/10/2025</td><td>AAPL 250117P00150000</td><td>Sell to Open</td><td>1</td><td>$1.25</td><td>$0.05</td><td>$124.95</td></tr><tr><td>01/15/2025</td><td>AAPL&nbsp;250117P00150000</td><td>Buy to Close</td><td>1</td><td>$0.20</td><td>$0.05</td><td>-$20.05</td></tr></tbody></table></body></html>';
  const ph = L.parseBrokerCSV(I.htmlToText(html));
  check('html table → rows', ph.rows.length === 2 && ph.rows.map(r => r.action).join() === 'CSP,BTC', ph.error || ph.rows);

  // ── friendly messages ──
  for (const k of ['image', 'xls', 'zip', 'binary', 'empty']) check('message for ' + k + ' is plain English', typeof I.message(k) === 'string' && I.message(k).length > 30 && !/undefined|\[object/.test(I.message(k)), I.message(k));
  check('image message offers a way forward', /CSV|PDF|paste/i.test(I.message('image')));

  // ── the picker must never grey out a file (Android greys CSVs whose MIME it doesn't know; iOS hides odd extensions) ──
  const html5 = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
  const inp = /<input[^>]*id="import-file"[^>]*>/.exec(html5);
  check('import file input has no restrictive accept= (we sniff content and explain bad files)', !!inp && !/accept=/.test(inp[0]), inp && inp[0]);

  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');
  const pdfFn = appSrc.slice(appSrc.indexOf('async function importLoadPDF'), appSrc.indexOf('function initImportDrop'));
  check('PDF reader load failure gets a plain "check your connection" message (no raw module URL)', /Couldn't load the PDF reader/.test(pdfFn) && /Check your connection/.test(pdfFn) && !/e&&e\.message/.test(pdfFn));
  check('PDF reader retries next time after a failed load (_pdfjs reset)', /_pdfjs=null;importPreview/.test(pdfFn));
  check('password-protected PDF is named as such', /PasswordException/.test(pdfFn));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
