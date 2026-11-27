const{appSrc}=require('./appsrc');
// Settings no longer links to views that already live in the app; phones stay in portrait.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { extractFn } = require('./extract');

const SRC = appSrc();
const MANIFEST = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'manifest.json'), 'utf8'));

test('Settings has no Trade Log, More data or Report rows, and no empty Go to group', () => {
  assert.equal(SRC.includes('settings-log'), false);
  assert.equal(SRC.includes('settings-more'), false);
  assert.equal(SRC.includes('settings-report'), false);
  assert.equal(/<div class="st-h">Go to<\/div>/.test(SRC), false);
  assert.equal(SRC.includes('st-group st-desk'), false);
  assert.match(SRC, /id="settings-export"/);
  assert.match(SRC, /id="settings-legal"/);
});

test('Trade Log, More data and Report stay reachable outside Settings', () => {
  assert.match(SRC, /<a class="nav-item" data-view="log" onclick="switchView\('log'\)">Activity<\/a>/);
  assert.match(SRC, /<p class="home-more"><a onclick="switchView\('analytics'\)">More data<\/a> · <a onclick="switchView\('report'\)">Report<\/a><\/p>/);
  assert.match(SRC, /switchView\('analytics'\)">More data →/);
  assert.match(SRC, /switchView\('report'\)">Report →/);
});

test('installed app asks for portrait; browser-tab fallback is phones only', () => {
  assert.equal(MANIFEST.orientation, 'portrait');
  assert.match(SRC, /id="rotate-phone"[^>]*>Please rotate your phone/);
  assert.match(SRC, /@media \(orientation:landscape\) and \(max-height:500px\) and \(pointer:coarse\)/);
  assert.match(SRC, /#rotate-phone\{display:none\}/);
  const lock = extractFn('tryLockPhonePortrait');
  assert.match(lock, /max-width:700px\) and \(pointer:coarse\)/);
  assert.match(lock, /ori\.lock\('portrait'\)/);
  assert.match(lock, /\.catch\(function\(\)\{\}\)/);
  assert.match(lock, /catch\(e\)\{\}/);
  assert.match(SRC, /window\.addEventListener\('pageshow',tryLockPhonePortrait\)/);
});
