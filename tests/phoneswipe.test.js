// phoneswipe.test.js — phone tab swipe between Home, Wheels and LEAPs (v416)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { extractFn, extractConst } = require('./extract');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'app/index.html'), 'utf8');

function harness(stubs = '') {
  return new Function(`
    ${stubs}
    ${extractConst('PHONE_SWIPE_TABS')}
    ${extractConst('PHONE_SWIPE_INTENT')}
    ${extractConst('PHONE_SWIPE_MIN')}
    ${extractConst('PHONE_SWIPE_RATIO')}
    ${extractConst('PHONE_SWIPE_FLICK')}
    ${extractFn('phoneSwipeTabIndex')}
    ${extractFn('phoneSwipeNext')}
    ${extractFn('phoneSwipeDirFromDx')}
    ${extractFn('phoneSwipeIntent')}
    ${extractFn('phoneSwipeCommit')}
    ${extractFn('phoneSwipeTranslate')}
    ${extractFn('phoneSwipeInHScroll')}
    ${extractFn('phoneSwipeBlocked')}
    ${extractFn('phoneSwipeCreate')}
    ${extractFn('phoneSwipeOnStart')}
    ${extractFn('phoneSwipeOnMove')}
    ${extractFn('phoneSwipeOnEnd')}
    return {
      PHONE_SWIPE_TABS, PHONE_SWIPE_INTENT, PHONE_SWIPE_MIN, PHONE_SWIPE_RATIO, PHONE_SWIPE_FLICK,
      phoneSwipeTabIndex, phoneSwipeNext, phoneSwipeDirFromDx, phoneSwipeIntent,
      phoneSwipeCommit, phoneSwipeTranslate, phoneSwipeInHScroll, phoneSwipeBlocked,
      phoneSwipeCreate, phoneSwipeOnStart, phoneSwipeOnMove, phoneSwipeOnEnd
    };
  `)();
}

test('phone swipe tabs are Home, Wheels and LEAPs in nav order', () => {
  const h = harness();
  assert.deepEqual([...h.PHONE_SWIPE_TABS], ['dash', 'positions', 'options']);
  assert.equal(h.phoneSwipeTabIndex('dash'), 0);
  assert.equal(h.phoneSwipeTabIndex('positions'), 1);
  assert.equal(h.phoneSwipeTabIndex('options'), 2);
  assert.equal(h.phoneSwipeTabIndex('log'), -1);
  assert.match(SRC, /id="tabbar"><a class="nav-item" data-view="dash"/);
  assert.match(SRC, /data-view="dash"[^>]*>Home/);
  assert.match(SRC, /data-view="positions"[^>]*>Wheels/);
  assert.match(SRC, /data-view="options"[^>]*>LEAPs/);
});

test('no wraparound past the first or last tab', () => {
  const h = harness();
  assert.equal(h.phoneSwipeNext('dash', 1), 'positions');
  assert.equal(h.phoneSwipeNext('positions', 1), 'options');
  assert.equal(h.phoneSwipeNext('positions', -1), 'dash');
  assert.equal(h.phoneSwipeNext('options', -1), 'positions');
  assert.equal(h.phoneSwipeNext('dash', -1), null);
  assert.equal(h.phoneSwipeNext('options', 1), null);
  assert.equal(h.phoneSwipeNext('dash', 0), null);
  assert.equal(h.phoneSwipeNext('log', 1), null);
});

test('horizontal intent needs a clear threshold; vertical wins when it is larger', () => {
  const h = harness();
  assert.equal(h.phoneSwipeIntent(8, 3), null);
  assert.equal(h.phoneSwipeIntent(3, 8), null);
  assert.equal(h.phoneSwipeIntent(20, 6), 'h');
  assert.equal(h.phoneSwipeIntent(-20, 6), 'h');
  assert.equal(h.phoneSwipeIntent(6, 20), 'v');
  assert.equal(h.phoneSwipeIntent(6, -20), 'v');
  // equal movement after threshold is treated as vertical, so a scroll is not hijacked
  assert.equal(h.phoneSwipeIntent(20, 20), 'v');
});

test('commit needs enough distance or a flick; short drags snap back', () => {
  const h = harness();
  assert.equal(h.phoneSwipeCommit(40, 0, 390), false);
  assert.equal(h.phoneSwipeCommit(80, 0, 390), false); // 22% of 390 is ~86
  assert.equal(h.phoneSwipeCommit(56, 0, 200), true); // floor is 56 on a narrower screen
  assert.equal(h.phoneSwipeCommit(-90, 0, 390), true);
  assert.equal(h.phoneSwipeCommit(200, 0, 1000), false); // 22% of 1000 is 220
  assert.equal(h.phoneSwipeCommit(220, 0, 1000), true);
  assert.equal(h.phoneSwipeCommit(30, 0.5, 390), true); // flick
  assert.equal(h.phoneSwipeCommit(10, 1, 390), false); // flick but barely moved
});

test('the page follows the finger, and rubber-bands when there is no neighbour', () => {
  const h = harness();
  assert.equal(h.phoneSwipeTranslate(-80, true, 390), -80);
  assert.equal(h.phoneSwipeTranslate(500, true, 390), 390);
  const edge = h.phoneSwipeTranslate(80, false, 390);
  assert.ok(edge > 0 && edge < 48);
  assert.ok(edge < 80);
  const other = h.phoneSwipeTranslate(-200, false, 390);
  assert.ok(other < 0 && other >= -48);
});

function start(h, view, extra = {}) {
  return h.phoneSwipeOnStart(h.phoneSwipeCreate(), Object.assign({
    x: 200, y: 300, t: 1000, id: 1, phone: true, view, width: 390, blocked: false
  }, extra));
}

test('a horizontal swipe from Wheels commits to LEAPs or Home; a vertical move is ignored', () => {
  const h = harness();
  let s = start(h, 'positions');
  s = h.phoneSwipeOnMove(s, { x: 200, y: 306, t: 1020, id: 1 });
  assert.equal(s.active, true);
  assert.equal(s.intent, null);

  // vertical first — abort, so scrolling can continue
  let v = start(h, 'positions');
  v = h.phoneSwipeOnMove(v, { x: 204, y: 340, t: 1030, id: 1 });
  assert.equal(v.active, false);

  // swipe left (finger moves left) from Wheels → LEAPs
  let left = start(h, 'positions');
  left = h.phoneSwipeOnMove(left, { x: 100, y: 304, t: 1080, id: 1 });
  assert.equal(left.intent, 'h');
  assert.equal(left.prevent, true);
  assert.equal(left.next, 'options');
  assert.equal(left.tx, -100);
  const endLeft = h.phoneSwipeOnEnd(left, { x: 100, y: 304, t: 1080, id: 1 });
  assert.equal(endLeft.action, 'commit');
  assert.equal(endLeft.view, 'options');
  assert.equal(endLeft.dir, 1);

  // swipe right from Wheels → Home
  let right = start(h, 'positions');
  right = h.phoneSwipeOnMove(right, { x: 300, y: 302, t: 1080, id: 1 });
  assert.equal(right.next, 'dash');
  const endRight = h.phoneSwipeOnEnd(right, { x: 300, y: 302, t: 1080, id: 1 });
  assert.equal(endRight.action, 'commit');
  assert.equal(endRight.view, 'dash');
  assert.equal(endRight.dir, -1);
});

test('short horizontal drag cancels; edges do not wrap', () => {
  const h = harness();
  let s = start(h, 'positions');
  s = h.phoneSwipeOnMove(s, { x: 180, y: 301, t: 1060, id: 1 });
  assert.equal(s.intent, 'h');
  const cancelled = h.phoneSwipeOnEnd(s, { x: 180, y: 301, t: 1060, id: 1 });
  assert.equal(cancelled.action, 'cancel');

  let first = start(h, 'dash');
  first = h.phoneSwipeOnMove(first, { x: 320, y: 300, t: 1080, id: 1 });
  assert.equal(first.next, null);
  assert.ok(first.tx > 0 && first.tx < 48);
  assert.equal(h.phoneSwipeOnEnd(first, { x: 320, y: 300, t: 1080 }).action, 'cancel');

  let last = start(h, 'options');
  last = h.phoneSwipeOnMove(last, { x: 80, y: 300, t: 1080, id: 1 });
  assert.equal(last.next, null);
  assert.equal(h.phoneSwipeOnEnd(last, { x: 80, y: 300, t: 1080 }).action, 'cancel');
});

test('desktop, blocked targets, and non-tab views never start a swipe', () => {
  const h = harness();
  assert.equal(start(h, 'positions', { phone: false }).active, false);
  assert.equal(start(h, 'positions', { blocked: true }).active, false);
  assert.equal(start(h, 'analytics').active, false);
  assert.equal(start(h, 'log').active, false);
});

function fakeEl(opts = {}) {
  const el = {
    nodeType: 1,
    parentElement: opts.parent || null,
    scrollWidth: opts.scrollWidth || 100,
    clientWidth: opts.clientWidth || 100,
    scrollLeft: opts.scrollLeft || 0,
    closest(sel) {
      const tags = (opts.tags || []).concat(opts.tag ? [opts.tag] : []);
      const ids = opts.ids || (opts.id ? ['#' + opts.id] : []);
      const cls = (opts.cls || []).map(c => '.' + c);
      const tokens = sel.split(',').map(s => s.trim());
      for (const t of tokens) {
        if (tags.includes(t) || ids.includes(t) || cls.includes(t)) return el;
        if (t === '[contenteditable="true"]' && opts.editable) return el;
        if (t === '[contenteditable=""]' && opts.editable === '') return el;
      }
      return el.parentElement ? el.parentElement.closest(sel) : null;
    }
  };
  return el;
}

test('swipes are ignored on inputs, open modals, tab bars and horizontal scrollers', () => {
  const input = fakeEl({ tag: 'input' });
  const tab = fakeEl({ id: 'tabbar' });
  const pop = fakeEl({ id: 'ret-pop' });
  const whatif = fakeEl({ cls: ['wl-wi'] });
  const menu = fakeEl({ cls: ['card-more-menu'] });
  const scroller = fakeEl({ scrollWidth: 400, clientWidth: 200 });
  const scrollerChild = fakeEl({ parent: scroller });
  const hidden = fakeEl({ scrollWidth: 400, clientWidth: 200 });
  const page = fakeEl({});

  const withDoc = harness(`
    const document = {
      querySelector(sel){ return sel === '.mb.open' && globalThis.__mbOpen ? {} : null; },
      getElementById(id){ return id === 'sel-panel' ? globalThis.__sel : null; },
      body: { classList: { contains(c){ return c === 'pc-lock' && !!globalThis.__pcLock; } } }
    };
    function getComputedStyle(n){ return { overflowX: n.__ox || 'auto' }; }
  `);
  assert.equal(withDoc.phoneSwipeBlocked(input), true);
  assert.equal(withDoc.phoneSwipeBlocked(tab), true);
  assert.equal(withDoc.phoneSwipeBlocked(pop), true);
  assert.equal(withDoc.phoneSwipeBlocked(whatif), true);
  assert.equal(withDoc.phoneSwipeBlocked(menu), true);
  assert.equal(withDoc.phoneSwipeBlocked(scrollerChild), true);
  hidden.__ox = 'hidden';
  assert.equal(withDoc.phoneSwipeBlocked(hidden), false);
  assert.equal(withDoc.phoneSwipeBlocked(page), false);
  assert.equal(withDoc.phoneSwipeBlocked(null), true);

  const modalOpen = harness(`
    const document = {
      querySelector(sel){ return sel === '.mb.open' ? {} : null; },
      getElementById(){ return null; },
      body: { classList: { contains(){ return false; } } }
    };
  `);
  assert.equal(modalOpen.phoneSwipeBlocked(page), true);

  const sheet = harness(`
    const document = {
      querySelector(){ return null; },
      getElementById(id){ return id === 'sel-panel' ? { hidden: false } : null; },
      body: { classList: { contains(){ return false; } } }
    };
  `);
  assert.equal(sheet.phoneSwipeBlocked(page), true);
});

test('swipe wiring is phone-only, uses no library, and keeps the nav in sync via switchView', () => {
  assert.match(SRC, /function bindPhoneSwipe\(\)/);
  assert.match(SRC, /bindPhoneSwipe\(\);/);
  assert.match(extractFn('bindPhoneSwipe'), /pointerType!=='touch'/);
  assert.match(extractFn('bindPhoneSwipe'), /touchmove/);
  assert.match(extractFn('bindPhoneSwipe'), /\{passive:false\}/);
  assert.match(extractFn('switchView'), /if\(!_phoneSwipeHold&&typeof phoneSwipeClear==='function'\)phoneSwipeClear\(\)/);
  assert.match(extractFn('switchView'), /nav-item.*dataset\.view===v/);
  assert.match(SRC, /@media\(max-width:700px\)\{[\s\S]*?#content\.swipe-drag/);
  assert.match(SRC, /#content\.swipe-anim\{transition:transform/);
  assert.match(SRC, /touch-action:pan-y/);
  assert.doesNotMatch(SRC, /swiper|hammer\.js|alloyfinger|touch-swipe/i);
  assert.equal((SRC.match(/id="tabbar"/g) || []).length, 1);
});
