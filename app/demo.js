// OpTrack demo mode (/demo). Loaded first by index.html; does nothing anywhere else.
// In demo: no sign-in, no Firestore. Trades live in this browser only under the 'optrack-demo:' localStorage prefix,
// which can never mix with a real account. Prices are made up here, so no quote API is called.
(function(){
  var path=location.pathname.replace(/\/+$/,'');
  if(path!=='/demo')return;
  var PREFIX='optrack-demo:',DATA_KEY='data-v1';

  // 1. Separate storage: every localStorage key the app uses gets the demo prefix (UI prefs too).
  var S=Storage.prototype,gi=S.getItem,si=S.setItem,ri=S.removeItem;
  var isLS=function(o){try{return o===window.localStorage;}catch(e){return false;}};
  S.getItem=function(k){return gi.call(this,isLS(this)?PREFIX+k:k);};
  S.setItem=function(k,v){return si.call(this,isLS(this)?PREFIX+k:k,v);};
  S.removeItem=function(k){return ri.call(this,isLS(this)?PREFIX+k:k);};

  // 2. Made-up prices. Option prices from a simple Black-Scholes so marks, profit and greeks behave like the real thing.
  var SPOT={KO:69.80,AMD:158.40,SOFI:16.40,AAPL:238.20,MSFT:452.00};
  var IV={KO:0.18,AMD:0.45,SOFI:0.55,AAPL:0.27,MSFT:0.25};
  function N(x){var t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2),p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p;}
  function bs(S0,K,T,v,call){var r=0.04;T=Math.max(T,1/365);var d1=(Math.log(S0/K)+(r+v*v/2)*T)/(v*Math.sqrt(T)),d2=d1-v*Math.sqrt(T);
    var price=call?S0*N(d1)-K*Math.exp(-r*T)*N(d2):K*Math.exp(-r*T)*N(-d2)-S0*N(-d1);
    var pdf=Math.exp(-d1*d1/2)/Math.sqrt(2*Math.PI);
    return{price:Math.max(0.01,price),delta:call?N(d1):N(d1)-1,gamma:pdf/(S0*v*Math.sqrt(T))};}
  function parseOcc(c){var m=/^([A-Z.]+)(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(c);if(!m)return null;
    return{u:m[1],exp:new Date(Date.UTC(2000+ +m[2],+m[3]-1,+m[4],21)),call:m[5]==='C',k:+m[6]/1000};}
  function chain(sym,codes){var s=SPOT[sym];var out={spot:s||null,contracts:{}};if(!s)return out;
    codes.forEach(function(c){var o=parseOcc(c);if(!o)return;var T=(o.exp-Date.now())/(365*864e5);if(T<=0)return;
      var b=bs(s,o.k,T,IV[sym]||0.3,o.call),mid=Math.round(b.price*100)/100,spr=Math.max(0.01,Math.round(mid*0.02*100)/100);
      out.contracts[c]={src:'demo',bid:Math.max(0.01,mid-spr/2),ask:mid+spr/2,last:mid,iv:IV[sym],delta:b.delta,gamma:b.gamma,theta:null,vega:null};});
    return out;}
  function candles(sym,from){var s=SPOT[sym];if(!s)return{candles:[]};var out=[],seed=0;for(var i=0;i<sym.length;i++)seed+=sym.charCodeAt(i)*31;
    var rnd=function(){seed=(seed*9301+49297)%233280;return seed/233280;};var days=[];var d=new Date();d.setUTCHours(12);
    for(var j=0;j<380;j++){if(d.getUTCDay()%6)days.unshift(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()-1);}
    var p=s;var vals=[];for(var k=days.length-1;k>=0;k--){vals[k]=p;p=p/(1+(rnd()-0.49)*0.03);}
    days.forEach(function(x,k){if(!from||x>=from)out.push({date:x,close:Math.round(vals[k]*100)/100});});return{symbol:sym,source:'demo',candles:out};}
  var J=function(o,st){return Promise.resolve(new Response(JSON.stringify(o),{status:st||200,headers:{'Content-Type':'application/json'}}));};
  var realFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    var u;try{u=new URL(typeof input==='string'?input:input.url,location.href);}catch(e){return realFetch(input,init);}
    if(u.origin===location.origin&&u.pathname.indexOf('/.netlify/functions/')===0){
      var fn=u.pathname.split('/').pop(),sym=(u.searchParams.get('symbol')||'').toUpperCase();
      if(fn==='quote'){var s=SPOT[sym];return s?J({c:s,pc:+(s/1.004).toFixed(2),d:+(s-s/1.004).toFixed(2),dp:0.4}):J({c:0});}
      if(fn==='optchain')return J(chain(sym,(u.searchParams.get('contracts')||'').split(',').filter(Boolean)));
      if(fn==='candles')return J(candles(sym,u.searchParams.get('from')));
      if(fn==='extquote')return J({});
      if(fn==='profile'){var svg='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#1f2937"/><text x="32" y="42" text-anchor="middle" font-size="28" font-family="sans-serif" fill="#fff">'+(sym.charAt(0)||'?')+'</text></svg>';return J({logo:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)});}
      if(fn==='earnings')return J({});
      if(fn==='symbol'){var q=(u.searchParams.get('q')||'').toLowerCase();var all=[{symbol:'KO',name:'Coca-Cola'},{symbol:'AMD',name:'Advanced Micro Devices'},{symbol:'SOFI',name:'SoFi'},{symbol:'AAPL',name:'Apple'},{symbol:'MSFT',name:'Microsoft'},{symbol:'TSLA',name:'Tesla'},{symbol:'SPCX',name:'Space Exploration Technologies'}];return J({results:all.filter(function(x){return x.symbol.toLowerCase().indexOf(q)>=0||x.name.toLowerCase().indexOf(q)>=0;}).slice(0,8)});}
      return J({error:'Not available in the demo.'},503);
    }
    return realFetch(input,init);
  };

  // 3. Seed: modest, made-up trades, dated relative to today.
  function seed(todayISO){
    var T=new Date((todayISO||new Date().toISOString().slice(0,10))+'T12:00:00Z');
    var iso=function(d){return d.toISOString().slice(0,10);};
    var add=function(n){var d=new Date(T);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
    var fri=function(n){var d=new Date(T);d.setUTCDate(d.getUTCDate()+n);while(d.getUTCDay()!==5)d.setUTCDate(d.getUTCDate()+1);return iso(d);};
    var third=function(m){var d=new Date(Date.UTC(T.getUTCFullYear(),T.getUTCMonth()+m,1,12)),c=0;while(true){if(d.getUTCDay()===5&&++c===3)break;d.setUTCDate(d.getUTCDate()+1);}return iso(d);};
    var n=0,trades=[];
    var days=function(a,b){return Math.round((new Date(b)-new Date(a))/864e5);};
    var tr=function(w,tk,action,entered,o){o=o||{};var sh=o.shares||100,prem=o.premium||0,fees=o.fees!=null?o.fees:(action==='IN'||action==='OUT'?0:0.04*sh/100);
      var credit=action==='CSP'||action==='STOC'||action==='OUT'||action==='STC';
      var t={id:'dt'+(++n),wheelId:w,ticker:tk,action:action,entered:entered,expiry:o.expiry||null,strike:o.strike||null,delta:null,premium:prem,fees:fees,shares:sh,
        total:Math.round((credit?prem*sh-fees:prem*sh+fees)*100)/100,days:o.expiry?days(entered,o.expiry):0,ppd:0,verified:true,comment:'',createdAt:entered+'T15:00:00.000Z'};
      if(o.exp)t.expiredWorthless=true;trades.push(t);return t;};
    var wheels=[
      {id:'dw-ko',ticker:'KO',label:'',company:'Coca-Cola',status:'open',lastPrice:null,notes:'',createdAt:add(-120),sortOrder:1},
      {id:'dw-amd',ticker:'AMD',label:'',company:'AMD',status:'open',lastPrice:null,notes:'',createdAt:add(-70),sortOrder:2},
      {id:'dw-sofi2',ticker:'SOFI',label:'',company:'SoFi',status:'open',lastPrice:null,notes:'',createdAt:add(-5),sortOrder:3},
      {id:'dw-sofi1',ticker:'SOFI',label:'',company:'SoFi',status:'closed',lastPrice:null,notes:'',createdAt:add(-150),sortOrder:4}];
    // KO: puts that expired, then a buy back and a new put, then an open put.
    var e1=fri(-96),e2=fri(-68),e3=fri(-40),e4=fri(-12);
    tr('dw-ko','KO','CSP',add(-120),{strike:67.5,expiry:e1,premium:0.62,exp:true});
    tr('dw-ko','KO','CSP',add(days(iso(T),e1)+3),{strike:67.5,expiry:e2,premium:0.70,exp:true});
    tr('dw-ko','KO','CSP',add(days(iso(T),e2)+3),{strike:68,expiry:e3,premium:0.75});
    tr('dw-ko','KO','BTC',add(days(iso(T),e3)-3),{strike:68,expiry:e3,premium:1.40});
    tr('dw-ko','KO','CSP',add(days(iso(T),e3)-3),{strike:67,expiry:e4,premium:1.85,exp:true});
    tr('dw-ko','KO','CSP',add(-6),{strike:68,expiry:fri(12),premium:0.80});
    // AMD: a put expired, the next was assigned, then covered calls.
    var a1=fri(-52),a2=fri(-31),a3=fri(-14);
    tr('dw-amd','AMD','CSP',add(-70),{strike:150,expiry:a1,premium:3.10,exp:true});
    tr('dw-amd','AMD','CSP',add(days(iso(T),a1)+3),{strike:155,expiry:a2,premium:3.40});
    tr('dw-amd','AMD','IN',a2,{strike:155,premium:155});
    tr('dw-amd','AMD','STOC',add(days(iso(T),a2)+3),{strike:165,expiry:a3,premium:2.20,exp:true});
    tr('dw-amd','AMD','STOC',add(-10),{strike:165,expiry:fri(10),premium:2.60});
    // SOFI: assigned, covered calls, called away (closed rotation), then a fresh put.
    var s1=fri(-129),s2=fri(-108),s3=fri(-87);
    tr('dw-sofi1','SOFI','CSP',add(-150),{strike:15,expiry:s1,premium:0.32,shares:500});
    tr('dw-sofi1','SOFI','IN',s1,{strike:15,premium:15,shares:500});
    tr('dw-sofi1','SOFI','STOC',add(days(iso(T),s1)+1),{strike:16,expiry:s2,premium:0.28,shares:500,exp:true});
    tr('dw-sofi1','SOFI','STOC',add(days(iso(T),s2)+3),{strike:16,expiry:s3,premium:0.30,shares:500});
    tr('dw-sofi1','SOFI','OUT',s3,{strike:16,premium:16,shares:500});
    tr('dw-sofi2','SOFI','CSP',add(-5),{strike:15.5,expiry:fri(14),premium:0.34,shares:500});
    // LEAPs with calls sold against them (PMCC). One short call open.
    var k=0,L=function(o){var b={id:'dl'+(++k),groupId:'dg'+(o.g||k),status:'open',closePrice:null,closeDate:null,closeFees:0,qty:1,fees:0.65,markSrc:null,markAt:null,mark:null,delta:null,theta:null,iv:null,wheelId:null,notes:'',reviewDate:null,type:'C',side:'long'};for(var x in o)if(x!=='g')b[x]=o[x];return b;};
    var aapl=L({g:1,underlying:'AAPL',strike:200,expiry:third(14),entryPrice:58.00,entryDate:add(-160)});
    var msft=L({g:2,underlying:'MSFT',strike:400,expiry:third(20),entryPrice:92.00,entryDate:add(-130)});
    var c1=L({g:3,underlying:'AAPL',side:'short',parentLeapId:aapl.id,strike:250,expiry:fri(-79),entryPrice:2.10,entryDate:add(-100),status:'expired',closePrice:0,closeDate:fri(-79)});
    var c2=L({g:4,underlying:'AAPL',side:'short',parentLeapId:aapl.id,strike:255,expiry:fri(-56),entryPrice:2.40,entryDate:add(-77),status:'closed',closePrice:3.90,closeDate:add(-60),closeFees:0.65});
    var c3=L({g:9,underlying:'AAPL',side:'short',parentLeapId:aapl.id,strike:260,expiry:fri(-35),entryPrice:3.20,entryDate:add(-60),status:'expired',closePrice:0,closeDate:fri(-35)});
    var c4=L({g:5,underlying:'AAPL',side:'short',parentLeapId:aapl.id,strike:255,expiry:fri(12),entryPrice:2.30,entryDate:add(-9)});
    var c5=L({g:6,underlying:'MSFT',side:'short',parentLeapId:msft.id,strike:480,expiry:fri(-62),entryPrice:3.80,entryDate:add(-90),status:'closed',closePrice:1.10,closeDate:add(-70),closeFees:0.65});
    var c6=L({g:7,underlying:'MSFT',side:'short',parentLeapId:msft.id,strike:485,expiry:fri(-28),entryPrice:4.10,entryDate:add(-50),status:'expired',closePrice:0,closeDate:fri(-28)});
    var c7=L({g:8,underlying:'MSFT',side:'short',parentLeapId:msft.id,strike:490,expiry:fri(9),entryPrice:4.30,entryDate:add(-20),status:'closed',closePrice:1.25,closeDate:add(0),closeFees:0.65});
    return{wheels:wheels,trades:trades,opts:[aapl,msft,c1,c2,c3,c4,c5,c6,c7]};
  }
  function load(){try{var raw=localStorage.getItem(DATA_KEY);if(raw){var d=JSON.parse(raw);if(d&&Array.isArray(d.wheels)&&Array.isArray(d.trades))return{wheels:d.wheels,trades:d.trades,opts:d.opts||[]};}}catch(e){}
    var s=seed();save(s);try{localStorage.setItem('wh-returnSet',JSON.stringify({base:'caw',account:0,target:null}));}catch(e){}return s;}
  var tmr=null,pending=null;
  function save(db){pending=db;clearTimeout(tmr);tmr=setTimeout(function(){try{localStorage.setItem(DATA_KEY,JSON.stringify({wheels:pending.wheels,trades:pending.trades,opts:(pending.opts||[]).map(function(l){var o={};for(var x in l)o[x]=l[x];o.mark=null;o.markSrc=null;o.markAt=null;return o;})}));}catch(e){}},50);}
  function reset(){if(!confirm('Reset the demo? Your changes here will be cleared and the sample trades put back.'))return;
    Object.keys(window.localStorage).forEach(function(k){if(k.indexOf(PREFIX)===0)ri.call(window.localStorage,k);});location.reload();}
  var SAMPLE=function(){var M=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],d=new Date(),e=new Date();e.setDate(e.getDate()+17);while(e.getDay()!==5)e.setDate(e.getDate()+1);
    return'Symbol: SOFI\nSOFI $15 Put '+M[e.getMonth()]+' '+e.getDate()+', '+e.getFullYear()+'\nSell to Open\nFilled '+M[d.getMonth()]+' '+d.getDate()+', '+d.getFullYear()+'\n5 contracts at $0.29\nRegulatory fees $0.20';};
  window.OT_DEMO={active:true,prefix:PREFIX,key:DATA_KEY,seed:seed,load:load,save:save,reset:reset,sample:SAMPLE,spots:SPOT};
})();
