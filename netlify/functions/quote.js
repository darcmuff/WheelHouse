// Valid quotes: Netlify-CDN-Cache-Control shared cache; zero prints: no-store (quote-cache.js).
const { headersForQuote } = require('../lib/quote-cache');

const _handler = async (event) => {
  const sym = event.queryStringParameters?.symbol;
  if (!sym) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing symbol parameter' }) };
  }

  const key = process.env.FINNHUB_KEY;
  if (!key) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  try {
    const res = await fetch(
      `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(sym)}&token=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) {
      return { statusCode: res.status, body: JSON.stringify({ error: `Finnhub returned ${res.status}` }) };
    }
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...headersForQuote(data) },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
};

exports._handler = _handler;
exports.handler = require('../lib/origin').guard(_handler);
