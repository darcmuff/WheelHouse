// Delta at open — derived display value only.
// Does not change P&L, realised, win/loss, pricing, parsers or business logic.
// Black-Scholes (no dividends). Risk-free rate is a fixed 4% constant.
(function (root) {
  const RATE = 0.04;
  const IV_LO = 0.01; // 1%
  const IV_HI = 5;    // 500%
  const DAY = 864e5;
  const BUCKETS = [
    { key: 'under 0.15', label: 'Under 0.15', test: x => x < 0.15 },
    { key: '0.15–0.25', label: '0.15–0.25', test: x => x >= 0.15 && x < 0.25 },
    { key: '0.25–0.35', label: '0.25–0.35', test: x => x >= 0.25 && x < 0.35 },
    { key: '0.35–0.50', label: '0.35–0.50', test: x => x >= 0.35 && x <= 0.50 },
    { key: 'over 0.50', label: 'Over 0.50', test: x => x > 0.50 }
  ];

  function ncdf(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  function yearFraction(openDate, expiry, filledAt) {
    if (!expiry) return null;
    const exp = Date.parse(String(expiry).length <= 10 ? expiry + 'T16:00:00-04:00' : expiry);
    if (!isFinite(exp)) return null;
    let open;
    if (filledAt) {
      open = Date.parse(filledAt);
    } else if (openDate && /T\d{2}:/.test(String(openDate))) {
      open = Date.parse(openDate);
    } else if (openDate) {
      open = Date.parse(String(openDate).slice(0, 10) + 'T16:00:00-04:00');
      return isFinite(open) ? (exp - open) / (365 * DAY) : null;
    }
    if (!isFinite(open)) return null;
    return (exp - open) / (365 * DAY);
  }

  function bs(type, S, K, T, vol, r) {
    r = r == null ? RATE : r;
    if (!(S > 0 && K > 0 && T > 0 && vol > 0)) return null;
    const sq = Math.sqrt(T);
    const d1 = (Math.log(S / K) + (r + vol * vol / 2) * T) / (vol * sq);
    const d2 = d1 - vol * sq;
    const disc = Math.exp(-r * T);
    const call = type === 'C' || type === 'call';
    const price = call ? S * ncdf(d1) - K * disc * ncdf(d2) : K * disc * ncdf(-d2) - S * ncdf(-d1);
    const delta = call ? ncdf(d1) : ncdf(d1) - 1;
    return { price, delta, d1, d2 };
  }

  function impliedVol(type, price, S, K, T, r) {
    r = r == null ? RATE : r;
    if (!(price > 0 && S > 0 && K > 0 && T > 0)) return null;
    const call = type === 'C' || type === 'call';
    const typ = call ? 'C' : 'P';
    const intrinsic = typ === 'C' ? Math.max(0, S - K * Math.exp(-r * T)) : Math.max(0, K * Math.exp(-r * T) - S);
    if (price < intrinsic - 1e-6) return null;
    const loP = bs(typ, S, K, T, IV_LO, r);
    const hiP = bs(typ, S, K, T, IV_HI, r);
    if (!loP || !hiP) return null;
    if (price < loP.price - 1e-4 || price > hiP.price + 1e-4) return null;
    let lo = IV_LO, hi = IV_HI;
    for (let i = 0; i < 100; i++) {
      const m = (lo + hi) / 2;
      const p = bs(typ, S, K, T, m, r).price;
      if (p > price) hi = m; else lo = m;
      if (hi - lo < 1e-6) break;
    }
    const iv = (lo + hi) / 2;
    const mid = bs(typ, S, K, T, iv, r);
    if (!mid || Math.abs(mid.price - price) > Math.max(0.01, 0.02 * price)) return null;
    return iv;
  }

  // option type: 'P'/'C' (or put/call). premium is per share. spot is the underlying at open.
  // Returns {delta, absDelta, iv} or {delta:null, absDelta:null, iv:null, reason}.
  function deltaAtOpen(input) {
    const o = input || {};
    const typRaw = String(o.type || o.pc || '').toUpperCase();
    const typ = typRaw.charAt(0) === 'C' ? 'C' : typRaw.charAt(0) === 'P' ? 'P' : '';
    const K = +o.strike, S = +o.spot, prem = +o.premium;
    const T = yearFraction(o.openDate || o.entered || o.entryDate, o.expiry, o.filledAt);
    if (!typ) return { delta: null, absDelta: null, iv: null, reason: 'bad-inputs' };
    if (!(K > 0) || !(prem > 0)) return { delta: null, absDelta: null, iv: null, reason: 'bad-inputs' };
    if (!(S > 0)) return { delta: null, absDelta: null, iv: null, reason: 'no-spot' };
    if (!(T > 0)) return { delta: null, absDelta: null, iv: null, reason: 'bad-inputs' };
    const iv = impliedVol(typ, prem, S, K, T, RATE);
    if (iv == null) return { delta: null, absDelta: null, iv: null, reason: 'unsolvable' };
    const g = bs(typ, S, K, T, iv, RATE);
    if (!g) return { delta: null, absDelta: null, iv: null, reason: 'unsolvable' };
    const delta = Math.round(g.delta * 1e6) / 1e6;
    return { delta, absDelta: Math.round(Math.abs(delta) * 1e6) / 1e6, iv };
  }

  function typedAbsDelta(v) {
    if (v == null || v === '') return null;
    const n = +v;
    if (!isFinite(n) || n === 0) return null;
    const a = Math.abs(n);
    if (a > 1) return null;
    return Math.round(a * 1e6) / 1e6;
  }

  // Official optional fill-time field is filledAt (ISO 8601). entered/entryDate may
  // carry a time if they are full timestamps; date-only values do not count.
  // createdAt and optleg ts/closeTs are save times, not broker fills — never used.
  function fillTimestamp(row) {
    if (!row) return null;
    const raw = row.filledAt || (/T\d{2}:/.test(String(row.entered || '')) ? row.entered : null) ||
      (/T\d{2}:/.test(String(row.entryDate || '')) ? row.entryDate : null);
    if (!raw) return null;
    const t = Date.parse(raw);
    return isFinite(t) ? raw : null;
  }

  function optionTypeFromTrade(t) {
    if (!t) return '';
    if (t.action === 'CSP') return 'P';
    if (t.action === 'STOC' || t.action === 'STO') return 'C';
    const typ = String(t.type || '').toUpperCase();
    if (typ.charAt(0) === 'C' || typ.charAt(0) === 'P') return typ.charAt(0);
    return '';
  }

  function resolveOpenDelta(row, spot) {
    // Wheel trades: t.delta is the optional typed override (0–1). Never use optleg
    // live Cboe `delta` as the open override — that lives on l.delta and is current.
    let override = null;
    if (row) {
      if (row.deltaAtOpen != null && row.deltaAtOpen !== '') override = typedAbsDelta(row.deltaAtOpen);
      else if (row.action && row.delta != null && row.delta !== '') override = typedAbsDelta(row.delta);
    }
    if (override != null) return { delta: null, absDelta: override, iv: null, src: 'typed', reason: null };
    const typ = optionTypeFromTrade(row) || (row && row.type);
    const prem = row && (row.premium != null && row.premium !== '' ? row.premium : row.entryPrice);
    const openDate = row && (row.entered || row.entryDate || row.openDate);
    const est = deltaAtOpen({
      type: typ,
      strike: row && row.strike,
      expiry: row && row.expiry,
      openDate,
      filledAt: fillTimestamp(row),
      premium: prem,
      spot
    });
    est.src = est.delta == null ? null : 'estimated';
    return est;
  }

  function bucketKey(absDelta) {
    if (absDelta == null || !isFinite(+absDelta)) return 'No delta';
    const x = +absDelta;
    for (let i = 0; i < BUCKETS.length; i++) if (BUCKETS[i].test(x)) return BUCKETS[i].key;
    return 'No delta';
  }

  function bucketLabel(key) {
    if (key === 'No delta') return 'No delta';
    const b = BUCKETS.find(x => x.key === key);
    return b ? b.label : key;
  }

  function formatDelta(absDelta) {
    if (absDelta == null || !isFinite(+absDelta)) return '';
    return 'Δ ' + (+absDelta).toFixed(2);
  }

  function precisionHover(src, precision, bar) {
    if (src === 'typed') return 'Delta at open, typed on the trade.';
    if (!src) return '';
    let how;
    if (precision === 'minute') how = (bar === '5m' ? 'the 5-minute' : 'the 1-minute') + ' stock price at fill';
    else if (precision === 'hour') how = 'the hourly stock price at fill';
    else how = "the stock's close on the open date";
    return 'Delta at open, estimated from the fill premium and ' + how + '.';
  }

  // items: {absDelta, win, amount}[] — amount and win already computed by the Report.
  function bucketItems(items) {
    const order = BUCKETS.map(b => b.key).concat(['No delta']);
    const by = {};
    order.forEach(k => { by[k] = { key: k, label: bucketLabel(k), count: 0, wins: 0, losses: 0, totalPnl: 0, wr: null, avgPnl: null }; });
    (items || []).forEach(it => {
      const k = bucketKey(it && it.absDelta);
      const b = by[k];
      b.count++;
      if (it && it.win) b.wins++; else b.losses++;
      b.totalPnl = Math.round((b.totalPnl + (+it.amount || 0)) * 100) / 100;
    });
    order.forEach(k => {
      const b = by[k];
      if (b.count) {
        b.wr = ((b.wins / b.count) * 100).toFixed(1);
        b.avgPnl = Math.round((b.totalPnl / b.count) * 100) / 100;
      }
    });
    const rows = order.map(k => by[k]).filter(b => b.count);
    let best = null;
    rows.forEach(b => {
      if (b.key === 'No delta') return;
      if (!best || b.avgPnl > best.avgPnl) best = b;
    });
    const noDelta = by['No delta'].count;
    return { rows, best, noDelta, buckets: BUCKETS.map(b => b.key) };
  }

  const LONDON = 'Europe/London';

  // Plain HH:MM, or HH:MM:SS. Leading hour zero optional. Blank is not an error.
  function parseFillTime(str) {
    const raw = String(str == null ? '' : str).trim();
    if (!raw) return { blank: true };
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(raw);
    if (!m) return { error: 'malformed' };
    const hour = +m[1], minute = +m[2], second = m[3] != null ? +m[3] : 0;
    if (hour > 23 || minute > 59 || second > 59) return { error: 'malformed' };
    return { hour, minute, second };
  }

  function formatInZone(ms, timeZone) {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || LONDON,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23'
    });
    const p = {};
    fmt.formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
    let hour = +p.hour;
    let day = +p.day, month = +p.month, year = +p.year;
    // Some engines report midnight as 24; roll that to 00:00 the next calendar day is wrong —
    // treat 24 as 00 on the same formatted date parts the engine already gave.
    if (hour === 24) hour = 0;
    return { year, month, day, hour, minute: +p.minute, second: +p.second };
  }

  function pad2(n) { return String(n).padStart(2, '0'); }

  function formatOffset(offMin) {
    const sign = offMin >= 0 ? '+' : '-';
    const abs = Math.abs(offMin);
    return sign + pad2(Math.floor(abs / 60)) + ':' + pad2(abs % 60);
  }

  // Combine a YYYY-MM-DD date with a London local time into ISO 8601 with the
  // correct +00:00 (GMT) or +01:00 (BST) offset. DST is resolved from
  // Europe/London, not a fixed offset. A spring-forward gap is rejected.
  // An autumn fold picks the earlier instant (still BST).
  function filledAtFromDateAndTime(dateStr, timeStr, timeZone) {
    timeZone = timeZone || LONDON;
    const d = String(dateStr || '').trim();
    const t = parseFillTime(timeStr);
    if (t.blank) return { value: null, blank: true };
    if (t.error) return { value: null, error: 'malformed' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return { value: null, error: d ? 'bad-date' : 'blank-date' };
    const y = +d.slice(0, 4), mo = +d.slice(5, 7), day = +d.slice(8, 10);
    const matches = [];
    [0, 60].forEach(offMin => {
      const ms = Date.UTC(y, mo - 1, day, t.hour, t.minute, t.second) - offMin * 60000;
      const p = formatInZone(ms, timeZone);
      if (p.year === y && p.month === mo && p.day === day && p.hour === t.hour && p.minute === t.minute && p.second === t.second) {
        matches.push({ ms, offMin });
      }
    });
    if (!matches.length) return { value: null, error: 'not-a-london-time' };
    matches.sort((a, b) => a.ms - b.ms);
    const off = matches[0].offMin;
    const value = d + 'T' + pad2(t.hour) + ':' + pad2(t.minute) + ':' + pad2(t.second) + formatOffset(off);
    return { value, offsetMinutes: off };
  }

  // Blank input leaves any existing filledAt unchanged; a valid time replaces it.
  function resolveFilledAt(dateStr, timeStr, previous, timeZone) {
    const r = filledAtFromDateAndTime(dateStr, timeStr, timeZone);
    if (r.error) return r;
    if (r.blank) return { value: previous || null, blank: true };
    return { value: r.value, offsetMinutes: r.offsetMinutes };
  }

  function fillTimeFromFilledAt(filledAt, timeZone) {
    if (!filledAt) return '';
    const ms = Date.parse(filledAt);
    if (!isFinite(ms)) return '';
    const p = formatInZone(ms, timeZone || LONDON);
    return pad2(p.hour) + ':' + pad2(p.minute) + (p.second ? ':' + pad2(p.second) : '');
  }

  function fillTimeHintText(err) {
    if (err === 'malformed') return 'Use a time like 14:52 (hours and minutes).';
    if (err === 'not-a-london-time') return 'That time does not exist on this date in London.';
    if (err === 'bad-date' || err === 'blank-date') return 'Enter the date first, then the fill time.';
    return '';
  }

  const DeltaOpen = {
    RATE, IV_LO, IV_HI, BUCKETS, LONDON,
    ncdf, yearFraction, bs, impliedVol, deltaAtOpen,
    typedAbsDelta, fillTimestamp, optionTypeFromTrade, resolveOpenDelta,
    bucketKey, bucketLabel, formatDelta, precisionHover, bucketItems,
    parseFillTime, filledAtFromDateAndTime, resolveFilledAt,
    fillTimeFromFilledAt, fillTimeHintText, formatInZone
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DeltaOpen;
  root.DeltaOpen = DeltaOpen;
})(typeof window !== 'undefined' ? window : globalThis);
