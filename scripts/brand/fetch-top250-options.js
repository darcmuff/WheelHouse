#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'top250-options.json');
const MACROPTION_URL = 'https://www.macroption.com/stock-options-volume/';
const ELIX_OPTIONS_URL = 'https://elixstocks.com/options';
const LIMIT = 250;

/** Broad indexes and fund tickers — never logo.dev (letters on ETF gradient or hash hue). */
const INDEX_ETF_BLOCK = new Set([
  'SPY', 'QQQ', 'IWM', 'DIA', 'SPX', 'SPXW', 'VIX', 'VXX', 'NDX', 'RUT', 'XSP',
  'GLD', 'SLV', 'IBIT', 'BITO', 'TLT', 'HYG', 'EEM', 'EFA', 'ARKK', 'VOO', 'IVV', 'VTI', 'XLC', 'XLF', 'XLK',
]);

const ETF_NAME = /\b(ETF|ETN|TRUST|INDEX|FUND|SPDR|ISHARES|INVESCO QQQ|VANGUARD|PROSHARES|DAILY (LONG|SHORT))\b/i;

function parseMacroption(html) {
  const re = /\s+(\d+)\.\s+([A-Z][A-Z0-9.-]{0,9})\s+=\s+([\d,]+)\s+=\s+([^\n]+)/g;
  const rows = [];
  let m;
  while ((m = re.exec(html))) {
    rows.push({
      rank: +m[1],
      symbol: m[2].replace(/\./g, '-'),
      avgDailyVolume: +m[3].replace(/,/g, ''),
      name: m[4].trim(),
    });
  }
  return rows;
}

function parseElix(html) {
  const tradingDay = html.match(/Trading day <b>([^<]+)</)?.[1] || null;
  const rows = [];
  const trRe = /<tr><td class="n">(\d+)<\/td><td><a class="sym" href="\/security\/([^"]+)">[^<]+<\/a><span class="nm" title="([^"]*)">/g;
  let t;
  while ((t = trRe.exec(html))) {
    rows.push({
      rank: +t[1],
      symbol: t[2].toUpperCase(),
      name: t[3].replace(/&amp;/g, '&').replace(/&#x27;/g, "'"),
    });
  }
  return { tradingDay, rows };
}

function buildList(macroptionRows, elix) {
  const picked = [];
  const skipped = [];
  for (const row of macroptionRows) {
    if (picked.length >= LIMIT) break;
    const sym = row.symbol;
    if (INDEX_ETF_BLOCK.has(sym)) {
      skipped.push({ symbol: sym, reason: 'index_etf_blocklist' });
      continue;
    }
    if (ETF_NAME.test(row.name)) {
      skipped.push({ symbol: sym, reason: 'etf_name', name: row.name });
      continue;
    }
    const elixHit = elix.rows.find((r) => r.symbol === sym.replace(/-/g, '.'));
    picked.push({
      rank: picked.length + 1,
      symbol: sym,
      avgDailyVolume: row.avgDailyVolume,
      name: row.name,
      macroptionRank: row.rank,
      ...(elixHit ? { elixDailyRank: elixHit.rank } : {}),
    });
  }
  return { tickers: picked, skipped };
}

async function main() {
  const headers = { 'User-Agent': 'WheelHouse-brand-bot/1.0 (+https://wheelhouse-tracker.netlify.app)' };
  const [macroHtml, elixHtml] = await Promise.all([
    fetch(MACROPTION_URL, { headers, signal: AbortSignal.timeout(120000) }).then((r) => {
      if (!r.ok) throw new Error(`Macroption HTTP ${r.status}`);
      return r.text();
    }),
    fetch(ELIX_OPTIONS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(120000) }).then((r) => {
      if (!r.ok) throw new Error(`ElixStocks HTTP ${r.status}`);
      return r.text();
    }),
  ]);

  const macroptionRows = parseMacroption(macroHtml);
  if (macroptionRows.length < LIMIT) throw new Error(`Macroption parse too short: ${macroptionRows.length}`);

  const elix = parseElix(elixHtml);
  const { tickers, skipped } = buildList(macroptionRows, elix);

  const doc = {
    generatedAt: new Date().toISOString(),
    limit: LIMIT,
    metric:
      'YTD 2026 average daily options contract volume (all expirations), CBOE-family exchanges — Macroption table; cross-checked against ElixStocks OCC daily snapshot.',
    approximation: true,
    approximationNote:
      'Primary ordering is Macroption YTD average daily volume (data through late Aug 2026 per that page). ElixStocks provides a more recent single-day OCC volume snapshot for validation, not re-ranking. ETFs and broad indexes excluded via blocklist and name filter.',
    sources: [
      { name: 'Macroption — Most Active Stocks by Options Volume 2026', url: MACROPTION_URL, field: 'avg_daily_volume' },
      { name: 'ElixStocks — Options volume by day (OCC)', url: ELIX_OPTIONS_URL, field: 'contracts_traded', tradingDay: elix.tradingDay },
    ],
    skippedWhileBuilding: skipped,
    tickers,
    symbols: tickers.map((t) => t.symbol),
  };

  fs.writeFileSync(OUT, JSON.stringify(doc, null, 2));
  const appCopy = path.join(__dirname, '../../app/brand/top250-options.json');
  fs.mkdirSync(path.dirname(appCopy), { recursive: true });
  fs.writeFileSync(appCopy, JSON.stringify(doc, null, 2));
  console.log(`Wrote ${tickers.length} symbols to ${OUT} and ${appCopy}`);
  console.log(`ElixStocks trading day: ${elix.tradingDay || 'unknown'}`);
  if (skipped.length) console.log(`Skipped while filling 250: ${skipped.length}`, skipped.slice(0, 5));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});