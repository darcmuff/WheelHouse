// Wheel card brand lookup: shard JSON → Netlify function → hash-hue fallback.
(function (root, factory) {
  const api = factory(root);
  root.WcBrand = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';
  const GLOBAL = typeof globalThis !== 'undefined' ? globalThis : root;

  const FALLBACK_HUES = [262, 285, 305, 330, 15, 32, 150, 170, 195, 215, 235, 248];
  const CACHE = new Map();
  const SHARD_CACHE = new Map();
  const SHARD_MISSING = new Set();
  let INDEX = null;
  let INDEX_PROMISE = null;
  let LOGOS_ENABLED = false;
  let OVERRIDES = null;
  let OVERRIDES_PROMISE = null;
  const HAND_POS = {
    AMD: [330, 325, -70, -20, -15, '#fff', 0.2],
    KO: [820, 258, -250, 78, -14, '#fff', 0.16],
    NVDA: [600, 399, -150, -40, -15, '#76B900', 0.38],
    SOFI: [660, 193, -150, -4, -14, '#fff', 0.17],
  };
  const HAND_TICKERS = new Set(Object.keys(HAND_POS));
  const G1_DARK_LIFT = 0.05925;
  const LEGACY_BG = {
    AMD: 'radial-gradient(60% 120% at 92% 18%,rgba(237,28,36,.55) 0%,rgba(237,28,36,0) 70%),linear-gradient(104deg,#1c0a0c 0%,#2e0c10 30%,#5c0d14 56%,#9e1018 80%,#c3131b 100%)',
    KO: 'radial-gradient(55% 110% at 94% 20%,rgba(255,40,40,.45) 0%,rgba(255,40,40,0) 70%),linear-gradient(104deg,#5a0005 0%,#84000a 36%,#b0000b 66%,#d0000a 100%)',
    NVDA: 'radial-gradient(55% 120% at 94% 16%,rgba(118,185,0,.42) 0%,rgba(118,185,0,0) 70%),linear-gradient(104deg,#0c0e0c 0%,#171c12 36%,#293b18 62%,#43631d 86%,#4f7720 100%)',
    SOFI: 'radial-gradient(60% 120% at 96% 90%,rgba(0,169,206,.48) 0%,rgba(0,169,206,0) 68%),linear-gradient(104deg,#102136 0%,#17325b 36%,#1d4a7c 64%,#226392 88%,#246b9a 100%)',
  };
  const WC_BRAND = {
    TSLA: ['#181819', '#2b1819', '#6c201f', '#b82e2c', '232,33,39'],
    AAPL: ['#18191b', '#2b2d32', '#4a4e56', '#6d737d', '210,214,222'],
    MSFT: ['#12323f', '#16415c', '#198098', '#1d9cd2', '0,164,239'],
    AMZN: ['#181f27', '#1f2b36', '#30414f', '#475c71', '255,153,0'],
    GOOGL: ['#142338', '#1d3563', '#284c96', '#3881d2', '66,133,244'],
    GOOG: ['#142338', '#1d3563', '#284c96', '#3881d2', '66,133,244'],
    META: ['#132038', '#183260', '#194b9d', '#185bc8', '6,104,225'],
    PLTR: ['#141415', '#1d1f21', '#313337', '#4a4d51', '255,255,255'],
    HOOD: ['#0f1710', '#0e2b19', '#145524', '#1b7c27', '204,255,0'],
    F: ['#0f192b', '#0f2f51', '#125f7c', '#1698a6', '40,110,220'],
    INTC: ['#0f2435', '#0d3f62', '#0d6697', '#0d82bf', '0,199,253'],
    BAC: ['#10172c', '#0f3152', '#124176', '#1c568b', '227,24,55'],
    T: ['#0f2435', '#0d3f5c', '#0d6788', '#0d89af', '0,168,224'],
    SPY: ['#12211c', '#163e37', '#1a5e54', '#207a6e', '50,200,170'],
    QQQ: ['#132236', '#1d365c', '#2b5492', '#4290bf', '120,140,255'],
    SPCX: ['#010101', '#141414', '#242424', '#3a3a3a', '255,255,255'],
    SPACEX: ['#010101', '#141414', '#242424', '#3a3a3a', '255,255,255'],
    _: ['#1a1d2a', '#283047', '#3a4361', '#4f5a80', '120,130,255'],
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
    const from = oklchToHex(0.19 + G1_DARK_LIFT, 0.07, hue);
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
    const g = typeof globalThis !== 'undefined' ? globalThis : root;
    const marks = (g && g.WC_MARKS) || {};
    return marks[key(tk)] || null;
  }

  function logosEnabled() {
    return LOGOS_ENABLED;
  }

  function loadOverrides() {
    if (OVERRIDES) return Promise.resolve(OVERRIDES);
    if (OVERRIDES_PROMISE) return OVERRIDES_PROMISE;
    OVERRIDES_PROMISE = fetch('brand/overrides.json', { cache: 'force-cache' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => {
        OVERRIDES = j && typeof j === 'object' ? j : {};
        if (typeof OVERRIDES.logos_enabled === 'boolean') LOGOS_ENABLED = OVERRIDES.logos_enabled;
        return OVERRIDES;
      })
      .catch(() => {
        OVERRIDES = {};
        return OVERRIDES;
      });
    return OVERRIDES_PROMISE;
  }

  function lettersArtHtml(k) {
    return `<div class="wc-art" aria-hidden="true"><span class="wc-tk">${escHtml(k.slice(0, 6) || '?')}</span></div>`;
  }

  function stripLogoFields(e) {
    if (!e) return { fb: true };
    const out = { ...e, fb: true };
    delete out.m;
    delete out.maskUrl;
    delete out.keepHandMark;
    delete out.hand;
    return out;
  }

  function prefersHandMark(k) {
    if (!LOGOS_ENABLED) return false;
    return HAND_TICKERS.has(k) && !!handMarkSvg(k) && !!HAND_POS[k];
  }

  function handMarkHtml(k) {
    const pos = HAND_POS[k];
    const svg = handMarkSvg(k);
    if (!svg || !pos) return null;
    const u = "url('data:image/svg+xml," + encodeURIComponent(svg).replace(/'/g, '%27') + "')";
    return `<div class="wc-art" aria-hidden="true"><div class="wc-lgw" style="--w:${pos[0]};--h:${pos[1]};--x:${pos[2]};--y:${pos[3]};--r:${pos[4]}deg"><i style="--m:${u};background:${pos[5]};opacity:${pos[6]}"></i></div></div>`;
  }

  function artHtml(tk) {
    const k = key(tk);
    if (!LOGOS_ENABLED) return lettersArtHtml(k);
    const hit = CACHE.get(k);
    const hand = handMarkHtml(k);
    if (hand && (!hit || hit.keepHandMark || hit.hand)) return hand;
    if (hit && hit.m && !hit.fb && !hit.keepHandMark) {
      const op = hit.wo != null ? hit.wo : 0.16;
      const asp = hit.a || 1;
      const src = hit.maskUrl ? hit.maskUrl : `brand/${k}.png`;
      return `<div class="wc-art" aria-hidden="true"><div class="wc-lgw wc-png" style="--w:${Math.round(420 * asp)};--h:420;--x:-120;--y:40;--r:-14deg"><i style="--m:url('${src}');background:#fff;opacity:${op}"></i></div></div>`;
    }
    if (hand) return hand;
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
        INDEX = j && Array.isArray(j.shards) ? j : { shards: [], v: 1 };
        return INDEX;
      })
      .catch(() => {
        INDEX = { shards: [] };
        return INDEX;
      });
    return INDEX_PROMISE;
  }

  function shardExists(name) {
    return INDEX && Array.isArray(INDEX.shards) && INDEX.shards.indexOf(name) >= 0;
  }

  function loadShard(name) {
    if (SHARD_MISSING.has(name)) return Promise.resolve({});
    if (SHARD_CACHE.has(name)) return SHARD_CACHE.get(name);
    if (!shardExists(name)) {
      SHARD_MISSING.add(name);
      const empty = Promise.resolve({});
      SHARD_CACHE.set(name, empty);
      return empty;
    }
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

  function fetchBrandRemote(k) {
    if (!LOGOS_ENABLED) return Promise.resolve({ fb: true });
    return fetch(`/.netlify/functions/brand?ticker=${encodeURIComponent(k)}`, { signal: AbortSignal.timeout(25000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const e = normalizeRemote(j);
        if (!e) {
          const miss = { fb: true };
          if (prefersHandMark(k)) {
            miss.keepHandMark = true;
            miss.hand = true;
          }
          CACHE.set(k, miss);
          return miss;
        }
        if (j && j.markBase64 && !e.fb) {
          e.maskUrl = `data:image/png;base64,${j.markBase64}`;
          e.m = true;
        }
        if (prefersHandMark(k)) {
          e.keepHandMark = true;
        }
        CACHE.set(k, e);
        return e;
      })
      .catch(() => {
        const miss = { fb: true, keepHandMark: prefersHandMark(k), hand: prefersHandMark(k) };
        CACHE.set(k, miss);
        return miss;
      });
  }

  function getBrand(ticker) {
    const k = key(ticker);
    if (!LOGOS_ENABLED) {
      if (CACHE.has(k)) return Promise.resolve(CACHE.get(k));
      return loadOverrides().then(() => {
        if (CACHE.has(k)) return CACHE.get(k);
        const shard = shardFor(k);
        return loadIndex()
          .then(() => loadShard(shard))
          .then((shardData) => {
            const e = stripLogoFields(shardData[k] || null);
            CACHE.set(k, e);
            return e;
          });
      });
    }
    if (CACHE.has(k)) return Promise.resolve(CACHE.get(k));
    if (prefersHandMark(k)) {
      const e = { keepHandMark: true, hand: true };
      CACHE.set(k, e);
      return Promise.resolve(e);
    }
    const shard = shardFor(k);
    return loadIndex()
      .then(() => loadShard(shard))
      .then((shardData) => {
        if (shardData[k]) {
          const e = shardData[k];
          if (prefersHandMark(k)) {
            e.keepHandMark = true;
            e.hand = true;
          }
          CACHE.set(k, e);
          return e;
        }
        return fetchBrandRemote(k);
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
      const next = wrap.firstChild;
      if (next) art.replaceWith(next);
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
    try {
      loadOverrides()
        .then(() => {
          if (!LOGOS_ENABLED) {
            if (tickers && tickers.length) {
              tickers.forEach((t) => {
                const k = key(t);
                if (!CACHE.has(k)) CACHE.set(k, { fb: true });
              });
            }
            repaintAll();
            return;
          }
          return prime(tickers).then(() => repaintAll());
        })
        .catch((e) => console.warn('WcBrand.afterPositionsRender failed', e));
    } catch (e) {
      console.warn('WcBrand.afterPositionsRender failed', e);
    }
  }

  function setMarks(marks) {
    try {
      if (marks && typeof marks === 'object') {
        GLOBAL.WC_MARKS = marks;
        root.WC_MARKS = marks;
      }
    } catch (e) {
      console.warn('WcBrand.setMarks failed', e);
    }
  }

  loadOverrides();

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
    handMarkSvg,
    prefersHandMark,
    logosEnabled,
    loadOverrides,
    setMarks,
  };
});