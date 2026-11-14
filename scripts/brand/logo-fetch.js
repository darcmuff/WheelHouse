'use strict';

const BRAND_API = 'https://api.logo.dev/v2/brands';
const API_REQ_PER_MIN = 100;
const CONCURRENT = 5;
const MS_PER_REQ = Math.ceil(60000 / API_REQ_PER_MIN);

/** Brand lookup (incl. logo download URL) — $0.05/request; same brand free 24h. @see https://www.logo.dev/pricing */
const PRICE_PER_BRAND_USD = 0.05;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @returns {Promise<{ png: Buffer, brandJson?: object }|null>}
 */
async function fetchLogoPng(ticker, secretKey, fetchImpl = fetch) {
  const sym = encodeURIComponent(String(ticker).toUpperCase());
  const url = `${BRAND_API}?ticker=${sym}`;
  const res = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(45000),
  });
  if (res.status === 404 || res.status === 202) return null;
  if (res.status === 402) throw new Error('Logo.dev API credits exhausted (402)');
  if (res.status === 429) {
    const err = new Error('rate limited');
    err.retryAfter = Number(res.headers.get('retry-after') || 60);
    throw err;
  }
  if (!res.ok) throw new Error(`Brand API HTTP ${res.status}`);
  const j = await res.json();
  const logoUrl =
    j &&
    (j.logo && (j.logo.url || j.logo.href)) ||
    (j.logos && j.logos[0] && j.logos[0].url) ||
  null;
  if (!logoUrl) return null;
  const img = await fetchImpl(logoUrl, { signal: AbortSignal.timeout(45000) });
  if (!img.ok) return null;
  const png = Buffer.from(await img.arrayBuffer());
  return { png, brandJson: j };
}

class RateLimiter {
  constructor({ intervalMs = MS_PER_REQ, concurrent = CONCURRENT } = {}) {
    this.intervalMs = intervalMs;
    this.concurrent = concurrent;
    this.queue = [];
    this.active = 0;
    this.lastStart = 0;
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._pump();
    });
  }

  async _pump() {
    while (this.active < this.concurrent && this.queue.length) {
      const now = Date.now();
      const wait = Math.max(0, this.lastStart + this.intervalMs - now);
      if (wait) await sleep(wait);
      const job = this.queue.shift();
      this.active++;
      this.lastStart = Date.now();
      job
        .fn()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active--;
          this._pump();
        });
    }
  }
}

async function mapWithBackoff(items, worker, { retries = 4 } = {}) {
  const lim = new RateLimiter();
  const out = [];
  for (const item of items) {
    const result = await lim.run(async () => {
      let lastErr;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await worker(item);
        } catch (e) {
          lastErr = e;
          const ra = e.retryAfter ? e.retryAfter * 1000 : 2 ** attempt * 1000;
          await sleep(ra);
        }
      }
      throw lastErr;
    });
    out.push(result);
  }
  return out;
}

module.exports = {
  fetchLogoPng,
  mapWithBackoff,
  PRICE_PER_BRAND_USD,
  PRICE_PER_LOGO_USD: PRICE_PER_BRAND_USD,
  API_REQ_PER_MIN,
};