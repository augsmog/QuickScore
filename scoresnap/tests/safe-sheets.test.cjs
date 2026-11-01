const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.join(__dirname, '..');
const boundary = 'src/ui/SafeScreen.tsx';
function walk(dir) { return fs.readdirSync(dir, {withFileTypes:true}).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : /\.[jt]sx?$/.test(e.name) ? [path.join(dir,e.name)] : []); }
test('all native modals and safe-area page boundaries use the shared implementation (no popover exceptions)', () => {
  const violations = [];
  for (const file of [...walk(path.join(root,'app')), ...walk(path.join(root,'src'))]) {
    if (file === path.join(root,boundary)) continue;
    const ast = ts.createSourceFile(file, fs.readFileSync(file,'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function visit(node) {
      if (ts.isImportDeclaration(node) && ['react-native','react-native-safe-area-context'].includes(node.moduleSpecifier.text)) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) violations.push(`${file}: namespace import can bypass boundary`);
        for (const spec of bindings?.elements || []) if (['Modal','SafeAreaView'].includes((spec.propertyName || spec.name).text)) violations.push(`${file}: ${spec.getText(ast)}`);
      }
      if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && /(^|\.)Modal$/.test(node.tagName.getText(ast))) violations.push(`${file}: raw Modal`);
      ts.forEachChild(node,visit);
    }
    visit(ast);
  }
  expect(violations).toEqual([]);
});
test('the modal owns a seeded local provider and one safe content boundary', () => {
  const s = fs.readFileSync(path.join(root,boundary),'utf8');
  expect(s).toMatch(/<Modal[^>]*>\s*<SafeAreaProvider initialMetrics=\{\{ insets, frame \}\}>\s*<SafeScreen/);
  expect(s).not.toContain('initialWindowMetrics');
});
test('page padding adds current insets only on requested edges; modal forwards close and presentation props', () => {
  const vm = require('node:vm');
  const insets = {top:59,right:0,bottom:34,left:0};
  const frame = {x:0,y:0,width:393,height:852};
  const deps = {
    './theme': {COLORS:{bg:'#fff'}},
    react: {createElement:(type,props,...children)=>({type,props,children})},
    'react-native':{Modal:'Modal',View:'View',StyleSheet:{flatten:s=>s}},
    'react-native-safe-area-context':{SafeAreaProvider:'Provider',useSafeAreaInsets:()=>insets,useSafeAreaFrame:()=>frame},
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,boundary),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,{exports,require:n=>deps[n]});
  expect(exports.SafeScreen({style:{padding:12},edges:['top','bottom']}).props.style[1]).toEqual({paddingTop:71,paddingBottom:46,paddingLeft:12,paddingRight:12});
  const close = ()=>{};
  const modal = exports.FullScreenSheet({visible:true,transparent:true,onRequestClose:close,children:'content'});
  expect(modal.props).toMatchObject({visible:true,transparent:true,onRequestClose:close});
  expect(modal.children[0].props.initialMetrics).toEqual({insets,frame});
  Object.assign(insets,{top:0,bottom:21,left:59});
  expect(exports.SafeScreen({style:{padding:0}}).props.style[1]).toEqual({paddingTop:0,paddingBottom:21,paddingLeft:59,paddingRight:0});
});
