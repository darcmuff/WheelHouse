// Cookie-free analytics, only when configured in brand.js (window.BRAND.analytics). Off by default.
// Events: window.otTrack('/start-free') → goatcounter.count({path, event:true}).
// Pageviews are loaded directly from each page <head> (count.js + goatPath). This file must not inject count.js again.
// Counts only on optrack.app / www.optrack.app, or when ?gc_test=1 / localStorage gc_test=1. Never on a simulator run (ot-sim=1).
function analyticsTag(A, host){
  if(!A||!A.provider)return null;
  if(/^(localhost|127\.0\.0\.1)$/.test(host||''))return null;           // never count local development
  if(A.provider==='plausible'&&A.domain)return {src:'https://plausible.io/js/script.js',attrs:{'data-domain':A.domain}};
  if(A.provider==='goatcounter'&&/^https:\/\/[a-z0-9-]+\.goatcounter\.com\/count$/.test(A.goatcounter||''))return {src:'https://gc.zgo.at/count.js',attrs:{'data-goatcounter':A.goatcounter}};
  return null;
}
function countEvent(path, host, sim, search, store){
  if(!path)return false;
  if(sim)return false;
  var allow=countEvent._allow;
  if(!allow&&typeof window!=='undefined'&&typeof window.gcShouldCount==='function')allow=window.gcShouldCount;
  if(!allow)return false;
  return !!allow(host, search, store);
}
if(typeof module!=='undefined'&&module.exports){
  countEvent._allow=require('./goat-path.js').gcShouldCount;
  module.exports={analyticsTag,countEvent};
}
else (function(){
  window.otTrack=function(path){
    var sim=false,store=null;
    try{sim=localStorage.getItem('ot-sim')==='1';store=localStorage.getItem('gc_test');}catch(e){}
    if(!countEvent(path,location.hostname,sim,location.search,store))return;
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
})();
