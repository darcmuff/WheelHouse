// Fetch S&P 500 + Nasdaq-listed symbols; cache snapshot on disk.
'use strict';

const fs = require('fs');
const path = require('path');

const SNAPSHOT = path.join(__dirname, 'data', 'tickers-snapshot.json');
const NASDAQ_URL = 'https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt';
// otherlisted.txt is intentionally omitted — universe is Nasdaq-listed ∪ S&P 500 only.

// Public S&P 500 constituents table (Wikipedia).
const SP500_WIKI = 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies';

const WARRANT_RE = /warrant|units$|\sunit\b|\sright\b/i;
const BAD_SUFFIX_RE = /\.(WS|W|U|R)$/i;

function parseNasdaqListed(text) {
  const lines = text.split('\n').filter((l) => l && !l.startsWith('File') && !l.startsWith('Symbol|'));
  const out = [];
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 7) continue;
    const [symbol, name, , testIssue, , , etf] = parts;
    const sym = String(symbol || '').trim().toUpperCase();
    if (!sym || testIssue === 'Y') continue;
    const isEtf = etf === 'Y';
    const isWarrant = BAD_SUFFIX_RE.test(sym) || WARRANT_RE.test(String(name || ''));
    if (isWarrant && !isEtf) continue;
    out.push({ symbol: sym, name: String(name || '').trim(), exchange: 'NASDAQ', etf: isEtf });
  }
  return out;
}

function parseOtherListed(text) {
  const lines = text.split('\n').filter((l) => l && !l.startsWith('File') && !l.startsWith('ACT Symbol|'));
  const out = [];
  for (const line of lines) {
    const parts = line.split('|');
    if (parts.length < 7) continue;
    const [symbol, name, exchange, , testIssue, , etf] = parts;
    const sym = String(symbol || '').trim().toUpperCase();
    if (!sym || testIssue === 'Y') continue;
    const isEtf = etf === 'Y';
    const isWarrant = BAD_SUFFIX_RE.test(sym) || WARRANT_RE.test(String(name || ''));
    if (isWarrant && !isEtf) continue;
    out.push({ symbol: sym, name: String(name || '').trim(), exchange: String(exchange || 'OTHER').trim(), etf: isEtf });
  }
  return out;
}

function parseSp500Html(html) {
  const symRe = /<td[^>]*>\s*<a[^>]*>([A-Z][A-Z0-9.-]*)<\/a>\s*<\/td>/gi;
  const set = new Set();
  let m;
  while ((m = symRe.exec(html))) {
    const sym = m[1].toUpperCase().replace(/\./g, '-');
    if (/^[A-Z][A-Z0-9.-]{0,9}$/.test(sym)) set.add(sym);
  }
  return [...set].sort();
}

async function fetchText(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(120000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/**
 * @param {{ refresh?: boolean, fetchImpl?: typeof fetch, extraTickers?: string[] }} opts
 */
async function loadTickerUniverse(opts = {}) {
  const { refresh = false, fetchImpl = fetch, extraTickers = [] } = opts;
  if (!refresh && fs.existsSync(SNAPSHOT)) {
    return JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  }

  const [nasdaqTxt, spHtml] = await Promise.all([fetchText(NASDAQ_URL, fetchImpl), fetchText(SP500_WIKI, fetchImpl)]);

  const nasdaq = parseNasdaqListed(nasdaqTxt);
  const sp500 = parseSp500Html(spHtml);

  const bySym = new Map();
  for (const row of nasdaq) {
    const prev = bySym.get(row.symbol);
    if (!prev || (prev.etf && !row.etf)) bySym.set(row.symbol, row);
  }
  for (const sym of sp500) {
    if (!bySym.has(sym)) bySym.set(sym, { symbol: sym, name: sym, exchange: 'SP500', etf: false });
    else bySym.get(sym).sp500 = true;
  }
  for (const raw of extraTickers) {
    const sym = String(raw || '').trim().toUpperCase();
    if (!sym || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(sym)) continue;
    if (!bySym.has(sym)) bySym.set(sym, { symbol: sym, name: sym, exchange: 'EXTRA', etf: false });
  }

  const symbols = [...bySym.keys()].sort();
  const snapshot = {
    generatedAt: new Date().toISOString(),
    sources: { nasdaq: NASDAQ_URL, sp500: SP500_WIKI },
    counts: {
      nasdaq: nasdaq.length,
      sp500: sp500.length,
      sp500Only: sp500.filter((s) => !nasdaq.some((r) => r.symbol === s)).length,
      unique: symbols.length,
      etf: symbols.filter((s) => bySym.get(s).etf).length,
    },
    symbols,
    meta: Object.fromEntries(symbols.map((s) => [s, bySym.get(s)])),
  };

  fs.mkdirSync(path.dirname(SNAPSHOT), { recursive: true });
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 1));
  return snapshot;
}

function shardKey(symbol) {
  const c = (symbol[0] || '0').toLowerCase();
  return /[a-z]/.test(c) ? c : '0-9';
}

module.exports = { loadTickerUniverse, SNAPSHOT, shardKey, parseNasdaqListed, parseOtherListed };