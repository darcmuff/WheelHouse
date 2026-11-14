import { chromium } from 'playwright';

async function run(url, waitMs = 20000) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const logs = [];
  const errors = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => errors.push(String(err)));
  page.on('requestfailed', (req) => errors.push(`REQ_FAIL ${req.url()} ${req.failure()?.errorText}`));

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(waitMs);

  const state = await page.evaluate(() => ({
    authResolved: !!window._authResolved,
    demo: document.documentElement.classList.contains('ot-demo'),
    loadingText: document.getElementById('loading-text')?.textContent?.slice(0, 80),
    authOverlay: getComputedStyle(document.getElementById('auth-overlay')).display,
    loadingOverlay: getComputedStyle(document.getElementById('loading-overlay')).display,
    wheels: document.querySelectorAll('.rotation-window.wc').length,
    pathname: location.pathname,
    otDemo: !!(window.OT_DEMO && window.OT_DEMO.active),
    wcBrand: typeof window.WcBrand,
  }));

  await browser.close();
  return { url, state, errors, logs: logs.slice(0, 40), logTail: logs.slice(-20) };
}

const base = process.env.BASE || 'https://dev--wheelhouse-tracker.netlify.app';
const paths = process.env.PATHS ? process.env.PATHS.split(',') : ['/app/', '/demo'];
for (const path of paths) {
  const r = await run(base + path);
  console.log(JSON.stringify(r, null, 2));
}