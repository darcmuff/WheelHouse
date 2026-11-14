# Wheel card brand assets (Logo.dev)

Build-time pipeline for per-ticker gradients and white watermark PNGs. Runtime fills gaps via `/.netlify/functions/brand`.

## Kill switch

In `app/brand/overrides.json`:

```json
{
  "TICKER": { "disable_logo": true }
}
```

That ticker uses the hash-hue letter watermark only (no Logo.dev fetch, no PNG). The build script and Netlify function both honour it. You can pull a logo back within minutes by removing the flag and re-running an incremental build.

## Ticker universe

On each run the script loads (or refreshes) a cached snapshot at `scripts/brand/data/tickers-snapshot.json`:

- Nasdaq Trader `nasdaqlisted.txt` and `otherlisted.txt` (test issues skipped; warrants/units/rights filtered by name/suffix; ETF flag respected)
- Wikipedia S&P 500 constituents table
- Demo tickers from `demo.js`

## Safety: no accidental full fetch

**Default is dry run.** It prints how many logos would be fetched and the estimated API cost.

```bash
node scripts/brand/build.js
node scripts/brand/build.js --refresh-lists   # refresh ticker snapshot only (still dry run)
```

A real fetch requires **both** flags:

```bash
export LOGO_DEV_SECRET_KEY=sk_...
node scripts/brand/build.js --full --confirm-cost
```

Optional: `--mock-demo` processes demo tickers with coloured SVG mocks (no API). `--force` refetches changed overrides. Pass explicit tickers to limit scope.

Incremental state lives in `scripts/brand/data/build-state.json` (logo hashes + override hashes).

## Output layout

- `app/brand/index.json` — shard index (lazy-loaded in the app)
- `app/brand/shards/{a-z,0-9}.json` — lean JSON per ticker
- `app/brand/{TICKER}.png` — white watermark masks

## Environment variables

| Where | Name | Purpose |
|-------|------|---------|
| Build / GitHub Actions | `LOGO_DEV_SECRET_KEY` | Logo.dev **secret** key (`sk_`) for Brand API (`GET /v2/brands?ticker=…`, $0.05/req) — server-side only |
| Netlify | `LOGO_DEV_SECRET_KEY` | Same, for on-demand function |
| Netlify (optional) | `LOGO_DEV_PUBLISHABLE_KEY` | `pk_` for CDN hotlink in chips only — not used for watermarks |

## GitHub Action

`.github/workflows/brand-assets.yml` — `workflow_dispatch` and weekly cron on **dev** only. Skips cleanly when the secret is missing.