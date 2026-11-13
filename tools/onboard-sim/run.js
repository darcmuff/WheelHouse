#!/usr/bin/env node
// New-visitor onboarding simulator.
// Default: serve this repo's app/ (there is no dev-deploy URL in the repo).
//   npm run sim
//   npm run sim -- --url https://optrack.app
//   npm run sim -- --runs 2
//   npm run sim -- --url https://optrack.app --diagnose
// A fresh browser context, no cookies. Sets localStorage ot-sim=1 before any
// page script so GoatCounter is not loaded and events are not counted.
const fs = require('fs');
const path = require('path');
const http = require('http');

const APP = path.resolve(__dirname, '..', '..', 'app');
const UI = 5000;
const NET = 12000;
const PASTE = [
  'Symbol: SOFI',
  'SOFI $15 Put Dec 18, 2026',
  'Sell to Open',
  'Filled Nov 2, 2026',
  '1 contracts at $0.40',
  'Regulatory fees $0.04'
].join('\n');

function args() {
  const a = process.argv.slice(2);
  const o = { url: '', runs: 1, diagnose: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--url') o.url = a[++i] || '';
    else if (a[i] === '--runs') o.runs = Math.max(1, parseInt(a[++i], 10) || 1);
    else if (a[i] === '--diagnose') o.diagnose = true;
  }
  return o;
}

function startServer() {
  const routes = {
    '/': 'landing.html', '/start': 'start.html', '/start/': 'start.html',
    '/demo': 'index.html', '/demo/': 'index.html', '/app': 'index.html', '/app/': 'index.html'
  };
  const types = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json'
  };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const u = decodeURIComponent((req.url || '/').split('?')[0]);
      let rel = routes[u];
      if (!rel) rel = u.startsWith('/app/') ? 'index.html' : u.replace(/^\/+/, '');
      const abs = path.resolve(APP, rel);
      if (abs !== APP && !abs.startsWith(APP + path.sep)) { res.writeHead(403); res.end('no'); return; }
      fs.readFile(abs, (err, buf) => {
        if (err) { res.writeHead(404); res.end('not found'); return; }
        res.writeHead(200, { 'content-type': types[path.extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(buf);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: 'http://127.0.0.1:' + server.address().port }));
  });
}

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (fs.existsSync('/usr/local/bin/google-chrome')) return '/usr/local/bin/google-chrome';
  return undefined;
}

function account() {
  const n = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { email: 'ot.sim.' + n + '@optrack.app', password: 'Sim-' + n + '-Aa' };
}

function benign(text, url) {
  if (/\/\.netlify\/functions\//.test(url) || /favicon\.ico/.test(url)) return true;
  if (/Failed to load resource/.test(text) && (!url || /\/\.netlify\/functions\//.test(url) || /favicon/.test(url))) return true;
  return false;
}

function watch(page) {
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const url = (msg.location() && msg.location().url) || '';
    const text = msg.text();
    if (benign(text, url)) return;
    errors.push(text + (url ? ' @ ' + url : ''));
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + (err && err.message || err)));
  page.on('dialog', (d) => d.accept().catch(() => {}));
  return errors;
}

async function fresh(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'en-GB' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('ot-sim', '1'); } catch (e) {}
    function arm(){
      if (!document.documentElement || document.documentElement.__otBanner) return;
      document.documentElement.__otBanner = 1;
      new MutationObserver(function(){
        var t = document.body ? document.body.innerText : '';
        if (document.getElementById('sw-update') || /New version — Refresh/.test(t)) window.__otSawBanner = 1;
      }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', arm);
    else arm();
  });
  return ctx;
}

async function step(bag, name, budget, fn) {
  const t0 = Date.now();
  let error = '';
  try { await fn(); }
  catch (e) { error = e && e.message ? e.message : String(e); }
  const ms = Date.now() - t0;
  if (!error && ms > budget) error = 'took ' + ms + 'ms (limit ' + budget + 'ms)';
  bag.steps.push({ name, ms, ok: !error, error });
  if (error) {
    bag.ok = false;
    const err = new Error(name + ': ' + error);
    err.bag = bag;
    throw err;
  }
}

function checkErrors(errors) {
  if (errors.length) throw new Error('console error: ' + errors.slice(0, 3).join(' | '));
}
async function noBanner(page) {
  const saw = await page.evaluate(() => !!(window.__otSawBanner || document.getElementById('sw-update') || /New version — Refresh/.test(document.body ? document.body.innerText : '')));
  if (saw) throw new Error('update banner appeared');
}

async function clickSel(page, selector) {
  const el = page.locator(selector).first();
  await el.waitFor({ state: 'visible', timeout: UI });
  const box = await el.boundingBox();
  if (!box || box.width < 8 || box.height < 8) throw new Error('dead control ' + selector);
  await el.click({ timeout: UI });
}

async function authMode(page) {
  await page.waitForSelector('#auth-submit-btn', { timeout: NET });
  const shown = await page.locator('#auth-overlay').evaluate((el) => getComputedStyle(el).display !== 'none');
  if (!shown) return 'hidden';
  const text = (await page.locator('#auth-submit-btn').innerText()).replace(/\s+/g, ' ').trim();
  if (/create account/i.test(text)) return 'signup';
  if (/sign in/i.test(text)) return 'signin';
  return text || 'unknown';
}

async function describe(page) {
  return page.evaluate(() => {
    const btn = document.getElementById('auth-submit-btn');
    const h = document.querySelector('h1');
    return {
      url: location.href,
      h1: h ? h.textContent.trim().slice(0, 80) : '',
      auth: btn ? btn.textContent.trim() : '',
      overlay: (() => { const o = document.getElementById('auth-overlay'); return o ? getComputedStyle(o).display : 'missing'; })()
    };
  }).catch(() => ({ url: page.url(), h1: '', auth: '', overlay: '' }));
}

async function main() {
  const opt = args();
  let origin = (opt.url || '').replace(/\/$/, '');
  let server = null;
  let served = 'given url';
  if (!origin) {
    const s = await startServer();
    server = s.server;
    origin = s.origin;
    served = 'local server of app/ (no dev deploy URL in the repo)';
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = path.join(__dirname, 'out', stamp);
  fs.mkdirSync(outDir, { recursive: true });
  const report = { origin, served, diagnose: opt.diagnose, started: new Date().toISOString(), passes: [], ok: true };
  const { chromium } = require('playwright');
  const browser = await chromium.launch({
    headless: true,
    executablePath: chromePath(),
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  let shotN = 0;
  const shot = async (page, name) => {
    shotN += 1;
    const file = path.join(outDir, String(shotN).padStart(2, '0') + '-' + name + '.png');
    await page.screenshot({ path: file, animations: 'disabled' });
    return path.basename(file);
  };
  const shotFull = async (page, name) => {
    shotN += 1;
    const file = path.join(outDir, String(shotN).padStart(2, '0') + '-' + name + '.png');
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
    return path.basename(file);
  };

  const passes = [];
  for (let i = 0; i < opt.runs; i++) {
    passes.push({ w: 1280, h: 800, tag: '1280-run' + (i + 1) });
    if (i === 0) passes.push({ w: 1440, h: 900, tag: '1440-run1' });
  }

  try {
    for (const pass of passes) {
      const rec = { tag: pass.tag, width: pass.w, height: pass.h, paths: {}, ok: true };
      report.passes.push(rec);
      try {
        rec.paths.landing = await pathLanding(browser, pass, origin, shot, shotFull);
        rec.paths.demo = await pathDemo(browser, pass, origin, shot);
        rec.paths.goPro = await pathGoPro(browser, pass, origin, shot);
        if (opt.diagnose) {
          rec.paths.startFree = await pathEntryOnly(browser, pass, origin, '#start-free', 'signup', shot);
          rec.paths.signIn = await pathEntryOnly(browser, pass, origin, '#signin-top', 'signin', shot);
        } else {
          const made = await pathStartFree(browser, pass, origin, shot);
          rec.paths.startFree = made.report;
          const left = made.account && made.report.ok ? made.account : null;
          rec.paths.signIn = await pathSignIn(browser, pass, origin, left, shot);
        }
      } catch (e) {
        rec.ok = false;
        rec.error = e.message || String(e);
      }
      for (const k of Object.keys(rec.paths)) if (rec.paths[k] && rec.paths[k].ok === false) rec.ok = false;
      if (!rec.ok) report.ok = false;
    }
  } finally {
    await browser.close().catch(() => {});
    if (server) server.close();
  }

  report.finished = new Date().toISOString();
  const md = render(report);
  fs.writeFileSync(path.join(outDir, 'report.md'), md);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(md);
  console.log('OUT ' + outDir);
  process.exit(report.ok ? 0 : 1);
}

async function pathLanding(browser, pass, origin, shot, shotFull) {
  const bag = { ok: true, steps: [], shots: [] };
  const ctx = await fresh(browser, pass.w, pass.h);
  const page = await ctx.newPage();
  const errors = watch(page);
  try {
    await step(bag, 'open landing /', UI, async () => {
      const res = await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: UI });
      if (!res || res.status() >= 400) throw new Error('landing status ' + (res && res.status()));
      await page.waitForSelector('#ways-in', { timeout: UI });
    });
    await step(bag, 'ways in are above the fold', UI, async () => {
      const info = await page.evaluate(() => {
        const fold = window.innerHeight;
        const ids = ['start-free', 'try-demo', 'signin-top', 'go-pro'];
        const out = {};
        ids.forEach((id) => {
          const el = document.getElementById(id);
          if (!el) { out[id] = { missing: true }; return; }
          const r = el.getBoundingClientRect();
          out[id] = { top: Math.round(r.top), bottom: Math.round(r.bottom), above: r.bottom <= fold && r.top >= 0 && r.height > 8, text: el.innerText.replace(/\s+/g, ' ').trim(), href: el.getAttribute('href') };
        });
        return { fold, scroll: window.scrollY, out };
      });
      bag.fold = info;
      const bad = Object.entries(info.out).filter(([, v]) => !v.above).map(([k, v]) => k + (v.missing ? ' missing' : ' bottom ' + v.bottom));
      if (info.scroll !== 0 || bad.length) throw new Error('not above the fold: ' + (bad.join(', ') || 'page was scrolled'));
    });
    bag.shots.push(await shot(page, 'landing-' + pass.tag));
    bag.shots.push(await shotFull(page, 'landing-full-' + pass.tag));
    await noBanner(page);
    checkErrors(errors);
  } catch (e) {
    bag.ok = false;
    bag.error = e.message;
    bag.shots.push(await shot(page, 'FAIL-landing-' + pass.tag).catch(() => ''));
  }
  await ctx.close().catch(() => {});
  return bag;
}

async function pathDemo(browser, pass, origin, shot) {
  const bag = { ok: true, steps: [], clicksToSignup: 'none — demo needs no account', clicks: 0, shots: [] };
  const ctx = await fresh(browser, pass.w, pass.h);
  const page = await ctx.newPage();
  const errors = watch(page);
  try {
    await step(bag, 'open landing', UI, async () => { await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: UI }); });
    await step(bag, 'click Try the demo', UI, async () => {
      await clickSel(page, '#try-demo');
      bag.clicks = 1;
      await page.waitForSelector('#demo-banner', { timeout: UI });
    });
    await step(bag, 'demo is open with no sign-in', UI, async () => {
      const state = await page.evaluate(() => {
        const o = document.getElementById('auth-overlay');
        const b = document.getElementById('demo-banner');
        return { demo: !!(b && b.offsetParent !== null), auth: o ? getComputedStyle(o).display : 'missing', text: (b && b.innerText || '').slice(0, 80) };
      });
      if (!state.demo) throw new Error('demo banner not visible');
      if (state.auth !== 'none') throw new Error('auth overlay is showing on the demo (' + state.auth + ')');
      bag.detail = state.text;
    });
    bag.shots.push(await shot(page, 'demo-' + pass.tag));
    await noBanner(page);
    checkErrors(errors);
  } catch (e) {
    bag.ok = false;
    bag.error = e.message;
    bag.where = await describe(page);
    bag.shots.push(await shot(page, 'FAIL-demo-' + pass.tag).catch(() => ''));
  }
  await ctx.close().catch(() => {});
  return bag;
}

async function pathGoPro(browser, pass, origin, shot) {
  const bag = { ok: true, steps: [], clicks: 0, clicksToSignup: null, shots: [] };
  const ctx = await fresh(browser, pass.w, pass.h);
  const page = await ctx.newPage();
  const errors = watch(page);
  try {
    await step(bag, 'open landing', UI, async () => { await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: UI }); });
    await step(bag, 'click Go Pro', UI, async () => {
      const el = page.locator('#go-pro');
      if (await el.count() === 0) throw new Error('Go Pro is not on the landing page');
      await clickSel(page, '#go-pro');
      bag.clicks = 1;
      await page.waitForURL(/\/app\/?/, { timeout: UI });
    });
    await step(bag, 'Create Account is showing, checkout remembered', NET, async () => {
      const mode = await authMode(page);
      const checkout = await page.evaluate(() => { try { return sessionStorage.getItem('ot-checkout'); } catch (e) { return null; } });
      bag.clicksToSignup = bag.clicks;
      bag.mode = mode;
      bag.checkout = checkout;
      if (mode !== 'signup') throw new Error('Go Pro opened "' + mode + '" at ' + page.url() + ' (checkout=' + checkout + ')');
      if (checkout !== 'monthly') throw new Error('checkout was ' + checkout + ', expected monthly');
    });
    bag.shots.push(await shot(page, 'gopro-signup-' + pass.tag));
    await noBanner(page);
    checkErrors(errors);
  } catch (e) {
    bag.ok = false;
    bag.error = e.message;
    bag.clicksToSignup = bag.clicksToSignup == null ? 'did not reach Create Account' : bag.clicksToSignup;
    bag.where = await describe(page);
    bag.shots.push(await shot(page, 'FAIL-gopro-' + pass.tag).catch(() => ''));
  }
  await ctx.close().catch(() => {});
  return bag;
}

async function pathEntryOnly(browser, pass, origin, sel, want, shot) {
  const bag = { ok: true, steps: [], clicks: 0, clicksToSignup: null, shots: [] };
  const ctx = await fresh(browser, pass.w, pass.h);
  const page = await ctx.newPage();
  const errors = watch(page);
  try {
    await step(bag, 'open landing', UI, async () => { await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: UI }); });
    await step(bag, 'click ' + sel, UI, async () => {
      await clickSel(page, sel);
      bag.clicks = 1;
      await page.waitForLoadState('domcontentloaded', { timeout: UI });
      bag.landed = page.url();
    });
    await step(bag, 'auth tab is ' + want, NET, async () => {
      let path = '';
      try { path = new URL(page.url()).pathname; } catch (e) {}
      if (!/^\/app\/?$/.test(path)) throw new Error(sel + ' left the visitor on ' + page.url() + ' instead of the account screen');
      const mode = await authMode(page);
      bag.mode = mode;
      bag.clicksToSignup = want === 'signup' ? bag.clicks : 'not a sign-up — landed on ' + mode + ' in ' + bag.clicks + ' click';
      if (mode !== want) throw new Error(sel + ' opened "' + mode + '" at ' + page.url());
    });
    bag.shots.push(await shot(page, 'entry-' + sel.replace('#', '') + '-' + pass.tag));
    await noBanner(page);
    checkErrors(errors);
  } catch (e) {
    bag.ok = false;
    bag.error = e.message;
    if (bag.clicksToSignup == null) bag.clicksToSignup = 'did not reach the auth screen';
    bag.where = await describe(page);
    bag.shots.push(await shot(page, 'FAIL-entry-' + sel.replace('#', '') + '-' + pass.tag).catch(() => ''));
  }
  await ctx.close().catch(() => {});
  return bag;
}

async function pathStartFree(browser, pass, origin, shot) {
  const bag = { ok: true, steps: [], clicks: 0, clicksToSignup: null, shots: [] };
  const acc = account();
  const ctx = await fresh(browser, pass.w, pass.h);
  const page = await ctx.newPage();
  const errors = watch(page);
  let created = false;
  try {
    await step(bag, 'open landing', UI, async () => { await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: UI }); });
    await step(bag, 'click Start free', UI, async () => {
      await clickSel(page, '#start-free');
      bag.clicks = 1;
      await page.waitForURL(/\/app\/?/, { timeout: UI });
    });
    await step(bag, 'Create Account is showing', NET, async () => {
      const mode = await authMode(page);
      bag.mode = mode;
      bag.clicksToSignup = bag.clicks;
      if (mode !== 'signup') throw new Error('Start free opened "' + mode + '" at ' + page.url());
      const lead = await page.locator('#auth-lead').innerText();
      if (!/no card/i.test(lead)) throw new Error('signup lead missing');
    });
    bag.shots.push(await shot(page, 'signup-' + pass.tag));
    await step(bag, 'submit new account', NET, async () => {
      await page.fill('#auth-email', acc.email);
      await page.fill('#auth-password', acc.password);
      await clickSel(page, '#auth-submit-btn');
      await page.waitForFunction(() => {
        const o = document.getElementById('onboard-overlay');
        const l = document.getElementById('loading-overlay');
        const loading = l && getComputedStyle(l).display !== 'none';
        return o && getComputedStyle(o).display === 'flex' && !loading;
      }, null, { timeout: NET });
      created = true;
    });
    bag.email = acc.email;
    bag.shots.push(await shot(page, 'empty-account-' + pass.tag));
    await step(bag, 'name the first ticker', NET, async () => {
      await page.fill('#onboard-ticker', 'SOFI');
      await clickSel(page, '#onboard-submit-btn');
      await page.waitForFunction(() => {
        const o = document.getElementById('onboard-overlay');
        const gone = !o || getComputedStyle(o).display === 'none';
        return gone && document.body.innerText.includes('SOFI');
      }, null, { timeout: NET });
    });
    await step(bag, 'empty wheel offers a first trade', UI, async () => {
      const hint = await page.locator('text=No trades yet').first().innerText({ timeout: UI });
      if (!/Add your first one/i.test(hint)) throw new Error('first-trade hint missing: ' + hint);
    });
    bag.shots.push(await shot(page, 'empty-wheel-' + pass.tag));
    await step(bag, 'add a trade by hand', NET, async () => {
      await clickSel(page, '.lc-acts button');
      await clickSel(page, '#tab-manual');
      await page.fill('#pm-strike', '14');
      await page.fill('#pm-premium', '0.25');
      await page.fill('#pm-shares', '100');
      await page.fill('#pm-expiry', '2026-12-18');
      await clickSel(page, '#paste-panel-manual button.btn-primary');
      await page.waitForFunction(() => document.body.innerText.includes('$14'), null, { timeout: NET });
    });
    bag.shots.push(await shot(page, 'first-trade-' + pass.tag));
    await step(bag, 'add a trade by SmartScan paste', NET, async () => {
      await clickSel(page, '.lc-acts button');
      await page.fill('#paste-raw', PASTE);
      await clickSel(page, '#paste-panel-smartscan button.btn-primary');
      await page.waitForSelector('#paste-step2', { state: 'visible', timeout: UI });
      await clickSel(page, '#paste-step2 button.btn-primary');
      await page.waitForFunction(() => document.body.innerText.includes('$15') && document.body.innerText.includes('$14'), null, { timeout: NET });
    });
    bag.shots.push(await shot(page, 'smartscan-trade-' + pass.tag));
    await step(bag, 'not stuck on Please wait', UI, async () => {
      const state = await page.evaluate(() => {
        const o = document.getElementById('auth-overlay');
        const btn = document.getElementById('auth-submit-btn');
        return { overlay: o ? getComputedStyle(o).display : 'missing', label: btn ? btn.textContent.replace(/\s+/g, ' ').trim() : '', disabled: !!(btn && btn.disabled) };
      });
      if (state.overlay !== 'none') throw new Error('auth overlay still up ' + JSON.stringify(state));
      if (state.disabled || /please wait/i.test(state.label)) throw new Error('submit button left waiting ' + JSON.stringify(state));
    });
    await noBanner(page);
    checkErrors(errors);
  } catch (e) {
    bag.ok = false;
    bag.error = e.message;
    if (bag.clicksToSignup == null) bag.clicksToSignup = 'did not reach Create Account';
    bag.where = await describe(page);
    bag.shots.push(await shot(page, 'FAIL-signup-' + pass.tag).catch(() => ''));
  }
  if (created && !bag.ok) {
    try { await deleteAccount(page, acc.password); bag.deleted = true; }
    catch (e) { bag.error = (bag.error ? bag.error + ' | ' : '') + 'delete failed: ' + (e.message || e); }
  }
  await ctx.close().catch(() => {});
  return { report: bag, account: bag.ok ? acc : null };
}

async function pathSignIn(browser, pass, origin, acc, shot) {
  const bag = { ok: true, steps: [], clicks: 0, clicksToSignup: 'not a sign-up path', shots: [], deleted: false };
  if (!acc) {
    bag.provisioned = true;
    const made = await pathStartFree(browser, pass, origin, shot);
    bag.shots.push.apply(bag.shots, made.report.shots || []);
    if (!made.account || !made.report.ok) {
      bag.ok = false;
      bag.error = 'start-free left no account, and a fresh sign-in account could not be created' + (made.report.error ? ': ' + made.report.error : '');
      return bag;
    }
    acc = made.account;
  }
  bag.email = acc.email;
  const ctx = await fresh(browser, pass.w, pass.h);
  const page = await ctx.newPage();
  const errors = watch(page);
  try {
    await step(bag, 'open landing in a fresh browser', UI, async () => {
      await page.goto(origin + '/', { waitUntil: 'domcontentloaded', timeout: UI });
      await page.waitForSelector('#signin-top', { timeout: UI });
    });
    await step(bag, 'click Sign in', UI, async () => {
      await clickSel(page, '#signin-top');
      bag.clicks = 1;
      await page.waitForURL(/\/app\/?/, { timeout: UI });
    });
    await step(bag, 'Sign In tab is showing', NET, async () => {
      const mode = await authMode(page);
      bag.mode = mode;
      bag.clicksToSignIn = bag.clicks;
      if (mode !== 'signin') throw new Error('Sign in opened "' + mode + '" at ' + page.url());
    });
    bag.shots.push(await shot(page, 'signin-' + pass.tag));
    await step(bag, 'sign in as the existing account', NET, async () => {
      await page.fill('#auth-email', acc.email);
      await page.fill('#auth-password', acc.password);
      await clickSel(page, '#auth-submit-btn');
      await page.waitForFunction(() => {
        const l = document.getElementById('loading-overlay');
        const loading = l && getComputedStyle(l).display !== 'none' && !l.classList.contains('fade-out');
        return !loading && document.body.innerText.includes('SOFI') && document.body.innerText.includes('$14');
      }, null, { timeout: NET });
    });
    bag.shots.push(await shot(page, 'signed-in-' + pass.tag));
    await noBanner(page);
    checkErrors(errors);
    await step(bag, 'delete the account', NET, async () => { await deleteAccount(page, acc.password); });
    bag.deleted = true;
    await step(bag, 'deleted account cannot sign in', NET, async () => { await signInRejected(page, acc); });
    bag.deletedConfirmed = true;
  } catch (e) {
    bag.ok = false;
    bag.error = e.message;
    bag.where = await describe(page);
    bag.shots.push(await shot(page, 'FAIL-signin-' + pass.tag).catch(() => ''));
    if (!bag.deleted) {
      try { await deleteAccount(page, acc.password); bag.deleted = true; } catch (err) { bag.error += ' | delete failed: ' + (err.message || err); }
    }
  }
  await ctx.close().catch(() => {});
  return bag;
}

async function deleteAccount(page, password) {
  const t0 = Date.now();
  await page.locator('[aria-label="Settings"]').click({ timeout: UI });
  await page.locator('#settings-delete').click({ timeout: UI });
  await page.fill('#delete-confirm', 'DELETE');
  await page.fill('#delete-password', password);
  await page.locator('#delete-go').click({ timeout: UI });
  await page.waitForFunction(() => {
    const o = document.getElementById('auth-overlay');
    return o && getComputedStyle(o).display !== 'none';
  }, null, { timeout: NET });
  if (Date.now() - t0 > NET) throw new Error('delete took ' + (Date.now() - t0) + 'ms');
}

async function signInRejected(page, acc) {
  await page.fill('#auth-email', acc.email);
  await page.fill('#auth-password', acc.password);
  const mode = await authMode(page);
  if (mode !== 'signin') await page.locator('#tab-signin').click();
  await page.locator('#auth-submit-btn').click();
  await page.waitForFunction(() => {
    const el = document.getElementById('auth-error');
    return el && getComputedStyle(el).display !== 'none' && /incorrect|wrong|invalid/i.test(el.textContent || '');
  }, null, { timeout: NET });
  return true;
}

function render(report) {
  const lines = [];
  lines.push('# New-visitor simulator');
  lines.push('');
  lines.push('- Origin: ' + report.origin);
  lines.push('- How it was served: ' + report.served);
  lines.push('- Diagnose only: ' + (report.diagnose ? 'yes' : 'no'));
  lines.push('- Result: ' + (report.ok ? 'PASS' : 'FAIL'));
  lines.push('');
  for (const p of report.passes) {
    lines.push('## ' + p.tag + ' (' + p.width + 'x' + p.height + ') — ' + (p.ok ? 'PASS' : 'FAIL'));
    if (p.error) lines.push(p.error);
    for (const [name, bag] of Object.entries(p.paths || {})) {
      lines.push('');
      lines.push('### ' + name + ' — ' + (bag.ok ? 'PASS' : 'FAIL'));
      if (bag.clicksToSignup != null) lines.push('Clicks to sign-up: ' + bag.clicksToSignup);
      if (bag.clicksToSignIn != null) lines.push('Clicks to sign-in: ' + bag.clicksToSignIn);
      if (bag.email) {
        const tail = bag.deleted === true
          ? ' (deleted' + (bag.deletedConfirmed ? ', sign-in rejected afterwards' : '') + ')'
          : bag.deleted === false ? ' (NOT deleted)' : ' (removed on the sign-in path of this run)';
        lines.push('Account: ' + bag.email + tail);
      }
      if (bag.error) lines.push('Error: ' + bag.error);
      if (bag.where) lines.push('Page: ' + JSON.stringify(bag.where));
      if (bag.fold) lines.push('Above the fold: ' + Object.entries(bag.fold.out).map(([k, v]) => k + ' "' + v.text + '" → ' + v.href).join('; '));
      for (const s of bag.steps || []) lines.push('- ' + (s.ok ? 'ok' : 'FAIL') + ' ' + s.ms + 'ms  ' + s.name + (s.error ? ' — ' + s.error : ''));
      if (bag.shots && bag.shots.length) lines.push('Shots: ' + bag.shots.filter(Boolean).join(', '));
    }
    lines.push('');
  }
  return lines.join('\n');
}

main().catch((e) => { console.error(e); process.exit(1); });
