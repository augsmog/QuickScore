// COPY TEXT guard: scans literal source/HTML/JSX/Markdown/JSON copy in source order.
// Normalizes whitespace, entities and Unicode; joins adjacent text nodes/elements.
// Out of scope: CSS/flex/grid visual order, direction reversal, absolute positioning,
// and JSX child reordering. This is not a screen-layout or rendered-output guard.
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
// WHATWG named character references, generated from Python 3 html.entities.html5.
// Checked in so the guard needs no additional runtime dependency.
const namedEntities = require('./html-named-entities.json');
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
  return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z][a-z0-9]+));/gi,(entity,hex,decimal,name)=>{
      if(name)return Object.hasOwn(namedEntities,name) ? namedEntities[name] : entity;
      const code=hex ? parseInt(hex,16) : Number(decimal);
      return code>0 && code<=0x10ffff && !(code>=0xd800 && code<=0xdfff)
        ? String.fromCodePoint(code) : '\ufffd';
    })
    .normalize('NFKC').replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g,'')
    .replace(/\s+/g,' ').trim();
}
const noun = '(?:golf\\s+)?(?:game(?:\\s+modes?)?s?|modes?|ways(?:\\s+to\\s+play)?|formats?|variants?|side\\s+games?|contests?)\\b';
const number = '(?:\\d+(?:[.,]\\d+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[ -]+(?:one|two|three|four|five|six|seven|eight|nine|hundred|thousand))*';
// Count modifiers are open-ended; stop at grammatical boundaries so instructions
// such as "one preset for each game" and "STEP 02 Select Game Modes" stay valid.
const modifier = '(?!(?:and|or|for|from|in|of|on|per|to|with|each|select)\\b)[a-z-]+\\s+';
const badCount = new RegExp('\\b(?:over\\s+|more\\s+than\\s+)?'+number+'\\s*\\+?\\s*(?:'+modifier+')*'+noun,'i');
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
    function value(n, seen=new Set(), separator='') {
      if(!n)return '';
      if(ts.isStringLiteralLike(n)||ts.isJsxText(n)||ts.isNumericLiteral(n))return n.text;
      if(ts.isParenthesizedExpression(n)||ts.isAsExpression(n))return value(n.expression,seen,separator);
      if(ts.isIdentifier(n)&&bindings.has(n.text)&&!seen.has(n.text)){return value(bindings.get(n.text),new Set([...seen,n.text]),separator);}
      if(ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text==='join') {
        let array=n.expression.expression, visited=new Set(seen);
        while(ts.isIdentifier(array)&&bindings.has(array.text)&&!visited.has(array.text)) {
          visited.add(array.text); array=bindings.get(array.text);
        }
        if(ts.isArrayLiteralExpression(array)) {
          const delimiter=n.arguments.length ? value(n.arguments[0],seen,separator) : ',';
          return array.elements.map(e=>value(e,visited,separator)).join(delimiter);
        }
      }
      if(ts.isJsxExpression(n))return value(n.expression,seen,separator);
      if(ts.isJsxElement(n)||ts.isJsxFragment(n)) {
        // Do not turn an approved inline phrase into a synthetic near-miss.
        if(separator===' ' && normalize(value(n,seen,''))==='50+ game modes')return '50+ game modes';
        return n.children.map(c=>value(c,seen,separator)).join(separator);
      }
      if(ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken)return value(n.left,seen,separator)+value(n.right,seen,separator);
      if(ts.isTemplateExpression(n))return n.head.text+n.templateSpans.map(s=>value(s.expression,seen,separator)+s.literal.text).join('');
      const expr=n.getText(n.getSourceFile());
      const allowed=contestCounts.findIndex(([p,e])=>p===file&&e===expr);
      if(allowed>=0){used.add(allowed);return 'current';}
      return expr.includes('PLAYABLE_GAME_COUNT') ? '{PLAYABLE_GAME_COUNT}' : /^[\w.]+$/.test(expr) && /count|length|total|number/i.test(expr) ? '{dynamic}' : '|';
    }
    function check(s,n){if(invalid(s))errors.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line+1}: ${normalize(s).slice(0,180)}`);}
    function visit(n){
      // Preserve inline text adjacency; also inspect separate sibling labels.
      if(ts.isJsxElement(n)||ts.isJsxFragment(n))check(value(n,new Set(),' '),n);
      if(ts.isCallExpression(n)||ts.isStringLiteralLike(n)||ts.isTemplateExpression(n)||ts.isJsxElement(n)||ts.isJsxFragment(n)||ts.isBinaryExpression(n)&&n.operatorToken.kind===ts.SyntaxKind.PlusToken)check(value(n),n);
      ts.forEachChild(n,visit);
    }
    const isMarkup=/\.(html|md|txt)$/.test(file);
    {
      if(!isMarkup) {visit(sf);continue;}
      const copySource=source;
      // Inline tags contribute no characters; block boundaries contribute whitespace.
      const text=copySource.replace(/<\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|td|th|tr|ul)\b[^>]*>/gi,' ').replace(/<[^>]*>/g,'');
      check(text,sf);
      // Also detect separate labels, without inventing a near-miss from approved inline text.
      // Mask only each approved phrase's source span, preserving unrelated labels.
      const html=normalize(copySource), offsets=[];
      let visible='';
      for(const match of html.matchAll(/<[^>]*>|[^<]+|</g)) {
        if(match[0].startsWith('<') && match[0].endsWith('>'))continue;
        for(let i=0;i<match[0].length;i++) {
          visible+=match[0][i]; offsets.push(match.index+i);
        }
      }
      let separated=html;
      const approved=[...visible.matchAll(/\b50\+ game modes\b/g)];
      for(const match of approved.reverse()) {
        const start=offsets[match.index], end=offsets[match.index+match[0].length-1]+1;
        separated=separated.slice(0,start)+' approved '+separated.slice(end);
      }
      check(separated.replace(/<[^>]*>/g,' '),sf);
    }
  }
  for(let i=0;i<contestCounts.length;i++)if(!used.has(i))errors.push(`Stale contest allowlist: ${contestCounts[i].join(': ')}`);
  return [...new Set(errors)];
}
module.exports={inventory,scan,invalid};
