// SmartScan ticker detection: never pick a common word ("to", "open", months) over the real symbol.
const test=require('node:test');const assert=require('node:assert');
const { load } = require('./extract.js');
const { parseSmartText } = load([{kind:'const',name:'MON_PAT'},{kind:'const',name:'MON_MAP'},{kind:'fn',name:'parseSmartText'}],'function computeTotal(){return 0;}');
const cases=[
  ['SOFI $15 Put Nov 20, 2026\nSell to Open\nFilled Nov 1, 2026\n5 contracts at $0.29','SOFI'],
  ['SOFI $20 Put Nov 20\nSell to Open\nFilled Nov 3\n4 contracts at $0.30','SOFI'],
  ['SOFI $20 Put Nov 20, 2026\nSold to open Oct 29, 2026\n4 contracts at $0.30','SOFI'],
  ['SOFI $20 Put 20 Nov\nSell to Open filled 29 Oct\n4 contracts at $0.30','SOFI'],
  ['HOOD $115 Call Nov 20\nSell to Open\nFilled Oct 4 contracts at $2.14','HOOD'],
  ['SOFI $20 Nov 20 Puts\nSell to Open\nFilled Oct 29\n4 contracts at $0.30','SOFI'],
  ['SOFI $20 Put 11/20/2026 Sell to Open 4 contracts at $0.30 filled 10/29/2026','SOFI'],
  ['KO $67.5 Put Dec 19, 2026\nBuy to Close\nFilled Nov 2, 2026\n1 contract at $0.15','KO'],
  ['AAPL $255 Call Nov 13, 2026\nBuy to Close\nFilled Nov 1, 2026\n1 contract at $3.90','AAPL'],
  ['TSLA $400 Call 01/15/2027\nSell to Open\nFilled 11/01/2026\n2 contracts at $12.40','TSLA'],
  ['Symbol: SOFI\nSOFI $15 Put Nov 20, 2026\nSell to Open\nFilled Nov 1, 2026\n5 contracts at $0.29\nRegulatory fees $0.20','SOFI'],
  ['Sell to Open\nAMD $165 Call Nov 13\n1 contract at $2.60','AMD'],
  ['SOFI PUT strike: 20 qty: 4 fill price: 0.30 expiry 2026-11-20 trade date 2026-10-29 sell to open','SOFI'],
];
cases.forEach(([text,want],i)=>test(`ticker ${i+1}: ${want}`,()=>{const r=parseSmartText(text);assert.ok(r,'parsed');assert.strictEqual(r.ticker,want,text);}));
