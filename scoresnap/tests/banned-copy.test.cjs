const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const banned = /\b(?:bets?|betting|wager\w*|gambl\w*|payout\w*|winnings|cleaned up|unlock\w*)\b/i;
// Internal Nassau ledger discriminator, never rendered as copy.
const internal = n => n.text === 'bets' && ts.isBinaryExpression(n.parent) && n.parent.operatorToken.kind === ts.SyntaxKind.InKeyword;
function scan(root) {
 const hits=[];
 function walk(dir) { for(const e of fs.readdirSync(dir,{withFileTypes:true})) {
 if(/^(?:__tests__|tests|e2e)$/.test(e.name)) continue;
 const file=path.join(dir,e.name);
 if(e.isDirectory()) walk(file);
 else if(/\.tsx?$/.test(file) && !/\.(test|spec)\./.test(file)) {
 const s=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
 function visit(n) {
 if(ts.isImportDeclaration(n)||ts.isExportDeclaration(n)||ts.isTypeNode(n)) return;
 if((ts.isStringLiteralLike(n)||ts.isJsxText(n)||ts.isTemplateHead(n)||ts.isTemplateMiddle(n)||ts.isTemplateTail(n))&&banned.test(n.text)&&!internal(n)) hits.push(`${path.relative(root,file)}:${s.getLineAndCharacterOfPosition(n.getStart(s)).line+1}: ${n.text.trim()}`);
 ts.forEachChild(n,visit);
 } visit(s);
 }
 }}
 for(const dir of ['app','src']) walk(path.join(root,dir));
 return hits;
}
test('shipped copy avoids banned language',()=>expect(scan(process.env.COPY_SCAN_ROOT||process.cwd())).toEqual([]));
