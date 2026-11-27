// ── Product brand: the ONE place to rename the app. After editing, run `node tools/sync-brand.js`
// (updates manifest.json, sw.js cache prefix and the static <head> tags), bump sw.js, run tests.
window.BRAND = {
  name: 'OpTrack',                    // shown in the top bar, sign-in, page title, messages
  shortName: 'OpTrack',               // home-screen label (≤12 chars ideal)
  tagline: 'Options Wheel Tracker',
  description: 'Track, analyse and optimise your options wheel strategy.',
  accent: '#f8f9fc',                  // manifest theme colour (brand orange #FF5A36 lives in the CSS :root block as --brand-orange)
  background: '#f8f9fc',
  cachePrefix: 'optrack',             // service-worker cache name prefix (lowercase, no spaces)
  siteUrl: 'https://optrack.app',                    // live public domain
  shareImage: 'optrack-share.png',
  icons: { favicon: 'favicon.ico', apple: 'apple-touch-icon.png', i16: 'icon-16.png', i32: 'icon-32.png', i192: 'icon-192.png', i512: 'icon-512.png',
           m192: 'icon-maskable-192.png', m512: 'icon-maskable-512.png', mark: 'logo-mark.svg', horizontal: 'logo-horizontal.svg' },
  supportEmail: 'support@optrack.app',

  // ── Plans and payments: the ONE pricing config. To change a price, edit `prices` here and swap the Stripe Price IDs
  // in Netlify (STRIPE_PRICE_PRO_ANNUAL_USD / STRIPE_PRICE_PRO_MONTHLY_USD). Display text ($4.92/mo, Save 30%) is
  // computed from these numbers by OT_TIER.priceDisplay (app/entitlement.js). Gating is ON: Free caps apply; Pro
  // (paid or the 14-day trial) unlocks paidFeatures. Founders are kept on Pro by entitlement docs (see SETUP.md).
  plans: {
    gating: true,
    currency: 'USD',
    symbol: '$',
    defaultInterval: 'annual',          // the toggle starts on Annual
    prices: {
      annual: { amount: 59 },           // $59/year → shown as $4.92/mo billed yearly; Save 30% lives on the Annual badge
      monthly: { amount: 6.99 }         // $6.99/month
    },
    priceMonthly: 6.99,                 // kept for older readers; same numbers as `prices`
    priceYearly: 59,
    trialDays: 14,                      // reverse trial, no card; the server sets the dates (OT_TIER.TRIAL_DAYS)
    free: { maxWheelTickers: 2, maxOpenLeaps: 1, maxCsvImports: 1 },   // limits on the free plan (new additions only)
    // Paid-only features. Remove a line to make it free; add it back to make it paid.
    // Robinhood CSV import is not here: Free gets free.maxCsvImports imports, Pro unlimited.
    // Auto-updating option prices are Pro / trial only (OT_TIER.liveOptionPrices). Analytics,
    // the report, monthly targets, SmartScan, OpTrack Bot and PMCC tracking (within the cap) are free.
    paidFeatures: [
      'unlimited'         // more than the free limits above (2 open wheel tickers, 1 open LEAP)
    ],
    // The Free vs Pro comparison (landing, start page and the in-app upgrade box all read this).
    comparison: [
      ['Manual entry and SmartScan', '✓', '✓'],
      ['OpTrack Bot <em>(requires Grok Bot)</em>', '✓', '✓'],
      ['Auto-updating stock prices', '✓', '✓'],
      ['Auto-updating option prices', '–', '✓'],
      ['Robinhood CSV import', '1 import', 'Unlimited'],
      ['Realised P&amp;L and Home', '✓', '✓'],
      ['Export and delete your data', '✓', '✓'],
      ['Wheel tickers', 'Up to 2 open', 'Unlimited'],
      ['LEAPs &amp; PMCC tracking', '1 open LEAP/PMCC', 'Unlimited LEAPs &amp; PMCCs'],
      ['Home monthly targets, analytics &amp; scoreboard', '✓', '✓'],
      ['Plain-English account performance report', '✓', '✓']
    ]
  },
  // Plain-English names for upgrade prompts.
  featureNames: {
    'unlimited': 'Unlimited wheels, LEAPs, CSV imports, and auto-updating option prices.',
    'robinhood-import': 'Unlimited Robinhood CSV imports',
    'option-prices': 'Auto-updating option prices',
    'analytics': 'Monthly target tracking, analytics and scoreboard',
    'report': 'Plain-English account performance report'
  },

  // ── Privacy-friendly, cookie-free analytics. Off until set.
  // provider: '' (off) | 'plausible' (set domain) | 'goatcounter' (set goatcounter, e.g. 'https://yourname.goatcounter.com/count')
  analytics: { provider: 'goatcounter', domain: '', goatcounter: 'https://optrack.goatcounter.com/count' },

  optrackBot: { url: 'https://x.ai/bot/o3uycIpqy16pM04-Yh1AW' }
};
