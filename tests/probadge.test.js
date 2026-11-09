// Pro badge: real Pro/founder entitlements only. Free, demo, and a failed read stay unmarked.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const{extractFn}=require('./extract');
const proBadgeOn=new Function(extractFn('proBadgeOn')+'\nreturn proBadgeOn;')();
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
test('badge is on for plan pro and founders, off for free, demo, and no entitlement',()=>{
  assert.strictEqual(proBadgeOn({plan:'pro'}),true);
  assert.strictEqual(proBadgeOn({founder:true}),true);
  assert.strictEqual(proBadgeOn({plan:'pro',founder:true}),true);
  assert.strictEqual(proBadgeOn({plan:'free'}),false);
  assert.strictEqual(proBadgeOn({plan:'pro',demo:true}),false);
  assert.strictEqual(proBadgeOn(null),false);
});
test('wordmark is larger and the badge sits at the end of the name, hidden until synced',()=>{
  assert.match(SRC,/\.tn-brand\{[^}]*font-size:1\.5rem/);
  assert.match(SRC,/\.tn-word\{display:flex;flex-direction:column;align-items:flex-end\}/);
  assert.match(SRC,/\.tn-pro\{[^}]*color:var\(--orange\)/);
  assert.ok(SRC.includes('<span class="tn-word"><span data-brand="name">OpTrack</span><span class="tn-pro" id="tn-pro" hidden>Pro</span></span>'));
  assert.ok(SRC.includes('syncProBadge();'));
  assert.ok(!/isPro\(_ent/.test(extractFn('syncProBadge')));
});
