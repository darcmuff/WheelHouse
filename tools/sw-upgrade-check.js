#!/usr/bin/env node
// Old service worker is controlling a page. The new one is deployed. Reopening the
// app lands on the new version once, with no refresh banner and no reload loop.
// A session that has already been used does not reload until the tab has been
// hidden for 30 minutes and no modal is open.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const APP = path.resolve(__dirname, '..', 'app');
const NEW_SW = fs.readFileSync(path.join(APP, 'sw.js'), 'utf8');
if (!/optrack-v197/.test(NEW_SW)) throw new Error('expected the new sw to be v197');
const OLD_SW = NEW_SW.replace('optrack-v197', 'optrack-v196');
const NEXT_SW = NEW_SW.replace('optrack-v197', 'optrack-v198');
const OLD_PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>old</title></head><body><p id="mark">old-page</p>
<script>
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>{
    const hadCtrl=!!navigator.serviceWorker.controller;
    function showSwUpdate(){
      if(document.getElementById('sw-update'))return;
      const bar=document.createElement('div');
      bar.id='sw-update';
      bar.innerHTML='<span>New version — Refresh when you\\'re ready.</span><button type="button" id="sw-update-btn">Refresh</button>';
      document.body.appendChild(bar);
    }
    navigator.serviceWorker.addEventListener('controllerchange',()=>{if(hadCtrl)showSwUpdate();});
    navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(r=>r.update());
  });
}
</script></body></html>`;

const state = { mode: 'old' };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };

function start() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const u = decodeURIComponent((req.url || '/').split('?')[0]);
      if (u === '/sw.js') {
        const body = state.mode === 'old' ? OLD_SW : state.mode === 'next' ? NEXT_SW : NEW_SW;
        res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
        res.end(body);
        return;
      }
      if (u === '/' || u === '/index.html') {
        if (state.mode === 'old') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
          res.end(OLD_PAGE);
          return;
        }
      }
      const rel = (u === '/' ? 'landing.html' : u.replace(/^\/+/, ''));
      const abs = path.resolve(APP, rel);
      if (abs !== APP && !abs.startsWith(APP + path.sep)) { res.writeHead(403); res.end('no'); return; }
      fs.readFile(abs, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found ' + rel); return; }
        res.writeHead(200, { 'content-type': types[path.extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: 'http://127.0.0.1:' + server.address().port }));
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function controlling(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const ctrl = navigator.serviceWorker && navigator.serviceWorker.controller;
    if (!ctrl) { resolve(''); return; }
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve('old-or-silent'), 1000);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve((e.data && e.data.cache) || ''); };
    try { ctrl.postMessage({ type: 'VERSION' }, [ch.port2]); } catch (e) { clearTimeout(t); resolve(''); }
  }));
}

async function waitCache(page, cache, ms) {
  const deadline = Date.now() + ms;
  let last = '';
  while (Date.now() < deadline) {
    try { last = await controlling(page); if (last === cache) return; } catch (e) {}
    await sleep(200);
  }
  throw new Error('controller stayed ' + last + ', wanted ' + cache);
}

async function main() {
  const { server, origin } = await start();
  const exe = fs.existsSync('/usr/local/bin/google-chrome') ? '/usr/local/bin/google-chrome' : undefined;
  const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const ctx = await browser.newContext();
  let navs = 0;
  try {
    const open = await ctx.newPage();
    await open.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await open.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
    console.log('old controller ready');
    await open.close();

    state.mode = 'new';
    const page = await ctx.newPage();
    page.on('pageerror', (err) => console.log('PAGEERROR', err.message));
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navs++; });
    await page.addInitScript(() => {
      function arm() {
        new MutationObserver(function () {
          var t = document.body ? document.body.innerText : '';
          if (document.getElementById('sw-update') || /New version — Refresh/.test(t)) window.__otSawBanner = 1;
        }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
      else arm();
    });
    await page.goto(origin + '/', { waitUntil: 'domcontentloaded' });
    await waitCache(page, 'optrack-v197', 20000);
    const after = navs;
    await sleep(1500);
    if (navs > 2) throw new Error('reload loop: ' + navs + ' navigations');
    if (navs !== after) throw new Error('reloaded again after landing on v197');
    const banner = await page.evaluate(() => !!(window.__otSawBanner || document.getElementById('sw-update')));
    if (banner) throw new Error('banner on the reopened page');
    console.log('reopen landed on v197 in ' + navs + ' navigation(s), no banner');

    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
    state.mode = 'next';
    const before = navs;
    const upd = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const states = [];
      if (reg) reg.addEventListener('updatefound', () => {
        const iw = reg.installing;
        states.push('found:' + (iw && iw.state));
        if (iw) iw.addEventListener('statechange', () => states.push(iw.state));
      });
      const text = await fetch('/sw.js', { cache: 'no-store' }).then((r) => r.text());
      const cache = (text.match(/const CACHE='[^']+'/) || [])[0];
      let saw = 0;
      navigator.serviceWorker.addEventListener('controllerchange', () => { saw++; });
      if (reg) await reg.update();
      await new Promise((r) => setTimeout(r, 2500));
      return { states, cache, waiting: !!(reg && reg.waiting), saw, pageCtrl: window.__otCtrl || 0, pending: window.__otPending || 0, href: location.href, title: document.title, nscripts: document.scripts.length, body: (document.body && document.body.innerText || '').slice(0, 80) };
    });
    console.log('after update()', JSON.stringify(upd), 'controller', await controlling(page));
    await sleep(500);
    if (navs !== before) throw new Error('reloaded under an active session');
    console.log('mid-session update did not reload');

    await page.evaluate(() => {
      const d = document.createElement('div');
      d.className = 'mb open';
      d.id = 'fake-modal';
      document.body.appendChild(d);
    });
    await idleReturn(page);
    if (navs !== before) throw new Error('reloaded while a modal was open');
    console.log('30-minute return with a modal did not reload');

    await page.evaluate(() => document.getElementById('fake-modal').remove());
    await idleReturn(page);
    await waitCache(page, 'optrack-v198', 20000);
    if (navs !== before + 1) throw new Error('expected one reload after the idle return, got ' + (navs - before));
    await sleep(1200);
    if (navs !== before + 1) throw new Error('second reload after the idle return');
    const banner2 = await page.evaluate(() => !!(window.__otSawBanner || document.getElementById('sw-update')));
    if (banner2) throw new Error('banner after the idle reload');
    console.log('idle return reloaded once onto v198, no banner');
    console.log('UPGRADE PASS');
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }
}

async function idleReturn(page) {
  const info = await page.evaluate(() => {
    let hidden = false;
    let extra = 0;
    const real = Date.now.bind(Date);
    Date.now = () => real() + extra;
    try {
      Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return hidden; } });
    } catch (e) {
      return { define: String(e) };
    }
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    extra = 31 * 60 * 1000;
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    return { define: 'ok', hiddenNow: document.hidden, flag: sessionStorage.getItem('ot-sw-reload'), pending: window.__otPending || 0, ctrl: window.__otCtrl || 0, form: !!document.querySelector('.mb.open') };
  });
  console.log('idle', JSON.stringify(info));
  await sleep(1500);
}

main().catch((e) => { console.error(e); process.exit(1); });
