// Sync static files from app/brand.js: manifest.json, sw.js cache prefix, <head> tags and data-brand text in index.html.
// Usage: node tools/sync-brand.js [--check]   (--check: exit 1 if anything is out of sync, change nothing)
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = path.join(__dirname, '..', 'app');
function loadBrand() { const ctx = { window: {} }; vm.runInNewContext(fs.readFileSync(path.join(APP, 'brand.js'), 'utf8'), ctx); return ctx.window.BRAND; }
function build(B, files) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const out = {};
  const man = JSON.parse(files['manifest.json']);
  Object.assign(man, { name: B.name, short_name: B.shortName, description: B.tagline, theme_color: B.accent, background_color: B.background,
    icons: [{ src: B.icons.i192, sizes: '192x192', type: 'image/png', purpose: 'any' }, { src: B.icons.i512, sizes: '512x512', type: 'image/png', purpose: 'any' }]
      .concat(B.icons.m192 ? [{ src: B.icons.m192, sizes: '192x192', type: 'image/png', purpose: 'maskable' }, { src: B.icons.m512, sizes: '512x512', type: 'image/png', purpose: 'maskable' }] : []) });
  out['manifest.json'] = JSON.stringify(man, null, 2) + '\n';
  // Renaming: remember the old cache prefix so the new service worker cleans up the old cache (data is not affected).
  let sw = files['sw.js'];
  const oldP = (/const CACHE='([a-z0-9-]+?)-v\d+'/.exec(sw) || [])[1];
  if (oldP && oldP !== B.cachePrefix) sw = sw.replace(/const LEGACY = \[([^\]]*)\];/, (m, list) => { const l = list.split(',').map(x => x.trim()).filter(Boolean); const q = `'${oldP}-'`; if (!l.includes(q)) l.push(q); return `const LEGACY = [${l.filter(x => x !== `'${B.cachePrefix}-'`).join(', ')}];`; });
  out['sw.js'] = sw.replace(/const CACHE='[a-z0-9-]+?-v(\d+)'/, (m, v) => `const CACHE='${B.cachePrefix}-v${v}'`)
    .replace(/k\.startsWith\('[a-z0-9-]+-'\)/, `k.startsWith('${B.cachePrefix}-')`);
  let h = files['index.html'];
  const title = `${B.name} — ${B.tagline}`, share = `${B.siteUrl}/${B.shareImage}`;
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(B.description)}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(share)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(B.siteUrl)}/app/">`)
    .replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(share)}">`)
    .replace(/<link rel="icon" type="image\/x-icon" href="[^"]*">/, `<link rel="icon" type="image/x-icon" href="${B.icons.favicon}">`)
    .replace(/<link rel="apple-touch-icon" href="[^"]*">/, `<link rel="apple-touch-icon" href="${B.icons.apple}">`)
    .replace(/(<link rel="icon" type="image\/png" sizes="192x192" href=")[^"]*/, `$1${B.icons.i192}`)
    .replace(/(<link rel="icon" type="image\/png" sizes="512x512" href=")[^"]*/, `$1${B.icons.i512}`)
    .replace(/(<[a-z0-9]+[^>]*data-brand="(name|tagline)"[^>]*>)([^<]*)(<)/g, (m, open, k, _t, close) => open + esc(k === 'name' ? B.name : B.tagline) + close)
    .replace(/(<[a-z0-9]+[^>]*data-brand="welcome"[^>]*>)([^<]*)(<)/g, (m, open, _t, close) => open + esc('Welcome to ' + B.name) + close);
  out['index.html'] = h;
  const brandText = x => x.replace(/(<[a-z0-9]+[^>]*data-brand="name"[^>]*>)([^<]*)(<)/g, (m, open, _t, close) => open + esc(B.name) + close);
  if (files['landing.html']) out['landing.html'] = brandText(files['landing.html'])
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(B.name + ': ' + B.tagline)}</title>`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(B.name + ': ' + B.tagline)}">`)
    .replace(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(B.shareImage)}">`)
    .replace(/<link rel="icon" href="[^"]*">/, `<link rel="icon" href="${B.icons.favicon}">`)
    .replace(/<link rel="apple-touch-icon" href="[^"]*">/, `<link rel="apple-touch-icon" href="${B.icons.apple}">`);
  if (files['legal.html']) out['legal.html'] = brandText(files['legal.html']).replace(/<title>[^<]*<\/title>/, `<title>${esc(B.name)}: privacy, terms and disclaimer</title>`);
  return out;
}
if (require.main === module) {
  const B = loadBrand(), names = ['manifest.json', 'sw.js', 'index.html', 'landing.html', 'legal.html'];
  const files = Object.fromEntries(names.map(n => [n, fs.readFileSync(path.join(APP, n), 'utf8')]));
  const out = build(B, files), diff = names.filter(n => out[n] !== files[n]);
  if (process.argv.includes('--check')) { if (diff.length) { console.log('Out of sync:', diff.join(', ')); process.exit(1); } console.log('Brand in sync'); }
  else { diff.forEach(n => fs.writeFileSync(path.join(APP, n), out[n])); console.log(diff.length ? 'Updated: ' + diff.join(', ') : 'Already in sync'); }
}
module.exports = { loadBrand, build };
