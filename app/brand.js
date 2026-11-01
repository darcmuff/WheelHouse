// ── Product brand: the ONE place to rename the app. After editing, run `node tools/sync-brand.js`
// (updates manifest.json, sw.js cache prefix and the static <head> tags), bump sw.js, run tests.
window.BRAND = {
  name: 'OpTrack',                    // shown in the top bar, sign-in, page title, messages
  shortName: 'OpTrack',               // home-screen label (≤12 chars ideal)
  tagline: 'Options Wheel Tracker',
  description: 'Track, analyse and optimise your options wheel strategy.',
  accent: '#0D9488',                  // manifest theme colour (in-app colours live in the CSS :root block)
  background: '#0f1115',
  cachePrefix: 'optrack',             // service-worker cache name prefix (lowercase, no spaces)
  siteUrl: 'https://wheelhouse-tracker.netlify.app',   // placeholder until a domain is bought (optrack.app / getoptrack.com)
  shareImage: 'wheelhouse-share.png',
  icons: { favicon: 'favicon.ico', apple: 'apple-touch-icon.png', i192: 'icon-192.png', i512: 'icon-512.png' },
  supportEmail: '',                   // set before going public

  // ── Plans and payments. Gating is OFF: everyone gets everything until Marc sets gating: true.
  // Founders (Marc, his brother) are kept on Pro by entitlement docs (see SETUP.md) and are never locked out.
  plans: {
    gating: false,
    currency: '£',
    priceMonthly: 9,
    priceYearly: 79,
    free: { maxWheelTickers: 3, maxOpenLeaps: 1 },   // limits on the free plan
    // Paid-only features. Remove a line to make it free; add it back to make it paid.
    paidFeatures: [
      'unlimited',        // more than the free limits above
      'leaps-full',       // LEAP + PMCC tracking beyond the free limit, LEAP analytics
      'live-refresh',     // option marks refreshed automatically every minute
      'extended-hours',   // pre-market / after-hours prices
      'robinhood-import', // Robinhood CSV import
      'analytics'         // More stats: monthly target, analytics, scoreboard
    ]
  },
  // Plain-English names for the comparison table and upgrade prompts.
  featureNames: {
    'unlimited': 'Unlimited tickers and LEAPs',
    'leaps-full': 'Full LEAP and PMCC tracking',
    'live-refresh': 'Live captured profit (marks refresh every minute)',
    'extended-hours': 'Pre-market and after-hours prices',
    'robinhood-import': 'Robinhood CSV import',
    'analytics': 'More stats: monthly 2% target and analytics'
  },

  // ── Privacy-friendly, cookie-free analytics. Off until set.
  // provider: '' (off) | 'plausible' (set domain) | 'goatcounter' (set goatcounter, e.g. 'https://yourname.goatcounter.com/count')
  analytics: { provider: '', domain: '', goatcounter: '' }
};
