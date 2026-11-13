// ── Product brand: the ONE place to rename the app. After editing, run `node tools/sync-brand.js`
// (updates manifest.json, sw.js cache prefix and the static <head> tags), bump sw.js, run tests.
window.BRAND = {
  name: 'OpTrack',                    // shown in the top bar, sign-in, page title, messages
  shortName: 'OpTrack',               // home-screen label (≤12 chars ideal)
  tagline: 'Options Wheel Tracker',
  description: 'Track, analyse and optimise your options wheel strategy.',
  accent: '#111111',                  // manifest theme colour (brand accent #FF5A36 lives in the CSS :root block)
  background: '#111111',
  cachePrefix: 'optrack',             // service-worker cache name prefix (lowercase, no spaces)
  siteUrl: 'https://optrack.app',                    // live public domain
  shareImage: 'optrack-share.png',
  icons: { favicon: 'favicon.ico', apple: 'apple-touch-icon.png', i16: 'icon-16.png', i32: 'icon-32.png', i192: 'icon-192.png', i512: 'icon-512.png',
           m192: 'icon-maskable-192.png', m512: 'icon-maskable-512.png', mark: 'logo-mark.svg', horizontal: 'logo-horizontal.svg' },
  supportEmail: 'support@optrack.app',

  // ── Plans and payments. Gating is ON: Free caps apply; Pro unlocks paidFeatures.
  // Founders (Marc, his brother) are kept on Pro by entitlement docs (see SETUP.md) and are never locked out.
  plans: {
    gating: true,
    currency: '£',
    priceMonthly: 9,
    priceYearly: 79,
    free: { maxWheelTickers: 2, maxOpenLeaps: 1 },   // limits on the free plan
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
    'analytics': 'More stats: monthly return against your own target, and analytics'
  },

  // ── Privacy-friendly, cookie-free analytics. Off until set.
  // provider: '' (off) | 'plausible' (set domain) | 'goatcounter' (set goatcounter, e.g. 'https://yourname.goatcounter.com/count')
  analytics: { provider: 'goatcounter', domain: '', goatcounter: 'https://optrack.goatcounter.com/count' }
};
