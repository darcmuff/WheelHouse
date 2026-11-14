#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { loadTickerUniverse, shardKey } = require('./ticker-universe');
const { fetchLogoPng: fetchLogoDev } = require('../../netlify/lib/logo-dev');
const { mapWithBackoff, PRICE_PER_BRAND_USD } = require('./logo-fetch');
const { analyseLogoPng, applyBrandOverride } = require('../../netlify/lib/wheelbrand-image');
const { fallbackHueTicker, bgCssFromGradient, etfBg } = require('../../netlify/lib/wheelbrand-color');

const ROOT = path.join(__dirname, '../..');
const BRAND_DIR = path.join(ROOT, 'app', 'brand');
const SHARDS = path.join(BRAND_DIR, 'shards');
const OVERRIDES = path.join(BRAND_DIR, 'overrides.json');
const INDEX = path.join(BRAND_DIR, 'index.json');
const STATE = path.join(__dirname, 'data', 'build-state.json');

const DEMO_TICKERS = ['KO', 'AMD', 'SOFI', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'SPY', 'QQQ', 'PAFO', 'MPAC', 'SPCX'];

function sha(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

function readOverrides() {
  if (!fs.existsSync(OVERRIDES)) return {};
  return JSON.parse(fs.readFileSync(OVERRIDES, 'utf8'));
}

function readState() {
  if (!fs.existsSync(STATE)) return { tickers: {}, listsHash: null };
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

function writeState(st) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(st, null, 1));
}

function parseArgs(argv) {
  const flags = new Set(argv.filter((a) => a.startsWith('--')));
  return {
    refreshLists: flags.has('--refresh-lists'),
    full: flags.has('--full'),
    incremental: flags.has('--incremental'),
    confirmCost: flags.has('--confirm-cost'),
    mockDemo: flags.has('--mock-demo'),
    force: flags.has('--force'),
    tickers: argv.filter((a) => !a.startsWith('--') && !a.startsWith('-')),
  };
}

function leanEntry(sym, data) {
  const g = data.gradient;
  return {
    g: { f: g.frm, t: g.to, gl: g.glow, k: g.kind },
    fb: !!data.fallback,
    etf: !!data.etf,
    wo: data.watermarkOpacity ?? 0.16,
    ...(data.mark ? { m: `${sym}.png` } : {}),
    ...(data.aspect ? { a: Math.round(data.aspect * 1000) / 1000 } : {}),
  };
}

function writeShards(all) {
  const buckets = {};
  for (const [sym, entry] of Object.entries(all)) {
    const shard = shardKey(sym);
  if (!buckets[shard]) buckets[shard] = {};
    buckets[shard][sym] = leanEntry(sym, entry);
  }
  fs.mkdirSync(SHARDS, { recursive: true });
  const shardNames = Object.keys(buckets).sort();
  for (const name of shardNames) {
    fs.writeFileSync(path.join(SHARDS, `${name}.json`), JSON.stringify(buckets[name]));
  }
  const legacy = fs.readdirSync(SHARDS).filter((f) => f.endsWith('.json'));
  for (const f of legacy) {
    const base = f.replace(/\.json$/, '');
    if (!buckets[base]) fs.unlinkSync(path.join(SHARDS, f));
  }
  fs.writeFileSync(
    INDEX,
    JSON.stringify({ v: 1, generatedAt: new Date().toISOString(), shards: shardNames, count: Object.keys(all).length }, null, 1)
  );
}

async function buildFallback(sym, universe, overrides) {
  const ov = overrides[sym] || {};
  if (ov.disable_logo || ov.force_fallback) {
    const { gradient } = fallbackHueTicker(sym);
    return { fallback: true, gradient, reason: ov.disable_logo ? 'disable_logo' : 'force_fallback', watermarkOpacity: 0.13 };
  }
  const meta = universe.meta[sym] || {};
  if (meta.etf) {
    const bg = etfBg(sym);
    const { gradient, brand } = fallbackHueTicker(sym);
    if (bg) return { fallback: true, etf: true, gradient, brandHex: gradient.to, watermarkOpacity: 0.13, legacyBg: bg };
    return { fallback: true, etf: true, gradient, watermarkOpacity: 0.13 };
  }
  const { gradient } = fallbackHueTicker(sym);
  return { fallback: true, gradient, watermarkOpacity: 0.13 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const secret = process.env.LOGO_DEV_SECRET_KEY || '';
  const overrides = readOverrides();
  delete overrides._doc;

  const snapshot = await loadTickerUniverse({ refresh: args.refreshLists, extraTickers: DEMO_TICKERS });
  const universeHash = crypto.createHash('sha256').update(snapshot.symbols.join(',')).digest('hex').slice(0, 16);

  const state = readState();
  const symbols = args.tickers.length ? args.tickers.map((s) => s.toUpperCase()) : snapshot.symbols;

  const work = [];
  for (const sym of symbols) {
    const ov = overrides[sym] || {};
    if (ov.disable_logo) {
      work.push({ sym, kind: 'fallback' });
      continue;
    }
    const meta = snapshot.meta[sym] || {};
    if (meta.etf) {
      work.push({ sym, kind: 'etf' });
      continue;
    }
    const prev = state.tickers[sym];
    const ovHash = crypto.createHash('sha256').update(JSON.stringify(ov)).digest('hex').slice(0, 8);
    if (!args.force && prev && prev.overrideHash === ovHash && prev.logoHash) work.push({ sym, kind: 'cached', prev });
    else work.push({ sym, kind: 'fetch' });
  }

  const toFetch = work.filter((w) => w.kind === 'fetch');
  const estCost = toFetch.length * PRICE_PER_BRAND_USD;

  console.log('WheelHouse brand build');
  console.log(`Universe: ${snapshot.counts.unique} symbols (ETFs: ${snapshot.counts.etf}, S&P500 tags: ${snapshot.counts.sp500})`);
  console.log(`Work: ${work.length} tickers — fetch ${toFetch.length}, cached ${work.filter((w) => w.kind === 'cached').length}, fallback/ETF ${work.filter((w) => w.kind === 'fallback' || w.kind === 'etf').length}`);
  console.log(`Estimated Brand API cost ($${PRICE_PER_BRAND_USD}/req): $${estCost.toFixed(2)} for ${toFetch.length} new/changed tickers`);
  console.log('Free Community plan includes $5 API credits/mo (~100 Brand lookups). Repeats for the same brand are free 24h. Full universe needs Startup ($33/mo, $15 credits) or a phased seed.');

  const mayFetch = args.full || args.incremental;
  if (!mayFetch) {
    console.log('\nDry run only (default).');
    console.log('  Incremental (weekly): node scripts/brand/build.js --incremental');
    console.log('  Full universe seed:   node scripts/brand/build.js --full --confirm-cost');
    if (!secret) console.log('LOGO_DEV_SECRET_KEY is not set — fetching would be skipped anyway.');
    return;
  }

  if (args.full && !args.confirmCost) {
    console.error('Refusing --full without --confirm-cost (owner must approve estimated spend).');
    process.exit(1);
  }

  if (args.full && toFetch.length > 0) {
    console.log(`\n--full approved: fetching ${toFetch.length} logos (~$${estCost.toFixed(2)})`);
  } else if (args.incremental && toFetch.length > 0) {
    console.log(`\n--incremental: fetching ${toFetch.length} new/changed logos (~$${estCost.toFixed(2)})`);
  } else if (toFetch.length === 0) {
    console.log('\nNothing to fetch (incremental up to date).');
    writeShards(Object.fromEntries(
      Object.entries(state.tickers).map(([sym, st]) => [sym, st.entry || {}]).filter(([, e]) => e && e.gradient)
    ));
    return;
  }

  if (!secret && !args.mockDemo) {
    console.error('LOGO_DEV_SECRET_KEY missing. Use --mock-demo to process demo tickers without API.');
    process.exit(1);
  }

  fs.mkdirSync(BRAND_DIR, { recursive: true });
  const built = {};

  for (const job of work) {
    if (job.kind === 'fallback' || job.kind === 'etf') {
      built[job.sym] = await buildFallback(job.sym, snapshot, overrides);
      continue;
    }
    if (job.kind === 'cached') {
      const pngPath = path.join(BRAND_DIR, `${job.sym}.png`);
      if (fs.existsSync(pngPath)) {
        built[job.sym] = { ...job.prev.entry, mark: `${job.sym}.png` };
        continue;
      }
    }

    let png;
    if (args.mockDemo && DEMO_TICKERS.includes(job.sym)) {
      png = await mockLogoPng(job.sym);
    } else if (secret) {
      const hit = await mapWithBackoff([job.sym], async (s) => fetchLogoDev(s, secret)).then((r) => r[0]);
      png = hit && hit.png;
    }

    if (!png) {
      built[job.sym] = await buildFallback(job.sym, snapshot, overrides);
      state.tickers[job.sym] = { updatedAt: new Date().toISOString(), miss: true };
      continue;
    }

    let entry = await analyseLogoPng(png);
    entry = applyBrandOverride(entry, overrides[job.sym]);
    const logoHash = sha(png);
    const pngPath = path.join(BRAND_DIR, `${job.sym}.png`);
    fs.writeFileSync(pngPath, entry.maskPng || png);
    built[job.sym] = {
      fallback: false,
      gradient: entry.gradient,
      aspect: entry.aspect,
      mark: `${job.sym}.png`,
      watermarkOpacity: 0.16,
    };
    state.tickers[job.sym] = {
      updatedAt: new Date().toISOString(),
      logoHash,
      overrideHash: crypto.createHash('sha256').update(JSON.stringify(overrides[job.sym] || {})).digest('hex').slice(0, 8),
      entry: built[job.sym],
    };
    console.log('ok', job.sym, entry.brandHex, entry.method);
  }

  writeShards(built);
  state.listsHash = universeHash;
  state.lastBuildAt = new Date().toISOString();
  writeState(state);
  console.log(`Wrote ${Object.keys(built).length} entries to ${BRAND_DIR}`);
}

async function mockLogoPng(sym) {
  const sharp = require('sharp');
  const hue = sym.charCodeAt(0) * 17;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="hsl(${hue},70%,45%)"/><text x="50%" y="54%" text-anchor="middle" font-size="120" fill="white" font-family="sans-serif">${sym.slice(0, 4)}</text></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});