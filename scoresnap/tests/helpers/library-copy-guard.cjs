const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
// Scan all production source, including imported providers, rather than guessing
// which engine/service modules supply rendered strings. Also scan listing drafts.
function discover(dir = root) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => {
    if (/^(node_modules|\.git|__tests__|e2e|dist.*|build|coverage|reports|review)$/.test(e.name)) return [];
    const p = path.join(dir,e.name);
    const rel = path.relative(root,p).split(path.sep).join('/');
    if(e.isDirectory()) return discover(p);
    // Discover positive design fixtures independently of executable test vectors.
    if (/(?:^|\/)tests\//.test(rel) && !/\/fixtures\/.*figma.*\.json$/i.test(rel)) return [];
    return /\.(tsx?|jsx?|html|json)$/.test(p) || /(?:listing|store-listing)/i.test(rel) && /\.md$/.test(p) ? [rel] : [];
  }).sort();
}
const words = '(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)';
const count = `(?:\\d[\\d,]*|${words}(?:[ -]${words})*|\\$\\{[^}]+\\}|\\{[^}]+\\})`;
const claim = new RegExp(`(?<![a-z0-9])${count}\\s*\\+?\\s*(?:game\\s+modes?|games?|modes?|ways\\s+to\\s+play)\\b`, 'i');
const others = new RegExp(`${count}\\s*\\+?\\s*(?:others|more)\\b`, 'i');
function strings(file, source) {
  if (/\.html$/.test(file)) return [source, source.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, '')];
  if (!/\.[jt]sx?$/.test(file)) return [source];
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out=[];
  function symbolic(n) {
    if(ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) return n.text;
    if(ts.isBinaryExpression(n) && n.operatorToken.kind===ts.SyntaxKind.PlusToken) return symbolic(n.left)+symbolic(n.right);
    return '${'+n.getText(ast)+'}';
  }
  function rendered(n) {
    if(ts.isJsxText(n)) return n.text;
    if(ts.isJsxElement(n)) {
      const tag=n.openingElement.tagName.getText(ast);
      return /^(Text|span|strong|em|b|i|a|small|label)$/.test(tag) ? n.children.map(rendered).join('') : '\0';
    }
    if(ts.isJsxFragment(n)) return n.children.map(rendered).join('');
    if(ts.isJsxExpression(n)) return n.expression && (ts.isIdentifier(n.expression) || ts.isPropertyAccessExpression(n.expression)) ? `{${n.expression.getText(ast)}}` : '{expression}';
    return '';
  }
  function visit(n) {
    if(ts.isBinaryExpression(n) && n.operatorToken.kind===ts.SyntaxKind.PlusToken) out.push(symbolic(n));
    if(ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isJsxText(n)) out.push(n.text);
    else if(ts.isTemplateExpression(n)) { out.push(n.getText(ast).slice(1,-1)); return; }
    else if((ts.isJsxElement(n) || ts.isJsxFragment(n)) && n.children.some(c=>(ts.isJsxText(c) && c.text.trim()) || (ts.isJsxExpression(c) && c.expression && (ts.isIdentifier(c.expression) || ts.isPropertyAccessExpression(c.expression))))) out.push(n.children.map(rendered).join(''));
    ts.forEachChild(n,visit);
  }
  visit(ast); return out;
}
// Exact path/text/reason only; no blanket exemption for a whole contest file.
const allowlist = [
  {path:'GolfScorecardApp.jsx', text:'\n              Calculate {selected.length} Game{expression}\n            ', reason:'Number of user selected contest games'},
  {path:'GolfScorecardApp.jsx', text:'${t.games.length} Games', reason:'User tournament game total, not library inventory'},
  {path:'scoresnap/app/contest/[id]/settlement.tsx', text:'💰 ${contest.games.length} game${contest.games.length !== 1 ? "s" : ""} at $${contest.betUnit}/unit', reason:'Computed settlement for the user contest'},
];
function scan(files, checkStale = false) {
  const hits=[], used=new Set();
  for(const [file, source] of Object.entries(files)) for(const text of strings(file,source)) {
    if(!claim.test(text) && !(others.test(text) && /game|mode|library|play|skins|nassau/i.test(text))) continue;
    const i=allowlist.findIndex(a=>a.path===file && a.text===text && a.reason);
    if(i>=0) used.add(i); else hits.push({file,text});
  }
  for(let i=0;i<allowlist.length;i++) if(checkStale && !used.has(i)) hits.push({file:allowlist[i].path,text:'stale allowlist entry'});
  return hits;
}
module.exports={root,discover,scan,allowlist};
