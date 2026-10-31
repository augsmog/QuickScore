const fs = require('fs');
const path = require('path');
const ts = require('typescript');
// Discover new sources rather than maintaining a list of current filenames.
function inventory(root) {
  const result = [];
  function walk(dir) {
    for (const item of fs.readdirSync(dir, {withFileTypes:true})) {
      const file = path.join(dir,item.name), rel = path.relative(root,file).replaceAll('\\','/');
      if (item.isDirectory()) {
        if (!/^(node_modules|\.git|dist[^/]*|build|coverage|__tests__)$/.test(item.name)) walk(file);
      } else if (/\.(tsx?|jsx?|html|json|md|txt)$/i.test(file) && (
        /^(scoresnap\/)?(src|app|components|supabase\/functions|web|site|public)\//.test(rel) ||
        (!rel.includes('/') && /\.(jsx?|html)$/.test(rel) && !/dashboard/i.test(rel)) ||
        /(?:store[-_]?listing|app[-_]?store|listing[-_]?draft)/i.test(rel) ||
        /^scoresnap\/tests\/fixtures\/.*figma.*\.json$/.test(rel)
      )) result.push(rel);
    }
  }
  walk(root); return result.sort();
}
function normalize(s) {
  return s.replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n))
    .replace(/&(nbsp|amp|quot|apos|lt|gt);/gi,(_,n)=>({nbsp:' ',amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'}[n.toLowerCase()]))
    .replace(/\s+/g,' ').trim();
}
const noun = '(?:golf\\s+)?(?:game(?:\\s+modes?)?s?|modes?|ways(?:\\s+to\\s+play)?|formats?|variants?|side\\s+games?|contests?)\\b';
const number = '(?:\\d+(?:[.,]\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[ -]+(?:one|two|three|four|five|six|seven|eight|nine|hundred|thousand))*';
const badCount = new RegExp('\\b(?:over\\s+|more\\s+than\\s+)?'+number+'\\s*\\+?\\s*(?:(?:core|active|different|playable|base)\\s+)?'+noun,'i');
function invalid(s) {
  s=normalize(s);
  if(/\b(?:over|more than)\s+50\+ game modes\b/i.test(s))return true;
  s=s.replace(/\b50\+ game modes\b/g,'');
  return badCount.test(s) || new RegExp('\\b(?:dozens?(?: of)?|tons of|endless|every)\\s+'+noun,'i').test(s) ||
    /\ba library of\s+\S+|PLAYABLE_GAME_COUNT/i.test(s) ||
    new RegExp('\\{[^{}]+\\}\\s*(?:active\\s+)?'+noun,'i').test(s);
}
// Only these exact expressions describe a user's current contest, never inventory.
const contestCounts = [
  ['GolfScorecardApp.jsx','t.games.length','MiniStat current contest total'],
  ['GolfScorecardApp.jsx','tournament.games.length','settlement current contest total'],
  ['GolfScorecardApp.jsx','selected.length','selected contest games'],
  ['scoresnap/app/contest/[id]/settlement.tsx','contest.games.length','recap selected contest games'],
];
function scan(root) {
  const errors=[], used=new Set();
  for(const file of inventory(root)) {
    const source=fs.readFileSync(path.join(root,file),'utf8');
    const sf=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,/\.[jt]sx$/.test(file)?ts.ScriptKind.TSX:ts.ScriptKind.TS);
    const bindings=new Map();
    function collect(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer)bindings.set(n.name.text,n.initializer);ts.forEachChild(n,collect);} collect(sf);
    for(const statement of sf.statements) {
      if(!ts.isImportDeclaration(statement) || !statement.moduleSpecifier.text.startsWith('.') ||
        !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
      const base=path.resolve(path.dirname(path.join(root,file)),statement.moduleSpecifier.text);
      const target=['.ts','.tsx','.js','.jsx'].map(e=>base+e).find(p=>fs.existsSync(p));
      if(!target)continue;
      const imported=ts.createSourceFile(target,fs.readFileSync(target,'utf8'),ts.ScriptTarget.Latest,true);
      const exports=new Map();
      function collectImported(n){if(ts.isVariableDeclaration(n)&&ts.isIdentifier(n.name)&&n.initializer)exports.set(n.name.text,n.initializer);ts.forEachChild(n,collectImported);} collectImported(imported);
      for(const named of statement.importClause.namedBindings.elements){const initializer=exports.get((named.propertyName||named.name).text);if(initializer)bindings.set(named.name.text,initializer);}
    }
    function value(n, seen=new Set()) {
      if(!n)return '';
      if(ts.isStringLiteralLike(n)||ts.isJsxText(n)||ts.isNumericLiteral(n))return n.text;
      if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n))return value(n.expression,seen);
      if(ts.isIdentifier(n)&&bindings.has(n.text)&&!seen.has(n.text)){return value(bindings.get(n.text),new Set([...seen,n.text]));}
      if(ts.isJsxExpression(n))return value(n.expression,seen);
      if(ts.isJsxElement(n)||ts.isJsxFragment(n))return n.children.map(c=>value(c,seen)).join(' ');
      if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken)return value(n.left,seen)+value(n.right,seen);
      if(ts.isTemplateExpression(n))return n.head.text+n.templateSpans.map(s=>value(s.expression,seen)+s.literal.text).join('');
      const expr=n.getText(n.getSourceFile());
      const allowed=contestCounts.findIndex(([p,e])=>p===file&&e===expr);
      if(allowed>=0){used.add(allowed);return 'current';}
      return expr.includes('PLAYABLE_GAME_COUNT') ? '{PLAYABLE_GAME_COUNT}' : /^[\w.]+$/.test(expr) && /count|length|total|number/i.test(expr) ? '{dynamic}' : '|';
    }
    function check(s,n){if(invalid(s))errors.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1}: ${normalize(s).slice(0,180)}`);}
    function visit(n){
      if(ts.isStringLiteralLike(n)||ts.isTemplateExpression(n)||ts.isJsxElement(n)||ts.isJsxFragment(n)||ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken)check(value(n),n);
      ts.forEachChild(n,visit);
    }
    if(/\.(html|md|txt)$/.test(file))check(source.replace(/<[^>]*>/g,' '),sf); else visit(sf);
  }
  for(let i=0;i<contestCounts.length;i++)if(!used.has(i))errors.push(`Stale contest allowlist: ${contestCounts[i].join(': ')}`);
  return [...new Set(errors)];
}
module.exports={inventory,scan,invalid};
