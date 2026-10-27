const test = require('node:test'); const assert = require('node:assert');
global.self = { location: new URL('https://x.app/'), addEventListener() {} };
const { bypass } = require('../app/sw.js');
const g = (u, m = 'GET') => bypass({ method: m }, new URL(u, 'https://x.app/'));
test('sw never caches network-only calls', () => {
  assert.ok(g('https://firestore.googleapis.com/v1/x'));
  assert.ok(g('https://identitytoolkit.googleapis.com/v1/accounts'));
  assert.ok(g('/.netlify/functions/optchain?symbol=TSLA'));
  assert.ok(g('/__/auth/handler'));
  assert.ok(g('/', 'POST'));
  assert.ok(!g('/icon-192.png'));
  assert.ok(!g('/'));
});
