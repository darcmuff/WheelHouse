// Cookie-free analytics, only when configured in brand.js (window.BRAND.analytics). Off by default.
(function(){
  function analyticsTag(A, host){
    if(!A||!A.provider)return null;
    if(/^(localhost|127\.0\.0\.1)$/.test(host||''))return null;           // never count local development
    if(A.provider==='plausible'&&A.domain)return {src:'https://plausible.io/js/script.js',attrs:{'data-domain':A.domain}};
    if(A.provider==='goatcounter'&&/^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/.test(A.goatcounter||''))return {src:'https://gc.zgo.at/count.js',attrs:{'data-goatcounter':A.goatcounter}};
    return null;
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={analyticsTag};return;}
  var t=analyticsTag(window.BRAND&&window.BRAND.analytics,location.hostname);if(!t)return;
  var s=document.createElement('script');s.defer=true;s.src=t.src;for(var k in t.attrs)s.setAttribute(k,t.attrs[k]);document.head.appendChild(s);
})();
