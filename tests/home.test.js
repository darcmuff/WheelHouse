const{appSrc}=require('./appsrc');
const test = require('node:test');
const assert = require('node:assert');
const { extractFn } = require('./extract');
const S = new Function(extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' + ['homeFigures', 'nextExpiry'].map(extractFn).join('\n') + '\nreturn {homeFigures,nextExpiry};')();
const rows = [
  { ym: '2026-10', premium: 237, collected: 300, loss: 40, shares: 500, divs: 0, extra: { leaps: 547 }, total: 1284 },
  { ym: '2026-09', premium: 332, collected: 400, loss: 0, shares: 0, divs: 10, extra: { leaps: 2846 }, total: 3188 },
  { ym: '2025-12', premium: 50, collected: 50, loss: 0, shares: 0, divs: 0, extra: {}, total: 50 },
];
test('tiles are options only: wheel + PMCC calls, no shares/divs/LEAPs', () => {
  const F = S.homeFigures(rows, '2026-10-23');
  assert.deepStrictEqual(F.month, { wheel: 237, pmcc: 23, total: 260 });
  assert.deepStrictEqual(F.year, { wheel: 569, pmcc: 91, total: 660 });
});
test('a month with no activity shows zero, not last month', () => {
  assert.strictEqual(S.homeFigures(rows, '2026-11-02').month.total, 0);
});
test('tiles equal Monthly P&L options profit and exclude a closed LEAP', () => {
  const X = new Function(require('./extract').LEDGER_SRC + '\n' + require('./extract').extractFn('optionsLib') + '\nconst OPTS=optionsLib();\n' +
    ['optsMonthly', 'monthlyExtraSources', 'calcMonthlyRealised', 'realisedPremium', 'shareRealisations', 'homeFigures'].map(require('./extract').extractFn).join('\n') +
    '\nreturn {optsMonthly,monthlyExtraSources,calcMonthlyRealised,homeFigures};')();
  const legs = [
    { id: 'L1', status: 'closed', side: 'long', type: 'call', underlying: 'TSLA', strike: 200, expiry: '2027-01-15', qty: 1, entryPrice: 50, entryDate: '2025-01-02', closePrice: 149.4176, closeDate: '2026-10-05', fees: 0, closeFees: 0 },
    { id: 'C1', status: 'closed', side: 'short', type: 'call', underlying: 'TSLA', strike: 450, expiry: '2026-10-16', qty: 1, entryPrice: 3, entryDate: '2026-10-01', closePrice: 1, closeDate: '2026-10-10', fees: 0, closeFees: 0 },
  ];
  const mrows = X.calcMonthlyRealised([], X.monthlyExtraSources(legs), '2026-10-27');
  const F = X.homeFigures(mrows, '2026-10-27');
  const oct = mrows.find(r => r.ym === '2026-10');
  assert.ok(oct.leapGain > 9000, 'LEAP close is realised in the Shares & LEAPs side');
  assert.strictEqual(F.month.total, Math.round(oct.profit * 100) / 100);
  const ytd = mrows.filter(r => r.ym.startsWith('2026')).reduce((a, r) => a + r.profit, 0);
  assert.strictEqual(F.year.total, Math.round(ytd * 100) / 100);
  assert.ok(F.month.total < 1000, 'no LEAP profit in the tile');
  assert.strictEqual(F.month.wheel, 0);
});
test('next expiry picks the soonest open leg across wheel and LEAPs', () => {
  const nx = S.nextExpiry([{ ticker: 'TSLA', action: 'CSP', strike: 300, expiry: '2026-12-18' }],
    [{ status: 'open', side: 'short', und: 'NVDA', strike: 190, expiry: '2026-10-31' }, { status: 'closed', expiry: '2026-10-24' }], '2026-10-23');
  assert.strictEqual(nx.ticker, 'NVDA'); assert.strictEqual(nx.dte, 8);
});
test('no trade warnings anywhere: Needs you is data health only', () => {
  const H = appSrc();
  assert.ok(!/function needsYou|function pmccLabels|function buildDashAlerts/.test(H));
  assert.ok(!/Take profit|Expiring soon|Near the money|Under 9 months left|is below breakeven|wl-memo warn|leap-badge \$\{|_itmTag/.test(H));
  assert.ok(/✓ All clear/.test(H) && /allDataHealth\(\)/.test(H));
});
test('LEAP payback bar is the share of cost won back by calls, 0–100', () => {
  const { leapPayback } = new Function(require('./extract').extractFn('leapPayback') + 'return {leapPayback};')();
  assert.strictEqual(leapPayback(15000, 5680).pct, 38);
  assert.strictEqual(leapPayback(15000, -200).pct, 0);
  assert.strictEqual(leapPayback(1000, 5000).pct, 100);
});

test('next expiry passes through trade identity without changing the pick', () => {
  const nx = S.nextExpiry(
    [{ id: 'w1', wheelId: 'wh', ticker: 'TSLA', action: 'CSP', strike: 300, expiry: '2026-12-18' }],
    [{ id: 'n1', status: 'open', side: 'short', und: 'NVDA', strike: 190, expiry: '2026-10-31' }, { id: 'x', status: 'closed', expiry: '2026-10-24' }],
    '2026-10-23');
  assert.strictEqual(nx.ticker, 'NVDA');
  assert.strictEqual(nx.dte, 8);
  assert.strictEqual(nx.kind, 'leap');
  assert.strictEqual(nx.id, 'n1');
  const wheel = S.nextExpiry(
    [{ id: 'w1', wheelId: 'wh', ticker: 'AMD', action: 'CSP', strike: 150, expiry: '2026-10-30' }],
    [{ id: 'n1', status: 'open', side: 'short', und: 'NVDA', strike: 190, expiry: '2026-11-20' }],
    '2026-10-23');
  assert.strictEqual(wheel.ticker, 'AMD');
  assert.strictEqual(wheel.kind, 'wheel');
  assert.strictEqual(wheel.id, 'w1');
  assert.strictEqual(wheel.wheelId, 'wh');
  assert.strictEqual(wheel.what, 'put $150');
});
test('Next expiry tile is clickable and keyboard-accessible when a trade exists', () => {
  const H = appSrc();
  const home = extractFn('renderHome');
  assert.ok(home.includes('hk-nx') && home.includes('goToNextExpiry(this)') && home.includes('role="button"') && home.includes('tabindex="0"'));
  assert.ok(H.includes('function goToNextExpiry') && H.includes('_flashTrade') && H.includes('nx-flash'));
  assert.ok(/animation:\s*nx-flash 1\.5s/.test(H) || /nx-flash 1\.5s/.test(H));
});

test('LEAP payback bar has a small ⓘ at the left, not a tooltip on the bar', () => {
  const H = appSrc();
  assert.ok(H.includes("n.closest('.ii')") || H.includes('n.closest(".ii")') || H.includes("closest('.ii')"));
  assert.ok(!H.includes('.lc-bar[data-tip]'));
  assert.ok(!H.includes('.lc-bar::after'));
  assert.strictEqual((H.match(/\$\{leapBarHtml\(pb,P\.cost,P\.net,!open\)\}/g) || []).length, 2);
  const { leapPayback, leapPaybackTip, leapBarHtml } = new Function(
    require('./extract').extractFn('fmtMoney') +
    require('./extract').extractFn('ii') +
    require('./extract').extractFn('leapPayback') +
    require('./extract').extractFn('leapPaybackTip') +
    require('./extract').extractFn('leapBarHtml') +
    'return {leapPayback,leapPaybackTip,leapBarHtml};'
  )();
  const pb = leapPayback(15000, 5680);
  assert.strictEqual(leapPaybackTip(15000, 5680, pb.pct, false),
    'LEAP payback: 38% of your $15,000 cost paid back by closed or expired short calls ($5,680 so far). Open calls count once closed.');
  assert.strictEqual(leapPaybackTip(15000, 5680, pb.pct, true),
    'LEAP payback: 38% of your $15,000 cost paid back by closed or expired short calls ($5,680 total). Open calls count once closed.');
  const html = leapBarHtml(pb, 15000, 5680, false);
  assert.match(html, /class="lc-bar-row"/);
  assert.match(html, /<button type="button" class="ii"/);
  assert.match(html, /aria-label="How it's worked out"/);
  assert.match(html, /data-tip="LEAP payback: 38% of your \$15,000 cost paid back by closed or expired short calls \(\$5,680 so far\)\. Open calls count once closed\."/);
  assert.match(html, /<div class="lc-bar" aria-hidden="true"><i style="width:38%"><\/i><\/div>/);
  assert.doesNotMatch(html, /class="lc-bar"[^>]*(role="button"|tabindex=|data-tip=|aria-label=)/);
  assert.ok(!/class="lc-bar"[^>]*role="button"/.test(html));
});

test('More data and Report are hidden on phone and kept on desktop', () => {
  const H = appSrc();
  assert.ok(/\.v2-hero\.v2-home \.home-head p\.home-more\{display:none\}/.test(H));
  assert.ok(/\.ny-desk\{display:none\}/.test(H));
  assert.ok(!H.includes('settings-log') && !H.includes('settings-more') && !H.includes('settings-report'));
  assert.ok(!/<div class="st-h">Go to<\/div>/.test(H));
  assert.ok(H.includes('span class="ny-desk"'));
  assert.ok(H.includes("(v==='log'||v==='analytics'||v==='report')&&isPhoneLayout())v='dash'"));
  assert.ok(H.includes("(view==='log'||view==='analytics'||view==='report')&&isPhoneLayout())view='dash'"));
  assert.ok(H.includes("(view==='log'||view==='analytics'||view==='report')&&isPhoneLayout())switchView('dash')"));
  assert.ok(H.includes('function goToHealth(){if(isPhoneLayout())return;'));
  assert.ok(H.includes('<p class="home-more"><a onclick="switchView(\'analytics\')">More data</a> · <a onclick="switchView(\'report\')">Report</a></p>'));
});
