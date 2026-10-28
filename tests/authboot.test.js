const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const styleOf = id => (SRC.match(new RegExp(`<div id="${id}" style="([^"]*)"`)) || [])[1] || '';
test('page boots on the loading screen, not the sign-in form (no fake "signed out" while Firebase restores the session)', () => {
  assert.match(styleOf('auth-overlay'), /display:none/);
  assert.match(styleOf('loading-overlay'), /display:flex/);
});
test('sign-in form only shown when Firebase reports no user; watchdog never shows it', () => {
  assert.ok(SRC.includes("window._authResolved = true;"));
  assert.ok(/\} else \{\n\s*_confirmedUid = null;[\s\S]{0,200}loading-overlay'\)\.style\.display = 'none';\n\s*showAuthOverlay\(\);/.test(SRC));
  const wd = SRC.slice(SRC.indexOf('// Auth watchdog'), SRC.indexOf('// Register the offline service worker'));
  assert.ok(wd.includes('_authResolved') && !wd.includes('auth-overlay'));
});
test('nothing wipes auth storage or signs out on service-worker updates', () => {
  const sw = fs.readFileSync(path.join(__dirname, '..', 'app', 'sw.js'), 'utf8');
  assert.ok(!/indexedDB|clients\.matchAll\(\)\.then\(.*navigate|unregister|storage/i.test(sw));
  const swReg = SRC.slice(SRC.indexOf('// Register the offline service worker'));
  assert.ok(!/signOut|indexedDB|localStorage\.clear|unregister/.test(swReg));
  assert.strictEqual((SRC.match(/signOut\(_auth\)/g) || []).length, 1); // only the Sign out button
});
