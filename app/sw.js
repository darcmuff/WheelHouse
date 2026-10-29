// WheelHouse service worker. Bump CACHE on every release.
const CACHE = 'wheelhouse-v99';
const STATIC = ['./', './manifest.json', './favicon.ico', './apple-touch-icon.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('wheelhouse-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Never touch: other origins (Firebase, Firestore, Google auth, CDNs, quote APIs), Netlify functions, /api, /__/ (Firebase auth helper).
function bypass(req, url) {
  if (req.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__/')) return true;
  if (url.pathname.endsWith('/sw.js')) return true;
  return false;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (bypass(req, url)) return;
  const isPage = req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  if (isPage) {
    // Network first so updates always arrive; fall back to cached shell offline.
    e.respondWith(fetch(req).then(res => {
      if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put('./', c)); }
      return res;
    }).catch(() => caches.match('./').then(r => r || caches.match(req))));
    return;
  }
  // Cache first for same-origin static assets.
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res && res.ok && res.type === 'basic') { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
    return res;
  })));
});

if (typeof module !== 'undefined') module.exports = { bypass, CACHE };
