'use strict';

const { fetchLogoPng } = require('../../netlify/lib/logo-dev');

const API_REQ_PER_MIN = 45;
const CONCURRENT = 1;
const MS_PER_REQ = Math.ceil(60000 / API_REQ_PER_MIN);

/** Brand lookup fallback in logo-dev: Logo route 2 credits, Brand 5. @see https://www.logo.dev/docs/platform/credits */
const PRICE_PER_BRAND_USD = 0.02;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  sleep,
  PRICE_PER_BRAND_USD,
  PRICE_PER_LOGO_USD: PRICE_PER_BRAND_USD,
  API_REQ_PER_MIN,
};