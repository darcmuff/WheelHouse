'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_LIST = path.join(__dirname, 'top250-options.json');
const APP_LIST = path.join(__dirname, '../../app/brand/top250-options.json');

/** Tickers that keep hand-made SVG watermarks — never spend Logo.dev credits in CI seed. */
const HAND_MARK_SKIP = new Set(['AMD', 'KO', 'NVDA', 'SOFI']);

function listPaths() {
  return [APP_LIST, ROOT_LIST].filter((p) => fs.existsSync(p));
}

function loadTop250Options() {
  for (const p of listPaths()) {
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(j.symbols) && j.symbols.length) return j;
    } catch {
      /* try next */
    }
  }
  return { symbols: [], tickers: [], generatedAt: null };
}

function allowSet(doc = loadTop250Options()) {
  return new Set((doc.symbols || []).map((s) => String(s).toUpperCase()));
}

function isHandMarkOnly(sym) {
  return HAND_MARK_SKIP.has(String(sym || '').toUpperCase());
}

/**
 * @param {string} sym
 * @param {{ disable_logo?: boolean, force_fallback?: boolean, allow_logo?: boolean }} ov
 */
function logoFetchAllowed(sym, ov = {}) {
  const k = String(sym || '').toUpperCase();
  if (ov.disable_logo || ov.force_fallback) return false;
  if (ov.allow_logo) return true;
  if (isHandMarkOnly(k)) return false;
  return allowSet().has(k);
}

module.exports = {
  ROOT_LIST,
  APP_LIST,
  HAND_MARK_SKIP,
  loadTop250Options,
  allowSet,
  isHandMarkOnly,
  logoFetchAllowed,
};