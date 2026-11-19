const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'functions', 'brand.js'), 'utf8');

test('brand function: fallbacks use no-store on CDN and browser', () => {
  assert.match(SRC, /HEADERS_MISS[\s\S]*no-store/);
  assert.match(SRC, /Netlify-CDN-Cache-Control': 'no-store'/);
  assert.match(SRC, /HEADERS_HIT[\s\S]*durable/);
});

test('brand function: fallback bodies include why', () => {
  assert.match(SRC, /why/);
  assert.match(SRC, /no_key/);
  assert.match(SRC, /fallbackResponse/);
});

test('logo-dev uses v2 brands/logo route', () => {
  const lib = fs.readFileSync(path.join(__dirname, '..', 'netlify', 'lib', 'logo-dev.js'), 'utf8');
  assert.match(lib, /v2\/brands\/logo/);
  assert.match(lib, /j\.data/);
});

test('netlify.toml bundles sharp and overrides', () => {
  const toml = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf8');
  assert.match(toml, /sharp/);
  assert.match(toml, /overrides\.json/);
  assert.match(toml, /top250-options\.json/);
});

test('brand function: off-list tickers use not_in_list without Logo.dev', () => {
  assert.match(SRC, /not_in_list/);
  assert.match(SRC, /top250-options\.json/);
});

test('top250 list has 250 single-stock symbols', () => {
  const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'brand', 'top250-options.json'), 'utf8'));
  assert.strictEqual(j.symbols.length, 250);
  assert.ok(j.sources && j.sources.length >= 1);
});