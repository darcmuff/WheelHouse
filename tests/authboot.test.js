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

test('signup=1 opens Create Account; a direct visit stays on Sign In', () => {
  assert.match(SRC, /authTab\(\/\[\?&\]signup=1\(\?:&\|\$\)\/\.test\(location\.search\)\?'signup':'signin'\)/);
  assert.match(SRC, /tabSignin\.addEventListener\('click', \(\) => authTab\('signin'\)\)/);
  assert.match(SRC, /tabSignup\.addEventListener\('click', \(\) => authTab\('signup'\)\)/);
  const want = /[?&]signup=1(?:&|$)/;
  assert.strictEqual(want.test('?signup=1'), true);
  assert.strictEqual(want.test('?checkout=monthly&signup=1&utm_source=x'), true);
  assert.strictEqual(want.test('?signup=10'), false);
  assert.strictEqual(want.test('?utm_source=x'), false);
  assert.strictEqual(want.test(''), false);
});
test('checkout is remembered without dropping signup or utm', () => {
  const start = SRC.indexOf("(function(){var m=/[?&]checkout=");
  const end = SRC.indexOf('})();', start);
  assert.ok(start > 0 && end > start);
  const code = SRC.slice(start, end + 4);
  function run(search, hash) {
    const loc = { search, pathname: '/app/', hash: hash || '' };
    const ss = {};
    const history = { replaceState(a, b, u) { loc.href = u; } };
    const sessionStorage = { setItem(k, v) { ss[k] = v; } };
    require('vm').runInNewContext(code, { location: loc, sessionStorage, history, URLSearchParams });
    return { ss, href: loc.href };
  }
  let r = run('?checkout=monthly&signup=1&utm_source=x', '#top');
  assert.strictEqual(r.ss['ot-checkout'], 'monthly');
  assert.strictEqual(r.href, '/app/?signup=1&utm_source=x#top');
  r = run('?signup=1');
  assert.strictEqual(r.ss['ot-checkout'], undefined);
  assert.strictEqual(r.href, undefined);
  r = run('?checkout=yearly');
  assert.strictEqual(r.ss['ot-checkout'], 'yearly');
  assert.strictEqual(r.href, '/app/');
});
test('auth screen no longer says free forever', () => {
  const auth = SRC.slice(SRC.indexOf('id="auth-overlay"'), SRC.indexOf('id="onboard-overlay"'));
  assert.ok(!/free forever/i.test(auth));
  assert.ok(!/No credit card required/.test(auth));
  assert.match(auth, /id="auth-legal"/);
  assert.match(auth, /By continuing you agree to the/);
  assert.match(auth, /margin-top:1\.25rem/);
});
test('new accounts, sign-ins and checkout starts are event names only', () => {
  assert.match(SRC, /getAdditionalUserInfo/);
  assert.match(SRC, /function _trackAuth\(cred\)\{try\{var info=cred&&getAdditionalUserInfo\(cred\);_track\(info&&info\.isNewUser\?'account-created':'sign-in'\);\}catch\(e\)\{\}\}/);
  assert.match(SRC, /if\(plan==='monthly'\|\|plan==='yearly'\)_track\('checkout-started\/'\+plan\)/);
  assert.match(SRC, /_trackAuth\(cred\)/);
  assert.match(SRC, /_trackAuth\(await signInWithPopup\(_auth,_googleProvider\)\)/);
  const boot = SRC.slice(SRC.indexOf('onAuthStateChanged(_auth'), SRC.indexOf('// DOM EVENT WIRING'));
  assert.ok(!/_track\(/.test(boot), 'restoring a session is not a sign-in');
  assert.ok(!boot.includes('otTrack'));
  assert.ok(!/_trackAuth[\s\S]{0,180}(email|uid|displayName)/.test(SRC.slice(SRC.indexOf('function _trackAuth'), SRC.indexOf('function _trackAuth') + 220)));
});
test('SW update shows a Refresh prompt instead of auto-reloading the page', () => {
  const swReg = SRC.slice(SRC.indexOf('// Register the offline service worker'));
  assert.ok(/controllerchange[\s\S]*?showSwUpdate/.test(swReg), 'controllerchange shows the prompt');
  assert.ok(!/controllerchange[\s\S]{0,120}location\.reload\(\)/.test(swReg), 'controllerchange must not auto-reload');
  assert.ok(swReg.includes("getElementById('sw-update')"));
  assert.ok(/New version/.test(swReg));
  assert.ok(/sw-update-btn[\s\S]{0,80}location\.reload\(\)/.test(swReg), 'Refresh button still reloads on tap');
  const sw = fs.readFileSync(path.join(__dirname, '..', 'app', 'sw.js'), 'utf8');
  assert.ok(sw.includes('skipWaiting') && sw.includes('clients.claim'), 'new SW still ready before the user taps Refresh');
});
