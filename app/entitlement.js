// OpTrack plan entitlement — the ONE source of truth for "is this account Pro right now?" and for the Free/Pro gates.
// Pure JS, no DOM, no Firestore. Loaded by the app, landing and start pages (window.OT_TIER) and required by the
// Netlify functions (module.exports), so the browser and the server always agree.
//
// The entitlement record lives at entitlements/{uid}. Users can READ it but never write it (firestore.rules):
// only the Stripe webhook, the founder tool and the `account` Netlify function (service account) change it.
// Fields used here: plan ('pro'|'free'), founder (bool), trialStartedAt / trialEndsAt (ISO strings), csvImportsUsed (int).
(function (root) {
  const DAY = 864e5;
  const TRIAL_DAYS = 14;

  function ms(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'object' && typeof v.toMillis === 'function') return v.toMillis(); // Firestore Timestamp
    if (typeof v === 'object' && v.seconds != null) return v.seconds * 1000;
    return Date.parse(v);
  }
  function nowMs(now) { const n = ms(now == null ? Date.now() : now); return isNaN(n) ? Date.now() : n; }

  // A paid Pro account: an active Stripe subscription (the webhook writes plan:'pro' for active/trialing/past_due
  // on any Pro price, new USD or legacy GBP) or a founder grant.
  function isPaid(ent) { return !!(ent && (ent.founder === true || ent.plan === 'pro')); }

  // getEffectiveTier(user, now) → { tier: 'pro'|'free', isTrial, trialDaysLeft, paid }
  //  1. active paid subscription (or founder) → pro, not a trial
  //  2. otherwise trialEndsAt set and now <= trialEndsAt → pro, trial, with whole days left (rounded up)
  //  3. otherwise → free
  function getEffectiveTier(user, now) {
    const ent = user || null;
    if (isPaid(ent)) return { tier: 'pro', isTrial: false, trialDaysLeft: 0, paid: true };
    const end = ms(ent && ent.trialEndsAt), t = nowMs(now);
    if (!isNaN(end) && t <= end) {
      return { tier: 'pro', isTrial: true, trialDaysLeft: Math.max(1, Math.ceil((end - t) / DAY)), paid: false };
    }
    return { tier: 'free', isTrial: false, trialDaysLeft: 0, paid: false };
  }

  // The trial fields written once, server-side, when a new account is created.
  function trialFields(now) {
    const t = nowMs(now);
    return { trialStartedAt: new Date(t).toISOString(), trialEndsAt: new Date(t + TRIAL_DAYS * DAY).toISOString() };
  }

  // ── Free vs Pro gates. `info` is a getEffectiveTier result; `cfg` is BRAND.plans (free limits).
  // Existing data is NEVER gated: viewing, editing, closing, exporting and deleting are always allowed
  // on every tier, including a Free account that is over the cap after a trial ends.
  // Free limits apply only to NEW risk (new wheels, opening legs, rolls, new LEAPs, PMCC short-call
  // opens/rolls when over the LEAP cap, a 2nd CSV import) and to auto-updating option prices.
  const isProTier = info => !!(info && info.tier === 'pro');
  const lim = (cfg, k, d) => { const f = (cfg && cfg.free) || {}; return f[k] == null ? d : f[k]; };
  function openCount(openTickers) {
    if (typeof openTickers === 'number') return openTickers;
    if (openTickers instanceof Set) return openTickers.size;
    return (openTickers || []).length;
  }
  function existingDataAccess() { return { view: true, edit: true, close: true, export: true, delete: true }; }
  // Open a NEW wheel ticker. Attaching to an already-open ticker is always fine (closing included).
  // Opening/rolling legs on that ticker is a separate check: canOpenOrRollWheel.
  function canOpenWheel(info, openTickers, ticker, cfg) {
    if (isProTier(info)) return true;
    const s = openTickers instanceof Set ? openTickers : new Set(openTickers || []);
    if (ticker && s.has(ticker)) return true;
    return s.size < lim(cfg, 'maxWheelTickers', 2);
  }
  // Opening legs (CSP / CC / STO) and rolls: allowed at or under the Free cap; close-only when over it.
  function canOpenOrRollWheel(info, openTickers, cfg) {
    if (isProTier(info)) return true;
    return openCount(openTickers) <= lim(cfg, 'maxWheelTickers', 2);
  }
  function isOpeningAction(action) {
    return action === 'CSP' || action === 'STOC' || action === 'STO' || action === 'CC';
  }
  function isClosingAction(action) {
    return action === 'BTC' || action === 'STC' || action === 'EXP' || action === 'ASN'
      || action === 'OUT' || action === 'EXPIRE' || action === 'ASSIGN';
  }
  // Open a NEW long LEAP. Free: 1 open LEAP.
  function canOpenLeap(info, openLeapCount, cfg, adding) {
    if (isProTier(info)) return true;
    return (openLeapCount || 0) + (adding || 1) <= lim(cfg, 'maxOpenLeaps', 1);
  }
  // PMCC short-call open or roll: allowed when at or under the Free LEAP cap; blocked when over it.
  function canAddPmccCall(info, openLeapCount, cfg) {
    if (isProTier(info)) return true;
    return (openLeapCount || 0) <= lim(cfg, 'maxOpenLeaps', 1);
  }
  // Robinhood CSV import: Free gets 1 completed import, Pro / trial unlimited.
  function canImportCsv(info, ent, cfg) {
    if (isProTier(info)) return true;
    return ((ent && +ent.csvImportsUsed) || 0) < lim(cfg, 'maxCsvImports', 1);
  }
  // Auto-updating option prices (optchain / Cboe / Nasdaq / Finnhub): Pro and active trial only.
  function liveOptionPrices(info) { return isProTier(info); }
  // Analytics, report, monthly targets and the rest of the app are free for every tier.
  const PRO_VIEWS = [];
  function canSeeView(info, view) { return true; }

  const COPY = {
    free: 'Full OpTrack — auto-updating stock prices, SmartScan, OpTrack Bot, PMCCs, and reports — for 2 active wheels and 1 active LEAP/PMCC (plus 1 Robinhood CSV import).',
    pro: 'Unlimited wheels, unlimited LEAPs & PMCCs, unlimited CSV imports, and auto-updating option prices.',
    trial: 'Try Pro free for 14 days · No credit card required.',
    optionPrices: 'Auto-updating option prices',
    optionPricesCue: 'Auto option prices · Pro'
  };
  function planCopy() { return COPY; }

  // ── Pricing display, computed from BRAND.plans.prices so a price change is one edit in brand.js.
  function money(sym, n) { return sym + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n))); }
  function priceDisplay(plans) {
    const P = plans || {}, sym = P.symbol || '$', pr = P.prices || {};
    const a = +((pr.annual || {}).amount), m = +((pr.monthly || {}).amount);
    const perMonth = Math.round((a / 12) * 100) / 100;
    const save = m > 0 ? Math.round((1 - a / (m * 12)) * 100) : 0;
    return {
      defaultInterval: P.defaultInterval || 'annual',
      annual: { amount: a, perMonth, perMonthText: money(sym, perMonth), totalText: money(sym, a), savePct: save,
        line: money(sym, perMonth) + '/mo billed yearly' },
      monthly: { amount: m, perMonthText: money(sym, m), line: 'billed monthly' }
    };
  }
  function trialPillText(info) { return info && info.isTrial ? 'Pro trial · ' + info.trialDaysLeft + ' day' + (info.trialDaysLeft === 1 ? '' : 's') + ' left' : ''; }

  const api = { TRIAL_DAYS, DAY, isPaid, getEffectiveTier, trialFields, existingDataAccess, canOpenWheel,
    canOpenOrRollWheel, isOpeningAction, isClosingAction, canOpenLeap, canAddPmccCall, canImportCsv,
    liveOptionPrices, canSeeView, PRO_VIEWS, priceDisplay, trialPillText, planCopy, COPY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.OT_TIER = api;
})(typeof window !== 'undefined' ? window : null);
