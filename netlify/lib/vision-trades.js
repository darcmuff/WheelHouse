// Stage 2 screenshot importer: pure helpers shared by netlify/functions/vision-import.js and its tests.
// No I/O here. Images are never stored or logged anywhere (see NOTES.md, "Screenshot import privacy").
const MODEL = 'claude-haiku-5-5';
const CAPS = { free: 5, pro: 50 };          // vision calls per uid per UTC day (every call counts, including failures)
const MAX_B64 = 1500000;                    // base64 characters of the one image (~1.1 MB of JPEG) after client compression
const MAX_IMAGES = 1;                       // one screenshot per call and per import
const ACTIONS = ['sell_to_open', 'buy_to_close', 'buy_to_open', 'sell_to_close'];
const FIELDS = ['ticker', 'trade_date', 'action', 'option_type', 'strike', 'expiry', 'quantity', 'price', 'fees', 'total'];

const N = t => ({ anyOf: [{ type: t }, { type: 'null' }] });
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['is_trade_screenshot', 'broker', 'trades', 'note'],
  properties: {
    is_trade_screenshot: { type: 'boolean', description: 'true only if the image shows option trade fills or orders from a brokerage app or site' },
    broker: N('string'),
    note: N('string'),
    trades: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: FIELDS.concat('uncertain_fields'),
      properties: {
        ticker: N('string'),
        trade_date: Object.assign(N('string'), { description: 'Fill/trade date as YYYY-MM-DD. If the year is not visible, --MM-DD. null if not visible.' }),
        action: { anyOf: [{ type: 'string', enum: ACTIONS }, { type: 'null' }] },
        option_type: { anyOf: [{ type: 'string', enum: ['put', 'call'] }, { type: 'null' }] },
        strike: N('number'),
        expiry: Object.assign(N('string'), { description: 'Option expiration as YYYY-MM-DD, or --MM-DD if the year is not visible. null if not visible.' }),
        quantity: Object.assign(N('integer'), { description: 'Number of contracts' }),
        price: Object.assign(N('number'), { description: 'Fill price per share (premium), as shown' }),
        fees: Object.assign(N('number'), { description: 'Fees/commission as shown; null if not shown' }),
        total: Object.assign(N('number'), { description: 'Total credit or debit as shown, positive number; null if not shown' }),
        uncertain_fields: { type: 'array', items: { type: 'string', enum: FIELDS } }
      }
    } }
  }
};
const SYSTEM_PROMPT = [
  'You read screenshots of brokerage apps (Robinhood, Webull, Schwab, IBKR, Fidelity, E*Trade, Tastytrade and others) and extract filled stock OPTION trades only.',
  'Return one entry per filled option trade/leg visible. Ignore stock or crypto trades, dividends, transfers, cancelled or unfilled orders, and account balances.',
  'Copy values exactly as shown. Never guess or compute a value that is not visible: use null instead.',
  'Dates as YYYY-MM-DD; if the year is not shown write --MM-DD. Ticker is the underlying symbol in capitals.',
  'List a field in uncertain_fields if it is blurry, cut off or ambiguous.',
  'If the picture is not a broker screen with option trades, set is_trade_screenshot to false and trades to [].'
].join(' ');

const pad = n => String(n).padStart(2, '0');
const utcDay = ms => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
function realDate(y, m, d) { const t = Date.UTC(y, m - 1, d); const x = new Date(t); return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d ? t : NaN; }
// 'YYYY-MM-DD' → {iso, ms}; '--MM-DD' → {md:[m,d]}; anything else → null
function parseDate(s) {
  if (typeof s !== 'string') return null; s = s.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) { const t = realDate(+m[1], +m[2], +m[3]); return isNaN(t) ? null : { iso: s, ms: t }; }
  m = /^-{0,2}(\d{2})-(\d{2})$/.exec(s);
  if (m && !isNaN(realDate(2024, +m[1], +m[2]))) return { md: [+m[1], +m[2]] };
  return null;
}
const iso = t => utcDay(t);
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function sniffMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

function quotaDecision(usage, tier, nowMs) {
  const day = utcDay(nowMs), cap = tier === 'pro' ? CAPS.pro : CAPS.free;
  const cur = usage && usage.day === day ? (+usage.count || 0) : 0;
  return cur >= cap ? { allowed: false, day, count: cur, cap } : { allowed: true, day, count: cur + 1, cap };
}

// Deterministic validation of the model's JSON. Never fills a missing value; marks it instead.
function normalizeTrades(j, nowMs) {
  if (!j || typeof j !== 'object' || Array.isArray(j) || typeof j.is_trade_screenshot !== 'boolean' || !Array.isArray(j.trades)) throw new Error('malformed AI response');
  const today = utcDay(nowMs);
  const rows = j.is_trade_screenshot ? j.trades.slice(0, 60).map(t => {
    t = t && typeof t === 'object' ? t : {};
    const missing = [], uncertain = [];
    const unc = Array.isArray(t.uncertain_fields) ? t.uncertain_fields : [];
    const map = { ticker: 'ticker', trade_date: 'date', action: 'action', option_type: 'put/call', strike: 'strike', expiry: 'expiry', quantity: 'quantity', price: 'price', fees: 'fees', total: 'total' };
    unc.forEach(f => { if (map[f] && !uncertain.includes(map[f])) uncertain.push(map[f]); });
    let ticker = typeof t.ticker === 'string' ? t.ticker.trim().toUpperCase() : null;
    if (!ticker || !/^[A-Z]{1,6}(\.[A-Z]{1,2})?$/.test(ticker)) { missing.push('ticker'); ticker = null; }
    let date = null; const pd = parseDate(t.trade_date);
    if (pd && pd.iso) { date = pd.iso; if (pd.iso > today) uncertain.push('date'); }
    else if (pd && pd.md) { // year not shown: latest year that is not in the future, marked as assumed
      let y = +today.slice(0, 4); if (realDate(y, pd.md[0], pd.md[1]) > Date.parse(today + 'T00:00:00Z')) y--;
      date = iso(realDate(y, pd.md[0], pd.md[1])); uncertain.push('year');
    } else missing.push('date');
    const action = ACTIONS.includes(t.action) ? t.action : null; if (!action) missing.push('action');
    const type = t.option_type === 'put' || t.option_type === 'call' ? t.option_type : null; if (!type) missing.push('put/call');
    let strike = num(t.strike); if (strike === null || strike <= 0) { missing.push('strike'); strike = null; }
    let expiry = null; const pe = parseDate(t.expiry);
    if (pe && pe.iso) expiry = pe.iso;
    else if (pe && pe.md) { let y = date ? +date.slice(0, 4) : +today.slice(0, 4); if (date && iso(realDate(y, pe.md[0], pe.md[1])) < date) y++; expiry = iso(realDate(y, pe.md[0], pe.md[1])); if (!uncertain.includes('year')) uncertain.push('year'); }
    else missing.push('expiry');
    if (expiry && date && expiry < date && !uncertain.includes('expiry')) uncertain.push('expiry');
    let qty = t.quantity; if (!(Number.isInteger(qty) && qty > 0)) { missing.push('quantity'); qty = null; }
    let price = num(t.price); if (price === null || price < 0) { missing.push('price'); price = null; }
    let fees = t.fees === null || t.fees === undefined ? null : num(t.fees); if (t.fees !== null && t.fees !== undefined && (fees === null || fees < 0)) { missing.push('fees'); fees = null; }
    let total = t.total === null || t.total === undefined ? null : num(t.total); if (total !== null) total = Math.abs(total);
    if (total !== null && qty && price !== null) { const exp = qty * 100 * price; if (Math.abs(total - exp) > Math.max(1, (fees || 0) + 1, exp * 0.02) && !uncertain.includes('total')) uncertain.push('total'); }
    return { ticker, date, action, type, strike, expiry, qty, price, fees, total, missing, uncertain, ok: !missing.length && !uncertain.length };
  }) : [];
  return { notTrade: !rows.length, broker: typeof j.broker === 'string' ? j.broker.slice(0, 40) : null, rows };
}

function anthropicBody(b64, mediaType) {
  return {
    model: MODEL, max_tokens: 3000, system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: b64 } }, { type: 'text', text: 'Extract the filled option trades from this broker screenshot.' }] }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } }
  };
}
module.exports = { MODEL, CAPS, MAX_B64, MAX_IMAGES, ACTIONS, SCHEMA, SYSTEM_PROMPT, utcDay, parseDate, sniffMime, quotaDecision, normalizeTrades, anthropicBody };
