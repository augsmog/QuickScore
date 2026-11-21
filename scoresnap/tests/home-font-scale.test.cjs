const fs=require('fs'),ts=require('typescript'),React=require('react'),{act,create}=require('react-test-renderer');
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const source=fs.readFileSync(process.env.HOME_SOURCE || 'app/(tabs)/index.tsx','utf8');
const ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const texts=[];
function visit(n){if(ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='Text'&&/Build contests\. Settle up\.|Add your group, pick your games/.test(n.children.map(c=>c.getText(ast)).join('')))texts.push(n.getText(ast));ts.forEachChild(n,visit);}visit(ast);
function renderHero(fontScale){
 // Compile both exact source nodes separately; retain original styles and keys.
 return texts.map(text=>{const m={exports:{}};const js=ts.transpileModule('module.exports=('+text+');',{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS}}).outputText;new Function('require','module','exports','fontScale','Text','FONTS','COLORS',js)(require,m,m.exports,fontScale,'Text',{headline:'headline',regular:'regular'},{text:'text',textDim:'dim'});return m.exports;});
}
test('both hero nodes invalidate native text identity on actual scale changes, including return to normal',()=>{
 expect(texts).toHaveLength(2);let root;
 act(()=>{root=create(React.createElement(React.Fragment,null,...renderHero(1)))});
 for(const scale of [1.235,1.353,1,2]){
  const before=root.root.findAllByType('Text');
  act(()=>root.update(React.createElement(React.Fragment,null,...renderHero(scale))));
  const after=root.root.findAllByType('Text');expect(after[0]).not.toBe(before[0]);expect(after[1]).not.toBe(before[1]);
 }
 const before=root.root.findAllByType('Text');act(()=>root.update(React.createElement(React.Fragment,null,...renderHero(2))));expect(root.root.findAllByType('Text')[0]).toBe(before[0]);
});
test('normal typography and unrestricted scaling/wrapping remain unchanged at all scales',()=>{
 for(const scale of [1,1.235,1.353,2]){
  const [title,body]=renderHero(scale);
  expect(title.props.style).toEqual({fontFamily:'headline',fontSize:28,color:'text',marginBottom:8,lineHeight:34});
  expect(body.props.style).toEqual({fontFamily:'regular',fontSize:14,color:'dim',lineHeight:20,marginBottom:20});
  for(const t of [title,body]){expect(t.props.numberOfLines).toBeUndefined();expect(t.props.maxFontSizeMultiplier).toBeUndefined();expect(t.props.allowFontScaling).not.toBe(false);expect(t.props.style.height).toBeUndefined();}
 }
 expect(source).toContain('const { width, fontScale } = useWindowDimensions()');
});
