const{appSrc}=require('./appsrc');
// longpress.test.js — phone long-press to select trades for net P&L
const test=require('node:test');
const assert=require('node:assert');
const{extractFn}=require('./extract');
const SRC=appSrc();

test('hold is about 450ms with a 10px move tolerance, and helpers are pure',()=>{
  assert.match(SRC,/\bSEL_HOLD_MS\s*=\s*450\b/);
  assert.match(SRC,/\bSEL_MOVE_PX\s*=\s*10\b/);
  const far=new Function('const SEL_MOVE_PX=10;'+extractFn('selMoveTooFar')+';return selMoveTooFar;')();
  assert.strictEqual(far(0,0,0,0),false);
  assert.strictEqual(far(100,100,109,100),false);
  assert.strictEqual(far(100,100,111,100),true);
  assert.strictEqual(far(100,100,100,111),true);
});

test('a mid-hold context menu must not toggle again, so the row stays selected',()=>{
  const fn=new Function(extractFn('selIsTouch')+extractFn('selContextShouldToggle')+';return selContextShouldToggle;')();
  assert.strictEqual(fn({pointerType:'touch'},false,false),false);
  assert.strictEqual(fn({pointerType:'pen'},false,false),false);
  assert.strictEqual(fn({pointerType:'mouse'},true,false),false);
  assert.strictEqual(fn({pointerType:'mouse'},false,true),false);
  assert.strictEqual(fn({pointerType:'mouse'},false,false),true);
  assert.strictEqual(fn({},true,false),false);
});

test('press binding uses pointer events, cancels on scroll, vibrates, and does not capture the pointer',()=>{
  const bind=extractFn('bindSelPress');
  assert.match(bind,/addEventListener\('pointerdown'/);
  assert.match(bind,/addEventListener\('pointermove'/);
  assert.match(bind,/addEventListener\('pointerup'/);
  assert.match(bind,/addEventListener\('pointercancel'/);
  assert.match(bind,/addEventListener\('scroll'/);
  assert.match(bind,/SEL_HOLD_MS/);
  assert.match(bind,/trow-press/);
  assert.match(extractFn('selOnHold'),/navigator\.vibrate/);
  assert.doesNotMatch(bind,/setPointerCapture/);
  assert.match(bind,/addEventListener\('contextmenu'/);
  assert.match(bind,/preventDefault\(\)/);
  assert.match(bind,/selContextShouldToggle/);
});

test('rows suppress callout and text selection; press state is visible',()=>{
  assert.match(SRC,/\.trow\{-webkit-touch-callout:none;user-select:none;-webkit-user-select:none\}/);
  assert.match(SRC,/\.trow\.trow-press\{/);
});

test('open-row hold survives a re-render and looks up the row by data-sel',()=>{
  assert.match(extractFn('renderTradeRow'),/data-sel=/);
  assert.match(extractFn('render'),/selDeferRender\(\)/);
  assert.match(extractFn('selClearPress'),/selFlushDeferredRender/);
  assert.match(extractFn('selOnHold'),/selLiveRow|selRowByKey/);
  const F=new Function(`
    let _selPress=null,_selRenderWait=false;
    ${extractFn('selDeferRender')}
    ${extractFn('selRowKey')}
    ${extractFn('selRowByKey').replace('document.querySelector','(selRowByKey.query||function(){return null})')}
    return {
      defer:selDeferRender,
      set(p){_selPress=p;},
      waiting(){return _selRenderWait;},
      key:selRowKey,
    };
  `)();
  assert.strictEqual(F.defer(),false);
  F.set({key:'w:open1'});
  assert.strictEqual(F.defer(),true,'render must wait while a finger is down');
  assert.strictEqual(F.waiting(),true);
  const row={getAttribute:k=>k==='data-sel'?'w:open-csp':''};
  assert.strictEqual(F.key(row),'w:open-csp');
});

test('the trade list blocks Android text selection during a press',()=>{
  const bind=extractFn('bindSelPress');
  assert.match(bind,/addEventListener\('selectstart'/);
  assert.match(bind,/preventDefault\(\)/);
  assert.match(SRC,/\.trade-body,[\s\S]{0,80}user-select:none/);
  assert.match(SRC,/\.trow \*\{[^}]*user-select:none/);
});
