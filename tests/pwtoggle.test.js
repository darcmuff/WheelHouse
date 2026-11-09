// Show/hide on every password field. Sign-in and create-account share one field.
const test=require('node:test');const assert=require('node:assert');const fs=require('fs');const path=require('path');
const{extractFn}=require('./extract');
const SRC=fs.readFileSync(path.join(__dirname,'..','app','index.html'),'utf8');
const togglePw=new Function(extractFn('togglePw')+'\nreturn togglePw;')();
function field(type){
  const icons={};
  const input={type,selectionStart:2,selectionEnd:4,focused:false,range:null,
    focus(){this.focused=true;},setSelectionRange(a,b){this.range=[a,b];}};
  const btn={attrs:{},parentNode:{querySelector:s=>s==='input'?input:null},
    querySelector(s){return icons[s]||null;},
    setAttribute(k,v){this.attrs[k]=v;}};
  icons['.pw-eye-show']={hidden:false};icons['.pw-eye-hide']={hidden:true};
  return{input,btn,icons};
}
test('toggle switches password and text, keeps the caret, and relabels the button',()=>{
  const f=field('password');
  togglePw(f.btn);
  assert.strictEqual(f.input.type,'text');
  assert.strictEqual(f.btn.attrs['aria-label'],'Hide password');
  assert.strictEqual(f.btn.attrs['aria-pressed'],'true');
  assert.strictEqual(f.icons['.pw-eye-show'].hidden,true);
  assert.strictEqual(f.icons['.pw-eye-hide'].hidden,false);
  assert.strictEqual(f.input.focused,true);
  assert.deepStrictEqual(f.input.range,[2,4]);
  togglePw(f.btn);
  assert.strictEqual(f.input.type,'password');
  assert.strictEqual(f.btn.attrs['aria-label'],'Show password');
  assert.strictEqual(f.btn.attrs['aria-pressed'],'false');
});
test('every password input has an eye button that does not submit',()=>{
  const inputs=[...SRC.matchAll(/<input\b[^>]*type="password"[^>]*>/g)].map(m=>m[0]);
  assert.deepStrictEqual(inputs.map(s=>/id="([^"]+)"/.exec(s)[1]),['auth-password','delete-password']);
  for(const id of ['auth-password','delete-password']){
    const i=SRC.indexOf(`id="${id}"`);
    const wrap=SRC.lastIndexOf('class="pw-wrap"',i);
    assert.ok(wrap>i-400,id);
    const btn=SRC.slice(i,i+800);
    assert.match(btn,/type="button" class="pw-eye"/);
    assert.match(btn,/aria-label="Show password"/);
    assert.match(btn,/onmousedown="event\.preventDefault\(\)"/);
    assert.match(btn,/onclick="togglePw\(this\)"/);
    assert.ok(!/type="submit"/.test(btn));
  }
});
test('landing and start have no password field',()=>{
  for(const f of ['landing.html','start.html']){
    const html=fs.readFileSync(path.join(__dirname,'..','app',f),'utf8');
    assert.ok(!/type="password"/.test(html),f);
  }
});
test('the unused eye icon stays hidden (author CSS must not override the hidden attribute)',()=>{
  assert.match(SRC,/\.pw-eye svg\[hidden\]\{display:none\}/);
});
test('delete-account password stays hidden until a password account opens it',()=>{
  assert.match(SRC,/id="delete-password-wrap" style="display:none/);
  assert.match(extractFn('openDeleteAccount'),/delete-password-wrap'\)[\s\S]*style\.display=isPw\?'block':'none'/);
});
