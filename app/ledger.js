// Standalone realised ledger — pure JS, no DOM. Does not change index.html business logic.
(function (root) {
  const DAY = 864e5;
  const MULT = 100;
  const CREDITS = new Set(['CSP', 'STOC', 'STO', 'STC', 'OUT', 'DIV']);

  function isCredit(a) { return CREDITS.has(a); }
  function r2(n) { return Math.round(n * 100) / 100; }
  function todayUTC() { return new Date().toISOString().slice(0, 10); }

  function daysBetweenUTC(startISO, endISO) {
    const d = s => String(s || '').slice(0, 10);
    const startMs = Date.parse(d(startISO) + 'T00:00:00Z');
    const endMs = Date.parse(d(endISO) + 'T00:00:00Z');
    if (isNaN(startMs) || isNaN(endMs)) return 1;
    return Math.max(1, Math.round((endMs - startMs) / DAY));
  }

  function walkLegPairs(wheelTrades) {
    const closing = a => (a === 'BTC' || a === 'STC' || a === 'IN' || a === 'OUT') ? 1 : 0;
    const sorted = [...wheelTrades].sort((a, b) =>
      (a.entered || '').localeCompare(b.entered || '') || closing(a.action) - closing(b.action));
    const open = [];
    const pairs = {};
    const record = (closer, leg, shares) => {
      (pairs[closer.id] = pairs[closer.id] || []).push({ legId: leg.id, shares });
    };
    for (const t of sorted) {
      if (t.action === 'CSP' || t.action === 'STOC') {
        open.push({ ...t, _rem: Number(t.shares) || 0 });
      } else if (t.action === 'BTC' || t.action === 'STC') {
        const ks = Number(t.strike);
        const live = o => !o.expiry || o.expiry >= t.entered;
        const nk = o => !(t.rollId && o.rollId === t.rollId);
        const findLeg = () => {
          let j = open.findIndex(o => nk(o) && !o.expiredWorthless && t.expiry && o.expiry === t.expiry && Number(o.strike) === ks);
          if (j < 0) j = open.findIndex(o => nk(o) && !o.expiredWorthless && live(o) && Number(o.strike) === ks);
          if (j < 0) j = open.findIndex(o => nk(o) && !o.expiredWorthless && Number(o.strike) === ks);
          if (j < 0) j = open.findIndex(o => nk(o) && t.expiry && o.expiry === t.expiry && Number(o.strike) === ks);
          if (j < 0) j = open.findIndex(o => nk(o) && live(o) && Number(o.strike) === ks);
          if (j < 0) j = open.findIndex(o => nk(o) && Number(o.strike) === ks);
          if (j < 0 && (t.strike == null || t.strike === '')) j = open.findLastIndex(o => nk(o));
          return j;
        };
        let rem = Number(t.shares) || 0;
        if (rem <= 0) {
          const j = findLeg();
          if (j >= 0) { record(t, open[j], open[j]._rem); open.splice(j, 1); }
        } else {
          while (rem > 0) {
            const j = findLeg();
            if (j < 0) break;
            const o = open[j];
            const take = Math.min(rem, o._rem || rem);
            record(t, o, take);
            o._rem -= take;
            rem -= take;
            if (o._rem <= 0) open.splice(j, 1);
          }
        }
      } else if (t.action === 'IN') {
        if (t.openMarket) continue;
        let ks = Number(t.strike);
        if ((!ks || isNaN(ks)) && t.shares && t.total) ks = Math.round((Number(t.total) / Number(t.shares)) * 100) / 100;
        const bestAssignable = pred => {
          let best = -1, bestExp = '';
          open.forEach((o, idx) => {
            if (o.action !== 'CSP' || !pred(o)) return;
            const e = o.expiry || '';
            if (e && e <= t.entered && e >= bestExp) { best = idx; bestExp = e; }
          });
          return best;
        };
        const findCSP = () => {
          let j = bestAssignable(o => !o.expiredWorthless && Number(o.strike) === ks);
          if (j < 0) j = open.findIndex(o => o.action === 'CSP' && !o.expiredWorthless && Number(o.strike) === ks);
          if (j < 0) j = bestAssignable(o => !o.expiredWorthless);
          if (j < 0) j = open.findIndex(o => o.action === 'CSP' && !o.expiredWorthless);
          if (j < 0) j = bestAssignable(o => Number(o.strike) === ks);
          if (j < 0) j = open.findIndex(o => o.action === 'CSP' && Number(o.strike) === ks);
          if (j < 0) j = bestAssignable(() => true);
          if (j < 0) j = open.findIndex(o => o.action === 'CSP');
          return j;
        };
        let inRem = Number(t.shares) || 0;
        if (inRem <= 0) {
          const j = findCSP();
          if (j >= 0) { record(t, open[j], open[j]._rem); open.splice(j, 1); }
        } else {
          while (inRem > 0) {
            const j = findCSP();
            if (j < 0) break;
            const o = open[j];
            const take = Math.min(inRem, o._rem || inRem);
            record(t, o, take);
            o._rem -= take;
            inRem -= take;
            if (o._rem <= 0) open.splice(j, 1);
          }
        }
      } else if (t.action === 'OUT') {
        const sh = Number(t.shares) || 0;
        let oks = Number(t.strike);
        if ((!oks || isNaN(oks)) && sh && t.total) oks = Math.round((Number(t.total) / sh) * 100) / 100;
        if (oks) {
          const bestCallable = pred => {
            let best = -1, bestExp = '';
            open.forEach((o, idx) => {
              if (o.action !== 'STOC' || Number(o.strike) !== oks || !pred(o)) return;
              const e = o.expiry || '';
              if (e && e <= t.entered && e >= bestExp) { best = idx; bestExp = e; }
            });
            return best;
          };
          const findSTOC = () => {
            let j = bestCallable(o => !o.expiredWorthless);
            if (j < 0) j = open.findIndex(o => o.action === 'STOC' && !o.expiredWorthless && Number(o.strike) === oks);
            if (j < 0) j = bestCallable(() => true);
            if (j < 0) j = open.findIndex(o => o.action === 'STOC' && Number(o.strike) === oks);
            return j;
          };
          let outRem = sh;
          if (outRem <= 0) {
            const j = findSTOC();
            if (j >= 0) { record(t, open[j], open[j]._rem); open.splice(j, 1); }
          } else {
            while (outRem > 0) {
              const j = findSTOC();
              if (j < 0) break;
              const o = open[j];
              const take = Math.min(outRem, o._rem || outRem);
              record(t, o, take);
              o._rem -= take;
              outRem -= take;
              if (o._rem <= 0) open.splice(j, 1);
            }
          }
        }
      }
    }
    return { open, pairs };
  }

  function normWheelShortStcClosers(trades) {
    if (!trades || !trades.length) return trades || [];
    const stcIds = new Set(trades.filter(t => t.action === 'STC').map(t => t.id));
    if (!stcIds.size) return trades;
    const probe = trades.map(t => t.action === 'STC' ? { ...t, action: 'BTC' } : { ...t });
    const { pairs } = walkLegPairs(probe);
    const flip = new Set(Object.keys(pairs).filter(cid => stcIds.has(cid)));
    if (!flip.size) return trades;
    return trades.map(t => flip.has(t.id) ? { ...t, action: 'BTC' } : t);
  }

  function proRata(total, share, base) {
    const b = Number(base) || 0;
    if (b > 0) return (Number(total) || 0) * (Number(share) || 0) / b;
    return Number(total) || 0;
  }

  function wheelOpenCredit(t) {
    const baseSh = +t.shares || 0;
    const openSh = t._rem > 0 ? t._rem : baseSh;
    const gross = (+t.premium || 0) * openSh;
    const proFees = (+t.fees || 0) * (baseSh ? openSh / baseSh : 1);
    if (baseSh > 0) {
      const tot = t.total;
      if (tot != null && tot !== '' && !isNaN(+tot) && ((+tot) > 0 || proFees >= gross)) return (+tot) * (openSh / baseSh);
      return gross - proFees;
    }
    return 0;
  }

  function optSign(l) { return l.side === 'long' ? 1 : -1; }
  function optOpenCash(l) {
    return -optSign(l) * (+l.entryPrice || 0) * MULT * (+l.qty || 0) - (+l.fees || 0);
  }
  function optCloseCash(l) {
    if (l.status === 'open') return 0;
    const p = l.status === 'expired' ? 0 : (+l.closePrice || 0);
    return optSign(l) * p * MULT * (+l.qty || 0) - (+l.closeFees || 0);
  }
  function optCostBasis(l) {
    return Math.abs((+l.entryPrice || 0) * MULT * (+l.qty || 0)) + (l.side === 'long' ? (+l.fees || 0) : -(+l.fees || 0));
  }

  function shareRealisationsWithDates(trades) {
    const byRot = {};
    trades.forEach(t => {
      if (t.action !== 'IN' && t.action !== 'OUT') return;
      const k = t.wheelId || ('tk:' + (t.ticker || ''));
      (byRot[k] = byRot[k] || []).push(t);
    });
    const events = [], open = {};
    Object.entries(byRot).forEach(([k, list]) => {
      list = list.slice().sort((a, b) => (a.entered || '').localeCompare(b.entered || '') || (a.action === b.action ? 0 : a.action === 'IN' ? -1 : 1));
      const lots = [];
      list.forEach(t => {
        const sh = t.shares || 0, v = t.total || 0;
        if (t.action === 'IN') {
          if (sh > 0) lots.push({ shares: sh, cps: v / sh, date: t.entered || '' });
          return;
        }
        let left = sh, cost = 0, lotInDate = t.entered || '';
        const lotDates = [];
        while (left > 0 && lots.length) {
          const l = lots[0], take = Math.min(left, l.shares);
          cost += take * l.cps;
          lotDates.push({ date: l.date, shares: take });
          l.shares -= take;
          left -= take;
          if (l.shares <= 1e-9) lots.shift();
        }
        if (lotDates.length) lotInDate = lotDates[0].date;
        events.push({ wheelId: k, date: t.entered || '', shares: sh, proceeds: v, cost, pnl: v - cost, lotInDate, ticker: t.ticker });
      });
      open[k] = { shares: lots.reduce((a, l) => a + l.shares, 0), cost: lots.reduce((a, l) => a + l.shares * l.cps, 0), lots: lots.slice() };
    });
    return { events, open };
  }

  function wheelKind(action) {
    return action === 'STOC' ? 'cc' : 'csp';
  }

  function buildWheelIncomeEvent(o, closer, shares, wheelId, tkr, seq) {
    const grossIn = proRata(o.total, shares, o.shares);
    const isBuyBack = closer && (closer.action === 'BTC' || closer.action === 'STC');
    const grossOut = isBuyBack ? proRata(closer.total, shares, closer.shares) : 0;
    const amount = grossIn - grossOut;
    const closeDate = closer ? (closer.entered || o.expiry || '') : (o.expiry || '');
    const openDate = o.entered || '';
    const resolvedShares = Number(shares) || Number(o.shares) || 0;
    const strike = +o.strike || 0;
    let capital = strike * resolvedShares;
    if (o.action === 'STOC') {
      const sr = null; // filled below if share cost known — caller may pass shareCostByWheel
    }
    return {
      id: `wi-${wheelId}-${o.id}-${closer ? closer.id : 'exp'}-${seq}`,
      date: closeDate || openDate,
      ticker: o.ticker || tkr,
      strategy: 'wheel',
      bucket: 'income',
      kind: wheelKind(o.action),
      amount,
      grossIn,
      grossOut,
      fees: 0,
      capital,
      daysHeld: daysBetweenUTC(openDate, closeDate || o.expiry || openDate),
      isWin: amount >= 0,
      wheelId,
      legId: o.id,
      openRef: o.id
    };
  }

  function ccCapital(o, shareCostPerShare, resolvedShares, strike) {
    if (shareCostPerShare != null && shareCostPerShare > 0) return shareCostPerShare * resolvedShares;
    return strike * resolvedShares;
  }

  function buildLedger(wheels, trades, opts, ctx) {
    ctx = ctx || {};
    const today = ctx.today || todayUTC();
    const priceOf = ctx.priceOf || (() => null);
    const wheelMarkOf = ctx.wheelMarkOf || (() => null);
    const tradesAll = trades || [];
    const optsAll = (opts || []).filter(l => !l.demo);
    const wheelMap = {};
    (wheels || []).forEach(w => { wheelMap[w.id] = w; });

    const groups = {};
    tradesAll.forEach(t => {
      const k = t.wheelId || ('tk:' + (t.ticker || ''));
      (groups[k] = groups[k] || []).push(t);
    });

    const events = [];
    let seq = 0;

    Object.entries(groups).forEach(([wheelId, rawList]) => {
      let list = normWheelShortStcClosers(rawList.map((t, i) => ({ ...t, id: t.id || ('L' + i) })));
      const tkr = (list.find(t => t.ticker) || wheelMap[wheelId] || {}).ticker || '';
      const byId = {};
      list.forEach(t => { byId[t.id] = t; });

      const sr = shareRealisationsWithDates(list);
      const shareCostCps = sr.open[wheelId] && sr.open[wheelId].shares
        ? sr.open[wheelId].cost / sr.open[wheelId].shares
        : (sr.events.length ? null : null);
      // FIFO open cost for CC capital when shares still held: use open lots avg
      const openLots = (sr.open[wheelId] && sr.open[wheelId].lots) || [];

      const { open, pairs } = walkLegPairs(list);
      const pairedCloserIds = new Set(Object.keys(pairs));

      Object.entries(pairs).forEach(([cid, ps]) => {
        const c = byId[cid];
        if (!c) return;
        ps.forEach(p => {
          const o = byId[p.legId];
          if (!o) return;
          const shares = p.shares || 0;
          const ev = buildWheelIncomeEvent(o, c, shares, wheelId, tkr, seq++);
          if (o.action === 'STOC') {
            let cps = null;
            if (openLots.length) cps = openLots[0].cps;
            else if (sr.open[wheelId] && sr.open[wheelId].shares > 0) cps = sr.open[wheelId].cost / sr.open[wheelId].shares;
            ev.capital = ccCapital(o, cps, shares, +o.strike || 0);
          }
          events.push(ev);
        });
      });

      list.forEach(t => {
        const v = t.total || 0;
        if (t.action === 'BTC' && !pairedCloserIds.has(t.id)) {
          events.push({
            id: `wi-orphan-${wheelId}-${t.id}-${seq++}`,
            date: t.entered || '',
            ticker: t.ticker || tkr,
            strategy: 'wheel',
            bucket: 'income',
            kind: 'csp',
            amount: -v,
            grossIn: 0,
            grossOut: v,
            fees: 0,
            capital: (+t.strike || 0) * (Number(t.shares) || 0),
            daysHeld: 1,
            isWin: false,
            wheelId,
            legId: t.id,
            openRef: null
          });
        } else if (t.action === 'STC' && !pairedCloserIds.has(t.id)) {
          events.push({
            id: `wi-stc-${wheelId}-${t.id}-${seq++}`,
            date: t.entered || '',
            ticker: t.ticker || tkr,
            strategy: 'wheel',
            bucket: 'income',
            kind: 'cc',
            amount: v,
            grossIn: v,
            grossOut: 0,
            fees: 0,
            capital: 0,
            daysHeld: 1,
            isWin: v >= 0,
            wheelId,
            legId: t.id,
            openRef: null
          });
        } else if (t.action === 'DIV') {
          events.push({
            id: `div-${wheelId}-${t.id}-${seq++}`,
            date: t.entered || '',
            ticker: t.ticker || tkr,
            strategy: 'wheel',
            bucket: 'asset',
            kind: 'div',
            amount: v,
            grossIn: v >= 0 ? v : 0,
            grossOut: v < 0 ? -v : 0,
            fees: 0,
            capital: 0,
            daysHeld: 1,
            isWin: v >= 0,
            wheelId,
            legId: t.id,
            openRef: null
          });
        }
      });

      open.forEach(o => {
        const rem = o._rem > 0 ? o._rem : (Number(o.shares) || 0);
        const usedFrac = o.shares > 0 ? 1 - rem / Number(o.shares) : 0;
        if (usedFrac > 1 - 1e-9) return;
        const f = o.shares > 0 ? rem / Number(o.shares) : 1;
        const amt = (o.total || 0) * f;
        if (o.expiry && (o.expiry < today || (o.expiredWorthless && o.expiry <= today))) {
          const ev = buildWheelIncomeEvent(o, null, rem, wheelId, tkr, seq++);
          ev.amount = amt;
          ev.grossIn = amt;
          ev.grossOut = 0;
          ev.date = o.expiry;
          ev.daysHeld = daysBetweenUTC(o.entered, o.expiry);
          ev.isWin = amt >= 0;
          if (o.action === 'STOC') {
            let cps = openLots.length ? openLots[0].cps : null;
            ev.capital = ccCapital(o, cps, rem, +o.strike || 0);
          } else {
            ev.capital = (+o.strike || 0) * rem;
          }
          events.push(ev);
        } else if (o.expiredWorthless && !o.expiry) {
          events.push({
            id: `wi-xw-${wheelId}-${o.id}-${seq++}`,
            date: o.entered || '',
            ticker: o.ticker || tkr,
            strategy: 'wheel',
            bucket: 'income',
            kind: wheelKind(o.action),
            amount: amt,
            grossIn: amt,
            grossOut: 0,
            fees: 0,
            capital: (+o.strike || 0) * rem,
            daysHeld: daysBetweenUTC(o.entered, o.entered),
            isWin: amt >= 0,
            wheelId,
            legId: o.id,
            openRef: o.id
          });
        }
      });

      sr.events.forEach(e => {
        events.push({
          id: `sh-${wheelId}-${e.date}-${seq++}`,
          date: e.date,
          ticker: e.ticker || tkr,
          strategy: 'wheel',
          bucket: 'asset',
          kind: 'shares',
          amount: e.pnl,
          grossIn: e.pnl >= 0 ? e.pnl : 0,
          grossOut: e.pnl < 0 ? -e.pnl : 0,
          fees: 0,
          capital: e.cost,
          daysHeld: daysBetweenUTC(e.lotInDate, e.date),
          isWin: e.pnl >= 0,
          wheelId,
          legId: null,
          openRef: null
        });
      });
    });

    const legsById = {};
    optsAll.forEach(l => { legsById[l.id] = l; });

    optsAll.forEach(l => {
      if (l.status === 'open') return;
      const openCash = optOpenCash(l);
      const closeCash = optCloseCash(l);
      const amount = openCash + closeCash;
      const closeDate = l.closeDate || l.expiry || l.entryDate || '';
      const isShort = l.side === 'short';
      const bucket = isShort ? 'income' : 'asset';
      let kind = 'leap';
      if (isShort && l.type === 'C') kind = l.parentLeapId ? 'pmcc_call' : 'cc';
      else if (isShort && l.type === 'P') kind = 'csp';

      let capital = optCostBasis(l);
      if (isShort && kind === 'pmcc_call' && l.parentLeapId) {
        const parent = legsById[l.parentLeapId];
        if (parent) {
          const pq = +parent.qty || 1;
          capital = optCostBasis(parent) * ((+l.qty || 0) / pq);
        } else {
          capital = (+l.strike || 0) * MULT * (+l.qty || 0);
        }
      } else if (isShort && !l.parentLeapId && l.type === 'P') {
        capital = (+l.strike || 0) * MULT * (+l.qty || 0);
      }

      let grossIn, grossOut;
      if (bucket === 'income') {
        grossIn = openCash;
        grossOut = closeCash < 0 ? -closeCash : 0;
      } else {
        grossIn = amount >= 0 ? amount : 0;
        grossOut = amount < 0 ? -amount : 0;
      }

      events.push({
        id: `opt-${l.id}-${seq++}`,
        date: closeDate,
        ticker: l.underlying || '',
        strategy: 'pmcc',
        bucket,
        kind,
        amount,
        grossIn,
        grossOut,
        fees: (+l.fees || 0) + (+l.closeFees || 0),
        capital,
        daysHeld: daysBetweenUTC(l.entryDate, closeDate || l.expiry),
        isWin: amount >= 0,
        wheelId: l.wheelId || null,
        legId: l.id,
        openRef: null
      });
    });

    const openOut = [];
    const openWheelIds = (wheels && wheels.length)
      ? new Set(wheels.filter(w => w.status === 'open').map(w => w.id))
      : new Set(Object.keys(groups));

    Object.entries(groups).forEach(([wheelId, rawList]) => {
      if (openWheelIds.size && !openWheelIds.has(wheelId)) return;
      let list = normWheelShortStcClosers(rawList.map((t, i) => ({ ...t, id: t.id || ('L' + i) })));
      const tkr = (list.find(t => t.ticker) || wheelMap[wheelId] || {}).ticker || '';
      const liveOpen = walkLegPairs(list).open.filter(o =>
        !o.expiredWorthless && (!o.expiry || o.expiry >= today) && (o._rem > 0 || !Number(o.shares)));
      liveOpen.forEach(o => {
        if (o.action !== 'CSP' && o.action !== 'STOC') return;
        const rem = o._rem > 0 ? o._rem : (Number(o.shares) || 0);
        const openCredit = wheelOpenCredit(o);
        const mark = wheelMarkOf(o);
        let unrealised = null, priced = false;
        if (mark != null && mark >= 0) {
          unrealised = openCredit - mark * rem;
          priced = true;
        }
        const capitalAtRisk = o.action === 'CSP' ? (+o.strike || 0) * rem : 0;
        openOut.push({
          id: `open-opt-${wheelId}-${o.id}`,
          ticker: o.ticker || tkr,
          strategy: 'wheel',
          kind: wheelKind(o.action),
          wheelId,
          legId: o.id,
          capitalAtRisk,
          unrealised,
          priced
        });
      });
    });

    Object.entries(shareRealisationsWithDates(tradesAll).open).forEach(([wheelId, o]) => {
      if (openWheelIds.size && !openWheelIds.has(wheelId)) return;
      if (!(o.shares > 0)) return;
      const w = wheelMap[wheelId] || {};
      const tkr = w.ticker || '';
      const price = priceOf(tkr);
      let unrealised = null, priced = false;
      if (price != null && price > 0) {
        unrealised = price * o.shares - o.cost;
        priced = true;
      }
      openOut.push({
        id: `open-sh-${wheelId}`,
        ticker: tkr,
        strategy: 'wheel',
        kind: 'shares',
        wheelId,
        legId: null,
        capitalAtRisk: o.cost,
        unrealised,
        priced
      });
    });

    optsAll.forEach(l => {
      if (l.status !== 'open') return;
      const costBasis = optCostBasis(l);
      let capitalAtRisk = costBasis;
      if (l.side === 'short') {
        capitalAtRisk = l.parentLeapId ? 0 : (l.type === 'P' ? (+l.strike || 0) * MULT * (+l.qty || 0) : 0);
      }
      let unrealised = null, priced = false;
      if (l.side === 'long') {
        if (l.expiry && l.expiry < today) { /* expired */ }
        else if (l.mark == null || l.mark === '') { /* unpriced */ }
        else {
          unrealised = optOpenCash(l) + (+l.mark) * MULT * (+l.qty || 0);
          priced = true;
        }
      } else {
        if (l.mark == null || l.mark === '') { /* unpriced */ }
        else {
          unrealised = optOpenCash(l) - (+l.mark) * MULT * (+l.qty || 0);
          priced = true;
        }
      }
      const kind = l.side === 'long' ? 'leap' : (l.parentLeapId ? 'pmcc_call' : (l.type === 'C' ? 'cc' : 'csp'));
      openOut.push({
        id: `open-leg-${l.id}`,
        ticker: l.underlying || '',
        strategy: 'pmcc',
        kind,
        wheelId: l.wheelId || null,
        legId: l.id,
        capitalAtRisk,
        unrealised,
        priced
      });
    });

    const unpricedCount = openOut.filter(x => !x.priced).length;
    let puts = 0, sharesCap = 0, leaps = 0;
    openOut.forEach(x => {
      if (x.kind === 'csp') puts += x.capitalAtRisk || 0;
      else if (x.kind === 'shares') sharesCap += x.capitalAtRisk || 0;
      else if (x.kind === 'leap') leaps += x.capitalAtRisk || 0;
    });

    return {
      events,
      open: openOut,
      unpricedCount,
      capitalAtWork: { puts, shares: sharesCap, wheel: puts + sharesCap, leaps, total: puts + sharesCap + leaps }
    };
  }

  function filterEvents(events, filt) {
    filt = filt || {};
    return (events || []).filter(e => {
      if (filt.strategy != null && filt.strategy !== '' && e.strategy !== filt.strategy) return false;
      if (filt.bucket != null && filt.bucket !== '' && e.bucket !== filt.bucket) return false;
      if (filt.ticker != null && filt.ticker !== '' && e.ticker !== filt.ticker) return false;
      if (filt.from != null && filt.from !== '' && (e.date || '').slice(0, 10) < filt.from) return false;
      if (filt.to != null && filt.to !== '' && (e.date || '').slice(0, 10) > filt.to) return false;
      return true;
    });
  }

  function summarizeIncome(events) {
    const inc = (events || []).filter(e => e.bucket === 'income');
    if (!inc.length) return { total: 0, wins: 0, losses: 0, count: 0, wr: null, avgWin: null, avgLoss: null };
    let total = 0, wins = 0, losses = 0, winSum = 0, lossSum = 0;
    inc.forEach(e => {
      total += e.amount;
      if (e.amount >= 0) { wins++; winSum += e.amount; }
      else { losses++; lossSum += -e.amount; }
    });
    const count = inc.length;
    return {
      total: r2(total),
      wins,
      losses,
      count,
      wr: count ? r2(wins / count * 100) : null,
      avgWin: wins ? r2(winSum / wins) : null,
      avgLoss: losses ? r2(lossSum / losses) : null
    };
  }

  function weekKeyUTC(iso) {
    const d = String(iso || '').slice(0, 10);
    const ms = Date.parse(d + 'T00:00:00Z');
    if (isNaN(ms)) return d;
    const dt = new Date(ms);
    const dow = dt.getUTCDay();
    const mondayOff = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(ms + mondayOff * DAY);
    return mon.toISOString().slice(0, 10);
  }

  function periodKey(iso, gran) {
    const d = String(iso || '').slice(0, 10);
    if (gran === 'Day') return d;
    if (gran === 'Week') return weekKeyUTC(d);
    if (gran === 'Month') return d.slice(0, 7);
    return d;
  }

  function normZero(n) {
    const x = r2(n);
    return Object.is(x, -0) ? 0 : x;
  }

  function groupEventsByPeriod(events, opts) {
    opts = opts || {};
    const gran = opts.gran || 'Month';
    const from = opts.from, to = opts.to;
    const buckets = {};
    (events || []).forEach(e => {
      const d = (e.date || '').slice(0, 10);
      if (from && d < from) return;
      if (to && d > to) return;
      const k = periodKey(d, gran);
      if (!buckets[k]) buckets[k] = { gain: 0, loss: 0 };
      if (e.amount >= 0) buckets[k].gain += e.amount;
      else buckets[k].loss += -e.amount;
    });
    let gain = 0, loss = 0;
    const list = Object.keys(buckets).sort().map(key => {
      const g = buckets[key].gain, l = buckets[key].loss;
      gain += g;
      loss += l;
      return { key, gain: normZero(g), loss: normZero(l), net: normZero(g - l) };
    });
    return { buckets: list, gain: normZero(gain), loss: normZero(loss), net: normZero(gain - loss) };
  }

  function weightedAROC(events) {
    let num = 0, den = 0;
    (events || []).forEach(e => {
      if (e.capital > 0 && e.daysHeld > 0) {
        num += e.amount;
        den += e.capital * e.daysHeld;
      }
    });
    if (den <= 0) return null;
    return r2((num / den) * 365 * 100);
  }

  function calcSortino(monthlyNets) {
    const arr = monthlyNets || [];
    if (arr.length < 3) return null;
    const avg = arr.reduce((a, x) => a + x, 0) / arr.length;
    const downsideDev = Math.sqrt(arr.reduce((a, r) => a + (r < 0 ? r * r : 0), 0) / arr.length);
    if (downsideDev === 0 && avg > 0) return Infinity;
    if (downsideDev === 0 && avg <= 0) return 0;
    return r2(avg / downsideDev);
  }

  const Ledger = {
    daysBetweenUTC,
    buildLedger,
    filterEvents,
    summarizeIncome,
    groupEventsByPeriod,
    weightedAROC,
    calcSortino
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Ledger;
  root.OT_LEDGER = Ledger;
})(typeof window !== 'undefined' ? window : globalThis);