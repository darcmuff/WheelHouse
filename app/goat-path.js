// Helpers inlined in each counting page's <head> before count.js; tests check they stay in sync.
// goatPath: strip twclid, fbclid, gclid; keep utm_* and every other param.
// Counting is live-host only (optrack.app / www.optrack.app) unless ?gc_test=1 or localStorage gc_test=1.
function goatPath(p){
  p=String(p==null?'':p);
  var hash='',h=p.indexOf('#');
  if(h>=0){hash=p.slice(h);p=p.slice(0,h)}
  var q=p.indexOf('?');
  if(q<0)return p+hash;
  var path=p.slice(0,q),kept=[],parts=p.slice(q+1).split('&');
  for(var i=0;i<parts.length;i++){
    var pair=parts[i];if(!pair)continue;
    var key=pair.split('=')[0],dec=key;
    try{dec=decodeURIComponent(key.replace(/\+/g,' '))}catch(e){}
    dec=String(dec).toLowerCase();
    if(dec==='twclid'||dec==='fbclid'||dec==='gclid')continue;
    kept.push(pair);
  }
  return path+(kept.length?'?'+kept.join('&'):'')+hash;
}
function gcLiveHost(host){
  host=String(host||'').toLowerCase();
  return host==='optrack.app'||host==='www.optrack.app';
}
function gcTestFlag(search, store){
  return /(?:^|[?&])gc_test=1(?:&|$)/.test(String(search||''))||store==='1';
}
function gcShouldCount(host, search, store){
  return gcLiveHost(host)||gcTestFlag(search, store);
}
function gcTakePageview(state){
  if(!state)state={};
  if(state.sent)return false;
  state.sent=true;
  return true;
}
if(typeof module!=='undefined'&&module.exports)module.exports={goatPath,gcLiveHost,gcTestFlag,gcShouldCount,gcTakePageview};
