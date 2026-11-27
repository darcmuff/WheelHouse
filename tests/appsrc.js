// Combined app source (shell HTML + extracted module + CSS) so tests keep
// matching the live code after app.js / app.css were split out of index.html.
const fs = require('fs'), path = require('path');
const A = path.join(__dirname, '..', 'app');
function appHtml() { return fs.readFileSync(path.join(A, 'index.html'), 'utf8'); }
function appJs() { return fs.readFileSync(path.join(A, 'app.js'), 'utf8'); }
function appCss() { return fs.readFileSync(path.join(A, 'app.css'), 'utf8'); }
function appSrc() { return appHtml() + '\n' + appJs() + '\n' + appCss(); }
module.exports = { A, appSrc, appHtml, appJs, appCss };
