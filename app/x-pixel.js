// X Pixel (Twitter conversion tracking). The base code injects uwt.js with async=true
// so it never blocks render. Sign-up is fired only from trackXSignup() after a successful
// new-account creation — never from a click or a returning login.
// Event IDs use X's format tw-<pixelId>-<eventId> (Events Manager).
//
// Sign up must never be silently dropped (v436):
//  - trackXSignup() installs the twq queue stub itself if it is missing, so the call queues until uwt.js loads.
//  - index.html defines a tiny early trackXSignup (records a pending sign-up) because this file is async and may
//    not have run yet when sign-up completes; install() flushes that pending record on load.
//  - the pending flag is cleared only after a short grace period, so a navigation right after sign-up
//    (checkout redirect, Google redirect) re-fires on the next page instead of losing the beacon.
//  - one send per account (ot-x-signup-sent holds the uid) so the auth-listener safety net cannot double-count.
(function () {
  var PIXEL_ID = 'riuhw';
  var SIGNUP_EVENT = 'tw-riuhw-152urb';
  var PENDING = 'ot-x-signup-pending', SENT = 'ot-x-signup-sent';
  var PENDING_MAX_MS = 10 * 60 * 1000, GRACE_MS = 2500, DEDUPE_MS = 60 * 1000;

  function ls() { try { return window.localStorage; } catch (e) { return null; } }
  function get(k) { try { var s = ls(); return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function set(k, v) { try { var s = ls(); if (s) s.setItem(k, v); } catch (e) {} }
  function del(k) { try { var s = ls(); if (s) s.removeItem(k); } catch (e) {} }

  function install() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!window.twq) {
      (function (e, t, n, s, u, a) {
        e.twq || (s = e.twq = function () { s.exe ? s.exe.apply(s, arguments) : s.queue.push(arguments); }, s.version = '1.1', s.queue = [], u = t.createElement(n), u.async = !0, u.src = 'https://static.ads-twitter.com/uwt.js', a = t.getElementsByTagName(n)[0], a.parentNode.insertBefore(u, a));
      })(window, document, 'script');
    }
    if (!window.twq.otConfigured) { window.twq.otConfigured = true; try { window.twq('config', PIXEL_ID); } catch (e) {} }
  }

  function readPending() {
    try {
      var p = JSON.parse(get(PENDING) || 'null');
      if (!p || !(Date.now() - (+p.t || 0) < PENDING_MAX_MS)) return null;
      return p;
    } catch (e) { return null; }
  }

  // Send the event once per account. Returns true when it was handed to twq (queued or live).
  function fire(uid) {
    if (typeof window === 'undefined') return false;
    var sent = get(SENT) || '';
    if (uid ? sent === String(uid) : (sent.charAt(0) === 't' && Date.now() - (+sent.slice(1) || 0) < DEDUPE_MS)) return false;
    install();                       // stub + uwt.js if missing; config goes first
    try { window.twq('event', SIGNUP_EVENT, {}); } catch (e) { return false; }
    set(SENT, uid ? String(uid) : 't' + Date.now());
    return true;
  }

  function trackXSignup(uid) {
    try {
      set(PENDING, JSON.stringify({ u: uid ? String(uid) : '', t: Date.now() }));
      fire(uid);
      setTimeout(function () { del(PENDING); }, GRACE_MS);   // kept until the beacon has had time to leave
    } catch (e) {}
  }

  function flushPending() {
    try {
      var p = readPending(); if (!p) return;
      fire(p.u);
      setTimeout(function () { del(PENDING); }, GRACE_MS);
    } catch (e) {}
  }

  var api = { PIXEL_ID: PIXEL_ID, SIGNUP_EVENT: SIGNUP_EVENT, install: install, trackXSignup: trackXSignup, flushPending: flushPending };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.OT_XPIXEL = api;
    window.trackXSignup = trackXSignup;
    install();
    flushPending();
  }
})();
