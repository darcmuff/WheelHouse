// Lazy file-import parsers (xlsx / html / sniffing). Loaded with dynamic import() from
// importLoadFile on file pick only — not on the initial /app or /demo bundle, and not
// precached by the service worker (runtime cache after first pick).
export function importFileLib(){
  const u8s=(u,a,b)=>String.fromCharCode.apply(null,Array.prototype.slice.call(u.subarray(a,Math.min(b,u.length))));
  const has=(u,sig,o)=>{o=o||0;for(let i=0;i<sig.length;i++)if(u[o+i]!==sig[i])return false;return u.length>=o+sig.length;};
  const rd16=(u,o)=>u[o]|(u[o+1]<<8),rd32=(u,o)=>(u[o]|(u[o+1]<<8)|(u[o+2]<<16)|(u[o+3]<<24))>>>0;
  // zip central directory → [{name,method,csize,usize,off}]
  function zipEntries(u){
    let e=-1;for(let i=u.length-22;i>=Math.max(0,u.length-65600);i--){if(u[i]===0x50&&u[i+1]===0x4b&&u[i+2]===5&&u[i+3]===6){e=i;break;}}
    if(e<0)return[];
    const n=rd16(u,e+10);let o=rd32(u,e+16);const out=[];
    for(let k=0;k<n&&o+46<=u.length;k++){
      if(rd32(u,o)!==0x02014b50)break;
      const nl=rd16(u,o+28),el=rd16(u,o+30),cl=rd16(u,o+32);
      out.push({name:u8s(u,o+46,o+46+nl),method:rd16(u,o+10),csize:rd32(u,o+20),usize:rd32(u,o+24),off:rd32(u,o+42)});
      o+=46+nl+el+cl;
    }
    return out;
  }
  async function zipRead(u,ent){
    if(ent.usize>60e6)throw new Error('sheet too large');
    const ds=rd16(u,ent.off+26)+rd16(u,ent.off+28)+30+ent.off;
    const raw=u.subarray(ds,ds+ent.csize);
    if(ent.method===0)return new TextDecoder('utf-8').decode(raw);
    if(ent.method!==8)throw new Error('unsupported zip method');
    const ds2=new DecompressionStream('deflate-raw');
    const w=ds2.writable.getWriter();w.write(raw);w.close();
    const buf=await new Response(ds2.readable).arrayBuffer();
    return new TextDecoder('utf-8').decode(buf);
  }
  function sniff(u,name,mime){
    if(!u||!u.length)return{kind:'empty'};
    if(has(u,[0x25,0x50,0x44,0x46])||u8s(u,0,1024).indexOf('%PDF-')>=0)return{kind:'pdf'};
    if(has(u,[0x50,0x4b,3,4])||has(u,[0x50,0x4b,5,6])){
      const names=zipEntries(u).map(x=>x.name);
      if(names.indexOf('xl/workbook.xml')>=0)return{kind:'xlsx'};
      if(names.indexOf('xl/workbook.bin')>=0)return{kind:'xls'};
      return{kind:'zip'};
    }
    if(has(u,[0x1f,0x8b])||has(u,[0x52,0x61,0x72,0x21])||has(u,[0x37,0x7a,0xbc,0xaf]))return{kind:'zip'};
    if(has(u,[0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]))return{kind:'xls'};
    if(has(u,[0x89,0x50,0x4e,0x47])||has(u,[0xff,0xd8,0xff])||has(u,[0x47,0x49,0x46,0x38])||(has(u,[0x52,0x49,0x46,0x46])&&u8s(u,8,12)==='WEBP')||(has(u,[0x42,0x4d])&&u[6]===0&&u[7]===0&&u[8]===0&&u[9]===0)||has(u,[0x49,0x49,0x2a,0])||has(u,[0x4d,0x4d,0,0x2a]))return{kind:'image'};
    if(u8s(u,4,8)==='ftyp'&&/^(heic|heix|hevc|mif1|msf1|avif|avis|heim|heis)/.test(u8s(u,8,12)))return{kind:'image'};
    const utf16=has(u,[0xff,0xfe])||has(u,[0xfe,0xff]);
    const n=Math.min(u.length,4096);let nul=0,ctl=0,oddNul=0;
    for(let i=0;i<n;i++){const b=u[i];if(b===0){nul++;if(i&1)oddNul++;}else if(b<9||(b>13&&b<32&&b!==27))ctl++;}
    if(!utf16){
      const evenNul=nul-oddNul;
      if(nul>=n*0.3&&(oddNul>=n*0.3&&evenNul<n*0.05||evenNul>=n*0.3&&oddNul<n*0.05)){/* UTF-16 without BOM */}
      else if(nul>0||ctl>n*0.05)return{kind:'binary'};
    }
    const head=decodeText(u.subarray(0,Math.min(u.length,6000)));
    if(/^\s*(<!doctype html|<html|<\?xml|<table|<head|<body)/i.test(head)||(/<table[\s>]/i.test(head)&&/<\/tr>/i.test(head)))return{kind:'html'};
    return{kind:'text'};
  }
  function decodeText(u){
    if(has(u,[0xff,0xfe]))return new TextDecoder('utf-16le').decode(u.subarray(2));
    if(has(u,[0xfe,0xff]))return new TextDecoder('utf-16be').decode(u.subarray(2));
    if(has(u,[0xef,0xbb,0xbf]))return new TextDecoder('utf-8').decode(u.subarray(3));
    let nul=0;const n=Math.min(u.length,2000);for(let i=0;i<n;i++)if(u[i]===0)nul++;
    if(n>1&&nul>=n*0.3){let odd=0;for(let i=1;i<n;i+=2)if(u[i]===0)odd++;return new TextDecoder(odd>=nul/2?'utf-16le':'utf-16be').decode(u);}
    try{return new TextDecoder('utf-8',{fatal:true}).decode(u);}catch(e){return new TextDecoder('windows-1252').decode(u);}
  }
  const ent=t=>String(t).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(m,g)=>{
    g=g.toLowerCase();if(g==='amp')return'&';if(g==='lt')return'<';if(g==='gt')return'>';if(g==='quot')return'"';if(g==='apos')return"'";if(g==='nbsp')return' ';
    const c=g[1]==='x'?parseInt(g.slice(2),16):parseInt(g.slice(1),10);try{return String.fromCodePoint(c);}catch(e){return'';}});
  const q=c=>/[",\n\r]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;
  const toCSV=rows=>rows.map(r=>r.map(c=>q(String(c==null?'':c).trim())).join(',')).join('\n');
  // ── xlsx ──
  const colIx=ref=>{const m=/^([A-Z]+)/.exec(ref);let n=0;for(const ch of m?m[1]:'A')n=n*26+ch.charCodeAt(0)-64;return n-1;};
  const attr=(a,n)=>{const m=new RegExp('\\b'+n+'="([^"]*)"').exec(a);return m?ent(m[1]):null;};
  const textOf=x=>{let o='';x=x.replace(/<rPh\b[\s\S]*?<\/rPh>/g,'');x.replace(/<t\b[^>]*>([\s\S]*?)<\/t>/g,(m,t)=>{o+=ent(t);return m;});return o;};
  const BUILTIN_DATE={14:1,15:1,16:1,17:1,18:1,19:1,20:1,21:1,22:1,27:1,28:1,29:1,30:1,31:1,32:1,33:1,34:1,35:1,36:1,45:1,46:1,47:1,50:1,51:1,52:1,53:1,54:1,55:1,56:1,57:1,58:1};
  const isDateCode=c=>{c=String(c).replace(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*./g,'');return/[dmyhs]/i.test(c)&&!/^general$/i.test(c);};
  const serial=(v,d1904)=>{
    let days=Math.floor(v);const fr=v-days;if(d1904)days+=1462;
    const ms=Date.UTC(1899,11,30)+days*86400000;const dt=new Date(ms);
    const p=n=>String(n).padStart(2,'0');
    let o=`${dt.getUTCFullYear()}-${p(dt.getUTCMonth()+1)}-${p(dt.getUTCDate())}`;
    if(fr>0.00001){const sec=Math.round(fr*86400);o+=` ${p(Math.floor(sec/3600)%24)}:${p(Math.floor(sec/60)%60)}:${p(sec%60)}`;}
    return o;
  };
  async function xlsxSheets(u){
    const E=zipEntries(u),by={};E.forEach(x=>{by[x.name]=x;});
    const get=async n=>by[n]?zipRead(u,by[n]):'';
    const wbx=await get('xl/workbook.xml');
    if(!wbx)throw new Error('not a workbook');
    const rels=await get('xl/_rels/workbook.xml.rels'),relTo={};
    rels.replace(/<Relationship\b([^>]*)\/?>/g,(m,a)=>{const id=attr(a,'Id'),t=attr(a,'Target');if(id&&t)relTo[id]=t;return m;});
    const d1904=/<workbookPr\b[^>]*date1904="(1|true)"/.test(wbx);
    const sst=[];(await get('xl/sharedStrings.xml')).replace(/<si\b[^>]*>([\s\S]*?)<\/si>/g,(m,x)=>{sst.push(textOf(x));return m;});
    const sx=await get('xl/styles.xml'),codes={};
    sx.replace(/<numFmt\b([^>]*)\/?>/g,(m,a)=>{codes[attr(a,'numFmtId')]=attr(a,'formatCode');return m;});
    const xfs=[];const cx=/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(sx);
    if(cx)cx[1].replace(/<xf\b([^>]*?)(?:\/>|>)/g,(m,a)=>{const id=attr(a,'numFmtId');xfs.push(BUILTIN_DATE[id]||(codes[id]!=null&&isDateCode(codes[id]))?1:0);return m;});
    const out=[];const shs=[];
    wbx.replace(/<sheet\b([^>]*)\/?>/g,(m,a)=>{shs.push({name:attr(a,'name')||'Sheet',rid:attr(a,'r:id')});return m;});
    for(const sh of shs){
      let t=relTo[sh.rid]||'';t=t.replace(/^\//,'');const path=t.startsWith('xl/')?t:'xl/'+t;
      const xml=await get(path);const rows=[];
      xml.replace(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g,(m,body)=>{
        if(rows.length>=50000||body==null)return m;
        const r=[];
        body.replace(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,(mm,a,inner)=>{
          const ix=colIx(attr(a,'r')||'A'),t=attr(a,'t'),s=+(attr(a,'s')||0);let v='';inner=inner||'';
          const vm=/<v\b[^>]*>([\s\S]*?)<\/v>/.exec(inner);
          if(t==='s')v=vm?(sst[+vm[1]]||''):'';
          else if(t==='inlineStr')v=textOf(inner);
          else if(t==='str'||t==='d')v=vm?ent(vm[1]):'';
          else if(t==='b')v=vm&&vm[1]==='1'?'TRUE':'FALSE';
          else if(t==='e')v='';
          else if(vm&&vm[1]!==''){const x=parseFloat(vm[1]);v=isNaN(x)?vm[1]:xfs[s]?serial(x,d1904):String(+x.toPrecision(12));}
          while(r.length<ix)r.push('');r[ix]=v;return mm;
        });
        if(r.some(c=>c!==''))rows.push(r);
        return m;
      });
      out.push({name:sh.name,text:toCSV(rows),cells:rows.reduce((a,r)=>a+r.filter(Boolean).length,0)});
    }
    return out;
  }
  // Pick the sheet that actually parses as trades (scorer → number of trades); else the biggest sheet
  async function xlsxToText(u,scorer){
    const sh=await xlsxSheets(u);if(!sh.length)return'';
    let best=null,bs=0;
    sh.forEach(x=>{let s=0;try{s=scorer?+scorer(x.text)||0:0;}catch(e){}if(s>bs){bs=s;best=x;}});
    if(!best)best=sh.slice().sort((a,b)=>b.cells-a.cells)[0];
    return best.text;
  }
  // Saved web page / copied table → CSV of the biggest <table> (or plain text)
  function htmlToText(html){
    html=String(html||'').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi,'');
    const tables=[];html.replace(/<table\b[\s\S]*?<\/table>/gi,m=>{tables.push(m);return m;});
    const toRows=t=>{const rows=[];t.replace(/<tr\b[\s\S]*?<\/tr>/gi,tr=>{const c=[];tr.replace(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi,(m,x)=>{c.push(ent(x.replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim());return m;});if(c.some(Boolean))rows.push(c);return tr;});return rows;};
    let best=[];tables.forEach(t=>{const r=toRows(t);if(r.length>best.length)best=r;});
    if(best.length>=2)return toCSV(best);
    return ent(html.replace(/<(br|\/p|\/div|\/tr|\/li|\/h\d)\b[^>]*>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n+/g,'\n').trim();
  }
  const MSG={
    image:"That looks like a picture or screenshot, and OpTrack can't read trades from images yet. Export your activity as a CSV or PDF from your broker, or copy the rows and paste them into the box below.",
    xls:"That's an old-style Excel file (.xls / .xlsb). Open it in Excel or Sheets, choose Save As → CSV (or .xlsx), then pick the new file.",
    zip:"That's a zip or compressed file. Unzip it and pick the CSV, Excel or PDF file inside.",
    binary:"That doesn't look like a trade export: it isn't a CSV, Excel, PDF or text file. Export your activity from your broker as a CSV or PDF and try again.",
    empty:"That file is empty. Export your activity again from your broker and pick the new file."
  };
  return{sniff,decodeText,xlsxSheets,xlsxToText,htmlToText,message:k=>MSG[k]||MSG.binary,zipEntries};
}
