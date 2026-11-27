// X Pixel (Twitter conversion tracking). The base code injects uwt.js with async=true
// so it never blocks render. Sign-up is fired only from trackXSignup() after a successful
// new-account creation — never from a click or a returning login.
// Event IDs use X's format tw-<pixelId>-<eventId> (Events Manager).
(function () {
  var PIXEL_ID = 'riuhw';
  var SIGNUP_EVENT = 'tw-riuhw-152urb';

  function install() {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!window.twq) {
      (function (e, t, n, s, u, a) {
        e.twq || (s = e.twq = function () { s.exe ? s.exe.apply(s, arguments) : s.queue.push(arguments); }, s.version = '1.1', s.queue = [], u = t.createElement(n), u.async = !0, u.src = 'https://static.ads-twitter.com/uwt.js', a = t.getElementsByTagName(n)[0], a.parentNode.insertBefore(u, a));
      })(window, document, 'script');
    }
    try { window.twq('config', PIXEL_ID); } catch (e) {}
  }

  function trackXSignup() {
    try { if (typeof twq === 'function') twq('event', SIGNUP_EVENT, {}); } catch (e) {}
  }

  var api = { PIXEL_ID: PIXEL_ID, SIGNUP_EVENT: SIGNUP_EVENT, install: install, trackXSignup: trackXSignup };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') {
    window.OT_XPIXEL = api;
    window.trackXSignup = trackXSignup;
    install();
  }
})();
