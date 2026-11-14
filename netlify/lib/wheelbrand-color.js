// OKLCH brand gradients + hash-hue fallbacks (shared by build script and Netlify function).
'use strict';

const FALLBACK_HUES = [262, 285, 305, 330, 15, 32, 150, 170, 195, 215, 235, 248];

function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h;
}

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c) {
  c = Math.min(1, Math.max(0, c));
  return Math.round((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
}

function rgbToOklab(rgb) {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  let l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  let m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  let s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  l = Math.cbrt(l);
  m = Math.cbrt(m);
  s = Math.cbrt(s);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040373 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bb)];
}

function oklch(rgb) {
  const [L, a, b] = rgbToOklab(rgb);
  const C = Math.hypot(a, b);
  const h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  return [L, C, h];
}

function fromOklch(L, C, h) {
  for (let i = 0; i < 40; i++) {
    const hr = (h * Math.PI) / 180;
    const a = C * Math.cos(hr);
    const b = C * Math.sin(hr);
    const rgb = oklabToRgb(L, a, b);
    const lin = rgb.map((x) => srgbToLinear(x));
    if (lin.every((x) => x >= -1e-4 && x <= 1 + 1e-4)) return rgb;
    C *= 0.92;
  }
  return oklabToRgb(L, 0, 0);
}

function relLum(rgb) {
  const [r, g, b] = rgb.map(srgbToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(rgbA, rgbB) {
  const la = relLum(rgbA);
  const lb = relLum(rgbB);
  const hi = Math.max(la, lb) + 0.05;
  const lo = Math.min(la, lb) + 0.05;
  return hi / lo;
}

function hexc(rgb) {
  return `#${rgb.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function unhex(h) {
  const s = String(h || '').replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

function gradientFromBrand(brandRgb, neutral = false) {
  const [L, C, h] = oklch(brandRgb);
  if (neutral) {
    return {
      frm: hexc(fromOklch(0.17, 0.005, h)),
      to: hexc(fromOklch(0.36, 0.012, h)),
      glow: 'rgba(255,255,255,.16)',
      kind: 'graphite',
    };
  }
  const frm = fromOklch(0.19, Math.min(C, 0.07), h);
  let Lt = Math.min(Math.max(L, 0.42), 0.62);
  Lt = Math.min(Lt, 0.5);
  let to = fromOklch(Lt, Math.min(C, 0.2), h);
  while (contrast([255, 255, 255], to) < 5.6 && Lt > 0.2) {
    Lt -= 0.01;
    to = fromOklch(Lt, Math.min(C, 0.2), h);
  }
  const glow = fromOklch(Math.max(L, 0.62), Math.min(C, 0.2), h);
  return {
    frm: hexc(frm),
    to: hexc(to),
    glow: `rgba(${glow[0]},${glow[1]},${glow[2]},.42)`,
    kind: 'brand',
    toL: Math.round(Lt * 1000) / 1000,
    contrast_to: Math.round(contrast([255, 255, 255], to) * 100) / 100,
  };
}

function fallbackHueTicker(ticker) {
  const hue = FALLBACK_HUES[fnv1a(String(ticker)) % FALLBACK_HUES.length];
  const brand = fromOklch(0.55, 0.14, hue);
  return { brand, hue, gradient: gradientFromBrand(brand, false) };
}

function bgCssFromGradient(g, glowRgb) {
  const glow = glowRgb || g.glow;
  const m = String(glow).match(/rgba?\((\d+),(\d+),(\d+)/);
  const gr = m ? `${m[1]},${m[2]},${m[3]}` : '120,130,255';
  return `radial-gradient(55% 120% at 94% 18%,rgba(${gr},.42) 0%,rgba(${gr},0) 70%),linear-gradient(104deg,${g.frm} 0%,${g.to} 100%)`;
}

/** Legacy multi-stop gradients (v243 hand-tuned). Keys: frm,to,glow as above. */
const LEGACY_BG = {
  AMD: 'radial-gradient(60% 120% at 92% 18%,rgba(237,28,36,.55) 0%,rgba(237,28,36,0) 70%),linear-gradient(104deg,#060607 0%,#121012 34%,#3a0a0e 58%,#86101a 82%,#b3121c 100%)',
  KO: 'radial-gradient(55% 110% at 94% 20%,rgba(255,40,40,.45) 0%,rgba(255,40,40,0) 70%),linear-gradient(104deg,#3d0003 0%,#64000a 36%,#98000b 66%,#c4000a 100%)',
  NVDA: 'radial-gradient(55% 120% at 94% 16%,rgba(118,185,0,.42) 0%,rgba(118,185,0,0) 70%),linear-gradient(104deg,#030403 0%,#0a0f06 36%,#1b2c08 62%,#335207 86%,#3f6606 100%)',
  SOFI: 'radial-gradient(60% 120% at 96% 90%,rgba(0,169,206,.48) 0%,rgba(0,169,206,0) 68%),linear-gradient(104deg,#041327 0%,#08234a 36%,#0a3a6a 64%,#0a5280 88%,#0a5a88 100%)',
};

const ETF_ISSUER = {
  SPY: { stops: ['#041513', '#0a2d29', '#0f4a43', '#156b60'], glow: '50,200,170' },
  QQQ: { stops: ['#060d22', '#101f4f', '#1e3584', '#3550b8'], glow: '120,140,255' },
  IWM: { stops: ['#0a0f1c', '#152038', '#243560', '#3a5090'], glow: '100,130,200' },
  DIA: { stops: ['#0b0c0e', '#1a1c22', '#2e3138', '#454a54'], glow: '180,190,200' },
  VOO: { stops: ['#1a0505', '#3d0c0c', '#6b1515', '#961c1c'], glow: '200,50,50' },
  VTI: { stops: ['#1a0505', '#3d0c0c', '#6b1515', '#961c1c'], glow: '200,50,50' },
  IVV: { stops: ['#1a0505', '#3d0c0c', '#6b1515', '#961c1c'], glow: '200,50,50' },
  ARKK: { stops: ['#050a18', '#0c1a38', '#16306a', '#2448a0'], glow: '80,140,255' },
  XLK: { stops: ['#060d22', '#101f4f', '#1e3584', '#3550b8'], glow: '120,140,255' },
};

function etfBg(ticker) {
  const k = String(ticker || '').toUpperCase();
  const iss = ETF_ISSUER[k];
  if (!iss) return null;
  const [a, b, c, d] = iss.stops;
  return `radial-gradient(55% 120% at 94% 18%,rgba(${iss.glow},.42) 0%,rgba(${iss.glow},0) 70%),linear-gradient(104deg,${a} 0%,${b} 36%,${c} 66%,${d} 100%)`;
}

module.exports = {
  FALLBACK_HUES,
  fnv1a,
  gradientFromBrand,
  fallbackHueTicker,
  bgCssFromGradient,
  LEGACY_BG,
  ETF_ISSUER,
  etfBg,
  unhex,
  hexc,
  oklch,
  contrast,
};