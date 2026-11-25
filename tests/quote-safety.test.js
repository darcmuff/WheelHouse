// quote-safety — CDN cache on zero quotes, dp:null change rows, Finnhub IV %, live badge parity.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./extract');
const { headersForQuote } = require('../netlify/lib/quote-cache');
const { pickFinnhub } = require('../netlify/functions/optchain.js');

test('headersForQuote: Finnhub c:0 is never CDN-cached', () => {
  const h = headersForQuote({ c: 0, pc: 100 });
  assert.strictEqual(h['Cache-Control'], 'no-store');
  assert.strictEqual(h['Netlify-CDN-Cache-Control'], 'no-store');
});

test('headersForQuote: valid quote keeps shared CDN cache', () => {
  const h = headersForQuote({ c: 150.25, pc: 149, d: 1.25, dp: 0.84 });
  assert.match(h['Cache-Control'], /public/);
  assert.match(h['Netlify-CDN-Cache-Control'], /s-maxage/);
});

test('quote _handler returns no-store when Finnhub prints c:0', async () => {
  const prev = global.fetch;
  const prevKey = process.env.FINNHUB_KEY;
  process.env.FINNHUB_KEY = 'test-key';
  global.fetch = async () => ({ ok: true, json: async () => ({ c: 0, pc: 0, d: null, dp: null }) });
  try {
    const { _handler } = require('../netlify/functions/quote.js');
    const r = await _handler({
      queryStringParameters: { symbol: 'XYZ' },
      headers: { origin: 'https://optrack.app' }
    });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.headers['Cache-Control'], 'no-store');
    assert.strictEqual(r.headers['Netlify-CDN-Cache-Control'], 'no-store');
  } finally {
    global.fetch = prev;
    if (prevKey == null) delete process.env.FINNHUB_KEY;
    else process.env.FINNHUB_KEY = prevKey;
  }
});

test('quoteChangeReady: dp:null does not throw when formatting wheel change', () => {
  const { quoteChangeReady } = load([{ kind: 'fn', name: 'quoteChangeReady' }]);
  const chg = 1.2;
  const chgPct = null;
  assert.strictEqual(quoteChangeReady(chg, chgPct), false);
  assert.doesNotThrow(() => {
    if (quoteChangeReady(chg, chgPct)) chgPct.toFixed(2);
  });
});

test('Finnhub impliedVolatility percent becomes decimal (2.5 → 0.025)', () => {
  const raw = {
    lastTradePrice: 100,
    data: [{
      options: {
        CALL: [{ contractName: 'TEST261121C00100000', impliedVolatility: 2.5, bid: 1, ask: 1.1, lastPrice: 1.05 }]
      }
    }]
  };
  const r = pickFinnhub(raw, ['TEST261121C00100000']);
  assert.ok(r.contracts.TEST261121C00100000);
  assert.strictEqual(r.contracts.TEST261121C00100000.iv, 0.025);
});

test('liveBadgeHtml: desktop matches phone — No quote when quotes is empty', () => {
  const stubs = `
    var quotes = {};
    const APP_DEMO = false;
    function isUsMarketOpen() { return true; }
    function isPhoneLayout() { return false; }
    function isPricePending() { return false; }
  `;
  const { liveBadgeHtml, quoteLiveBadge } = load(
    [
      { kind: 'fn', name: 'quoteChangeReady' },
      { kind: 'fn', name: 'demoSamplePriceBadge' },
      { kind: 'fn', name: 'quoteLiveBadge' },
      { kind: 'fn', name: 'liveBadgeHtml' }
    ],
    stubs
  );
  const html = liveBadgeHtml('AAPL', true);
  assert.match(html, /No quote/);
  assert.doesNotMatch(html, /● Live/);
  assert.ok(html.includes('live-desk') && html.includes('live-phone'));
  const desk = quoteLiveBadge('AAPL', true);
  assert.match(desk, /No quote/);

  const stubsDelayed = stubs.replace('var quotes = {};', 'var quotes = { AAPL: { price: 180, state: "DELAYED" } };');
  const delayedFns = load(
    [
      { kind: 'fn', name: 'quoteChangeReady' },
      { kind: 'fn', name: 'demoSamplePriceBadge' },
      { kind: 'fn', name: 'quoteLiveBadge' },
      { kind: 'fn', name: 'liveBadgeHtml' }
    ],
    stubsDelayed
  );
  const delayed = delayedFns.liveBadgeHtml('AAPL', true);
  assert.match(delayed, /Delayed/);
  assert.doesNotMatch(delayed, /● Live/);
});