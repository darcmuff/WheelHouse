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

- **Default universe:** `top250-options.json` — top 250 US **stocks** by options volume (Macroption YTD avg daily volume, cross-checked with ElixStocks OCC daily snapshot). ETFs/indexes excluded.
- **Legacy** (not default): S&P 500 ∪ Nasdaq via `loadSp500NasdaqUniverse()` → `data/tickers-snapshot-legacy.json`
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

`.github/workflows/brand-assets.yml` checks out **dev**, seeds top-250 logos when `LOGO_DEV_SECRET_KEY` is set, and commits shards under `app/brand/`.

**Triggers**

| Trigger | When it runs |
|---------|----------------|
| Push to `dev` touching `scripts/brand/seed.trigger` | Immediate seed (safe: commits from the job only change `app/brand/`, `scripts/brand/data/`, and optionally `top250-options.json` — not `seed.trigger`, so the job cannot loop). |
| `workflow_dispatch` | Only if the workflow is visible on the branch you select (often blocked when the workflow is not on the default branch). |
| Weekly cron (`0 6 * * 1`) | **Does not run today:** scheduled workflows use the copy of the file on the **default branch** (`main`). Until this workflow is merged to `main`, only the `seed.trigger` push path runs it on `dev`. |

**Re-run the seed manually (dev):** bump or touch the trigger file and push to `dev`:

```bash
date -u +%Y-%m-%dT%H:%M:%SZ > scripts/brand/seed.trigger
git add scripts/brand/seed.trigger
git commit -m "chore(brand): trigger top-250 seed"
git push origin dev
```

Skips Logo.dev fetch when the repo secret is missing (dry build only).