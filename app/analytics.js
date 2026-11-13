// Cookie-free analytics, only when configured in brand.js (window.BRAND.analytics). Off by default.
// Custom events go through window.otTrack('name'): event names only, and a no-op when this is off,
// on localhost, or before the GoatCounter script has loaded. Never throws.
(function(){
  function analyticsTag(A, host){
    if(!A||!A.provider)return null;
    if(/^(localhost|127\.0\.0\.1)$/.test(host||''))return null;           // never count local development
    if(A.provider==='plausible'&&A.domain)return {src:'https://plausible.io/js/script.js',attrs:{'data-domain':A.domain}};
    if(A.provider==='goatcounter'&&/^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/.test(A.goatcounter||''))return {src:'https://gc.zgo.at/count.js',attrs:{'data-goatcounter':A.goatcounter}};
    return null;
  }
  // Names only (account-created, sign-in, checkout-started/monthly). Emails, UIDs and other text are dropped.
  function trackEvent(name, env){
    try{
      var win=(env&&env.window)||(typeof window!=='undefined'?window:null);
      var host=env&&env.host!=null?env.host:(typeof location!=='undefined'?location.hostname:'');
      if(!win||typeof name!=='string'||!/^[a-z][a-z0-9-]{0,40}(?:\/[a-z0-9-]{1,20})?$/.test(name))return;
      if(!analyticsTag(win.BRAND&&win.BRAND.analytics, host))return;
      var gc=win.goatcounter;
      if(!gc||typeof gc.count!=='function')return;
      gc.count({path:name,title:name,event:true});
    }catch(e){}
  }
  // Copy utm_* from this page onto links marked data-carry-utm. Checkout and signup params already on the link stay put.
  function forwardUtm(doc, search){
    try{
      var cur=new URLSearchParams(search||''), bits=[];
      cur.forEach(function(v,k){
        if(!/^utm_[a-z0-9_-]{1,40}$/i.test(k)||typeof v!=='string'||!v||v.length>100)return;
        bits.push(encodeURIComponent(k)+'='+encodeURIComponent(v));
      });
      if(!bits.length||!doc||!doc.querySelectorAll)return 0;
      var n=0, add=bits.join('&');
      doc.querySelectorAll('a[data-carry-utm]').forEach(function(a){
        var h=a.getAttribute('href')||'';
        if(!h||/[?&]utm_/i.test(h))return;
        a.setAttribute('href',h+(h.indexOf('?')<0?'?':'&')+add);
        n++;
      });
      return n;
    }catch(e){return 0;}
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={analyticsTag,trackEvent,forwardUtm};return;}
  window.otTrack=trackEvent;
  try{forwardUtm(document,location.search);}catch(e){}
  var t=analyticsTag(window.BRAND&&window.BRAND.analytics,location.hostname);if(!t)return;
  var s=document.createElement('script');s.defer=true;s.src=t.src;for(var k in t.attrs)s.setAttribute(k,t.attrs[k]);document.head.appendChild(s);
})();
