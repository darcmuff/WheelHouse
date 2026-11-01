// ── Product brand: the ONE place to rename the app. After editing, run `node tools/sync-brand.js`
// (updates manifest.json, sw.js cache prefix and the static <head> tags), bump sw.js, run tests.
window.BRAND = {
  name: 'WheelHouse',                 // shown in the top bar, sign-in, page title, messages
  shortName: 'WheelHouse',            // home-screen label (≤12 chars ideal)
  tagline: 'Options Wheel Tracker',
  description: 'Track, analyse and optimise your options wheel strategy.',
  accent: '#0D9488',                  // manifest theme colour (in-app colours live in the CSS :root block)
  background: '#0f1115',
  cachePrefix: 'wheelhouse',          // service-worker cache name prefix (lowercase, no spaces)
  siteUrl: 'https://wheelhouse-tracker.netlify.app',
  shareImage: 'wheelhouse-share.png',
  icons: { favicon: 'favicon.ico', apple: 'apple-touch-icon.png', i192: 'icon-192.png', i512: 'icon-512.png' },
  supportEmail: ''                    // set before going public
};
