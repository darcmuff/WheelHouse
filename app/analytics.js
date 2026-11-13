// Cookie-free analytics, only when configured in brand.js (window.BRAND.analytics). Off by default.
// Events: window.otTrack('/start-free') → goatcounter.count({path, event:true}).
// Never counts localhost, and never counts a simulator run (localStorage ot-sim=1).
function analyticsTag(A, host){
  if(!A||!A.provider)return null;
  if(/^(localhost|127\.0\.0\.1)$/.test(host||''))return null;           // never count local development
  if(A.provider==='plausible'&&A.domain)return {src:'https://plausible.io/js/script.js',attrs:{'data-domain':A.domain}};
  if(A.provider==='goatcounter'&&/^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/.test(A.goatcounter||''))return {src:'https://gc.zgo.at/count.js',attrs:{'data-goatcounter':A.goatcounter}};
  return null;
}
function countEvent(path, host, sim){
  if(!path)return false;
  if(/^(localhost|127\.0\.0\.1)$/.test(host||''))return false;
  if(sim)return false;
  return true;
}
if(typeof module!=='undefined'&&module.exports){module.exports={analyticsTag,countEvent};}
else (function(){
  window.otTrack=function(path){
    var sim=false;
    try{sim=localStorage.getItem('ot-sim')==='1';}catch(e){}
    if(!countEvent(path,location.hostname,sim))return;
    if(!document.querySelector('script[data-goatcounter]'))return;
    var gc=window.goatcounter;
    if(gc&&typeof gc.count==='function'){gc.count({path:path,event:true});return;}
    (window._otQ=window._otQ||[]).push(path);
    if(window._otTimer)return;
    var n=0;
    window._otTimer=setInterval(function(){
      var g=window.goatcounter;
      if((!g||typeof g.count!=='function')&&++n<40)return;
      clearInterval(window._otTimer);window._otTimer=null;
      if(!g||typeof g.count!=='function'){window._otQ=[];return;}
      (window._otQ||[]).splice(0).forEach(function(p){g.count({path:p,event:true});});
    },250);
  };
  var sim=false;try{sim=localStorage.getItem('ot-sim')==='1';}catch(e){}
  if(sim)return;
  var t=analyticsTag(window.BRAND&&window.BRAND.analytics,location.hostname);if(!t)return;
  var s=document.createElement('script');s.defer=true;s.src=t.src;for(var k in t.attrs)s.setAttribute(k,t.attrs[k]);document.head.appendChild(s);
})();
