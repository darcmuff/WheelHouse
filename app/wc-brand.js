// Wheel card brand lookup: shard JSON → Netlify function → hash-hue fallback.
(function (root, factory) {
  const api = factory();
  root.WcBrand = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FALLBACK_HUES = [262, 285, 305, 330, 15, 32, 150, 170, 195, 215, 235, 248];
  const CACHE = new Map();
  const SHARD_CACHE = new Map();
  let INDEX = null;
  let INDEX_PROMISE = null;
  const HAND_POS = {
    AMD: [330, 325, -70, -20, -15, '#fff', 0.2],
    KO: [820, 258, -250, 78, -14, '#fff', 0.16],
    NVDA: [600, 399, -150, -40, -15, '#76B900', 0.38],
    SOFI: [660, 193, -150, -4, -14, '#fff', 0.17],
  };
  const LEGACY_BG = {
    AMD: 'radial-gradient(60% 120% at 92% 18%,rgba(237,28,36,.55) 0%,rgba(237,28,36,0) 70%),linear-gradient(104deg,#060607 0%,#121012 34%,#3a0a0e 58%,#86101a 82%,#b3121c 100%)',
    KO: 'radial-gradient(55% 110% at 94% 20%,rgba(255,40,40,.45) 0%,rgba(255,40,40,0) 70%),linear-gradient(104deg,#3d0003 0%,#64000a 36%,#98000b 66%,#c4000a 100%)',
    NVDA: 'radial-gradient(55% 120% at 94% 16%,rgba(118,185,0,.42) 0%,rgba(118,185,0,0) 70%),linear-gradient(104deg,#030403 0%,#0a0f06 36%,#1b2c08 62%,#335207 86%,#3f6606 100%)',
    SOFI: 'radial-gradient(60% 120% at 96% 90%,rgba(0,169,206,.48) 0%,rgba(0,169,206,0) 68%),linear-gradient(104deg,#041327 0%,#08234a 36%,#0a3a6a 64%,#0a5280 88%,#0a5a88 100%)',
  };
  const WC_BRAND = {
    TSLA: ['#0b0b0c', '#1c0b0c', '#5a0d10', '#a3141a', '232,33,39'],
    AAPL: ['#0b0c0e', '#1c1e22', '#34373d', '#565b64', '210,214,222'],
    MSFT: ['#04121f', '#082a4a', '#0b4c86', '#0f6cbd', '0,164,239'],
    AMZN: ['#0b1118', '#131a22', '#232f3e', '#3a4a5e', '255,153,0'],
    GOOGL: ['#07102a', '#0f2257', '#1a3d8f', '#2a5bd7', '66,133,244'],
    GOOG: ['#07102a', '#0f2257', '#1a3d8f', '#2a5bd7', '66,133,244'],
    META: ['#050f24', '#0a2150', '#0b3d8c', '#0a5bc4', '6,104,225'],
    PLTR: ['#050505', '#111214', '#24262a', '#3b3e44', '255,255,255'],
    HOOD: ['#020a03', '#062010', '#0c3d14', '#13601c', '204,255,0'],
    F: ['#020a1a', '#04173a', '#062a66', '#0a3f8f', '40,110,220'],
    INTC: ['#03101f', '#062546', '#0a427a', '#0b5aa3', '0,199,253'],
    BAC: ['#02081c', '#061a4a', '#0b2a6e', '#163a8a', '227,24,55'],
    T: ['#03141f', '#062f48', '#0a5578', '#0b77a6', '0,168,224'],
    SPY: ['#041513', '#0a2d29', '#0f4a43', '#156b60', '50,200,170'],
    QQQ: ['#060d22', '#101f4f', '#1e3584', '#3550b8', '120,140,255'],
    SPCX: ['#020308', '#0a0e1c', '#16203d', '#27365e', '120,160,255'],
    SPACEX: ['#020308', '#0a0e1c', '#16203d', '#27365e', '120,160,255'],
    _: ['#0d0f1a', '#1a1d33', '#2b2f55', '#3f4478', '120,130,255'],
  };

  function fnv1a(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h;
  }

  function key(tk) {
    return String(tk || '').trim().toUpperCase();
  }

  function shardFor(ticker) {
    const c = (ticker[0] || '0').toLowerCase();
    return /[a-z]/.test(c) ? c : '0-9';
  }

  function legacyStops(tk) {
    const k = key(tk);
    return WC_BRAND[k] || WC_BRAND._;
  }

  function hashBg(tk) {
    const hue = FALLBACK_HUES[fnv1a(key(tk)) % FALLBACK_HUES.length];
    const from = oklchToHex(0.19, 0.07, hue);
    const to = oklchToHex(0.48, 0.18, hue);
    const glow = oklchToRgb(0.55, 0.14, hue).join(',');
    return `radial-gradient(55% 120% at 94% 18%,rgba(${glow},.42) 0%,rgba(${glow},0) 70%),linear-gradient(104deg,${from} 0%,${to} 100%)`;
  }

  function oklchToRgb(L, C, h) {
    const hr = (h * Math.PI) / 180;
    const a = C * Math.cos(hr);
    const b = C * Math.sin(hr);
    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.291485548 * b;
    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return [linToSrgb(r), linToSrgb(g), linToSrgb(bb)];
  }

  function linToSrgb(c) {
    c = Math.min(1, Math.max(0, c));
    return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
  }

  function oklchToHex(L, C, h) {
    const [r, g, b] = oklchToRgb(L, C, h);
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
  }

  function entryBg(entry, tk) {
    if (entry && entry.legacyBg) return entry.legacyBg;
    if (LEGACY_BG[key(tk)]) return LEGACY_BG[key(tk)];
    if (entry && entry.g) {
      const m = String(entry.g.gl || '').match(/rgba?\((\d+),(\d+),(\d+)/);
      const gr = m ? `${m[1]},${m[2]},${m[3]}` : '120,130,255';
      return `radial-gradient(55% 120% at 94% 18%,rgba(${gr},.42) 0%,rgba(${gr},0) 70%),linear-gradient(104deg,${entry.g.f} 0%,${entry.g.t} 100%)`;
    }
    const b = legacyStops(tk);
    return `radial-gradient(55% 120% at 94% 18%,rgba(${b[4]},.42) 0%,rgba(${b[4]},0) 70%),linear-gradient(104deg,${b[0]} 0%,${b[1]} 36%,${b[2]} 66%,${b[3]} 100%)`;
  }

  function bgSync(tk) {
    const k = key(tk);
    const hit = CACHE.get(k);
    if (hit) return entryBg(hit, k);
    return hashBg(k);
  }

  function handMarkSvg(tk) {
    const marks = typeof WC_MARKS !== 'undefined' ? WC_MARKS : {};
    return marks[key(tk)] || null;
  }

  function artHtml(tk) {
    const k = key(tk);
    const hit = CACHE.get(k);
    const pos = HAND_POS[k];
    const svg = handMarkSvg(k);
    if (svg && pos && (!hit || hit.keepHandMark)) {
      const u = "url('data:image/svg+xml," + encodeURIComponent(svg).replace(/'/g, '%27') + "')";
      return `<div class="wc-art" aria-hidden="true"><div class="wc-lgw" style="--w:${pos[0]};--h:${pos[1]};--x:${pos[2]};--y:${pos[3]};--r:${pos[4]}deg"><i style="--m:${u};background:${pos[5]};opacity:${pos[6]}"></i></div></div>`;
    }
    if (hit && hit.m && !hit.fb && !hit.keepHandMark) {
      const op = hit.wo != null ? hit.wo : 0.16;
      const asp = hit.a || 1;
      const src = hit.maskUrl ? hit.maskUrl : `brand/${k}.png`;
      return `<div class="wc-art" aria-hidden="true"><div class="wc-lgw wc-png" style="--w:${Math.round(420 * asp)};--h:420;--x:-120;--y:40;--r:-14deg"><i style="--m:url('${src}');background:#fff;opacity:${op}"></i></div></div>`;
    }
    return `<div class="wc-art" aria-hidden="true"><span class="wc-tk">${escHtml(k.slice(0, 6) || '?')}</span></div>`;
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function accent(tk) {
    const k = key(tk);
    return { AMD: '#b3121c', KO: '#c4000a', NVDA: '#76B900', SOFI: '#0a5a88' }[k] || legacyStops(k)[3];
  }

  function loadIndex() {
    if (INDEX) return Promise.resolve(INDEX);
    if (INDEX_PROMISE) return INDEX_PROMISE;
    INDEX_PROMISE = fetch('brand/index.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : { shards: [] }))
      .then((j) => {
        INDEX = j;
        return j;
      })
      .catch(() => {
        INDEX = { shards: [] };
        return INDEX;
      });
    return INDEX_PROMISE;
  }

  function loadShard(name) {
    if (SHARD_CACHE.has(name)) return SHARD_CACHE.get(name);
    const p = fetch(`brand/shards/${name}.json`, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}));
    SHARD_CACHE.set(name, p);
    return p;
  }

  function normalizeRemote(j) {
    if (!j) return null;
    return {
      g: j.g || (j.gradient ? { f: j.gradient.frm, t: j.gradient.to, gl: j.gradient.glow, k: j.gradient.kind } : null),
      fb: !!j.fb || !!j.fallback,
      etf: !!j.etf,
      m: j.m || (j.mark ? String(j.mark).replace(/^.*\//, '') : null),
      a: j.a || j.mark_aspect,
      wo: j.wo != null ? j.wo : j.watermarkOpacity,
      legacyBg: j.legacyBg,
      keepHandMark: j.keepHandMark,
    };
  }

  function getBrand(ticker) {
    const k = key(ticker);
    if (CACHE.has(k)) return Promise.resolve(CACHE.get(k));
    const shard = shardFor(k);
    return loadIndex()
      .then(() => loadShard(shard))
      .then((shardData) => {
        if (shardData[k]) {
          const e = shardData[k];
          if (HAND_POS[k] && handMarkSvg(k)) e.keepHandMark = true;
          CACHE.set(k, e);
          return e;
        }
        return fetch(`/.netlify/functions/brand?ticker=${encodeURIComponent(k)}`, { signal: AbortSignal.timeout(25000) })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            const e = normalizeRemote(j);
            if (e) {
              if (j && j.markBase64 && !e.fb) {
                try {
                  const bin = atob(j.markBase64);
                  const bytes = new Uint8Array(bin.length);
                  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                  const blob = new Blob([bytes], { type: 'image/png' });
                  e.maskUrl = URL.createObjectURL(blob);
                  e.m = true;
                } catch (err) { /* letters fallback */ }
              }
              if (HAND_POS[k] && handMarkSvg(k)) e.keepHandMark = true;
              CACHE.set(k, e);
              return e;
            }
            const miss = { fb: true };
            CACHE.set(k, miss);
            return miss;
          })
          .catch(() => {
            const miss = { fb: true };
            CACHE.set(k, miss);
            return miss;
          });
      });
  }

  function prime(tickers) {
    return Promise.all((tickers || []).map((t) => getBrand(t)));
  }

  function repaintCard(el, tk) {
    if (!el) return;
    const k = key(tk);
    const bg = bgSync(k);
    el.style.setProperty('--wc-bg', bg);
    const art = el.querySelector('.wc-art');
    if (art) {
      const wrap = document.createElement('div');
      wrap.innerHTML = artHtml(k);
      art.replaceWith(wrap.firstChild);
    }
  }

  function repaintAll(selector) {
    const sel = selector || '.rotation-window.wc';
    document.querySelectorAll(sel).forEach((el) => {
      const tk = el.getAttribute('data-ticker');
      if (tk) repaintCard(el, tk);
    });
  }

  function afterPositionsRender(tickers) {
    prime(tickers).then(() => repaintAll());
  }

  return {
    key,
    bgSync,
    artHtml,
    accent,
    getBrand,
    prime,
    repaintAll,
    afterPositionsRender,
    hashBg,
    fnv1a,
    FALLBACK_HUES,
  };
});