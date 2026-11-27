const{appSrc}=require('./appsrc');
// phonerow.test.js — phone trade rows: hide Δ, stack open P&L like closed BTC rows.
const test=require('node:test');
const assert=require('node:assert');
const{extractFn}=require('./extract');
const SRC=appSrc();

function in700(ruleRe){
  const idx=SRC.search(ruleRe);
  assert.ok(idx>=0,'missing rule '+ruleRe);
  const media=SRC.lastIndexOf('@media(max-width:700px)',idx);
  const other=SRC.lastIndexOf('@media(',idx);
  assert.ok(media>=0&&media===other,'rule must live inside the max-width:700px block');
}

test('delta badge is marked tr-delta and hidden only on phone widths',()=>{
  assert.match(extractFn('openDeltaBadge'),/class="tr-delta"/);
  assert.match(SRC,/\.tr-delta\{/);
  in700(/\.tr-delta\{display:none!important\}/);
  // desktop keeps the badge — the hide rule is not global
  const global=SRC.slice(0,SRC.indexOf('@media')).match(/\.tr-delta\{[^}]*display:\s*none/);
  assert.ok(!global,'do not hide .tr-delta outside the phone breakpoint');
});

test('open-row P&L keeps the desktop one-line and stacks like closed BTC rows on phone',()=>{
  const open=extractFn('openCapturedHtml');
  const closed=extractFn('closedCapturedHtml');
  assert.match(open,/class="cap-desk"/);
  assert.match(open,/class="cap-phone"/);
  // desktop line is unchanged: 41% · +$1,173.84 · at $4.27
  assert.match(open,/cap-desk[^>]*>\$\{pctHtml\} ·\$\{dol\}\$\{at\}/);
  // phone: percent + at on one line, amount on the other — same sibling order as closed BTC
  assert.match(closed,/\$\{o\.kept\}%\$\{at\}[\s\S]+fmtMoney\(Math\.abs\(o\.net\)\)/);
  assert.match(open,/cap-phone[\s\S]*\$\{pctHtml\}\$\{at\}[\s\S]*\$\{(?:amt|dol)/);
  // desktop hides the phone stack; phone hides the one-line and uses column-reverse
  assert.match(SRC,/\.cap-phone\{display:none\}/);
  in700(/\.tr-cap>\.cap-desk\{display:none!important\}/);
  in700(/\.tr-cap>\.cap-phone\{[^}]*flex-direction:\s*column-reverse/);
});
