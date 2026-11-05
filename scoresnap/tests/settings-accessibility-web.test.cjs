const fs=require('node:fs'), ts=require('typescript'), React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
const RNW=require('react-native-web');
function rows(){
 const source=fs.readFileSync('app/settings.tsx','utf8')+'\nexport { ToggleRow, PickerRow, NumberRow };';
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 new Function('require','module','exports',compiled)(id=>{
  if(id==='react')return React;
  if(id==='react/jsx-runtime')return require(id);
  if(id==='react-native')return RNW;
  if(id.endsWith('/AnimatedPressable'))return {AnimatedPressable:RNW.Pressable};
  if(id.endsWith('/theme'))return {COLORS:{primary:'#000',text:'#000',textDim:'#444'},FONTS:{},RADII:{}};
  if(id==='lucide-react-native')return new Proxy({},{get:()=>()=>null});
  return {};
 },module,module.exports);
 return module.exports;
}
test.each([false,true])('real RNW ToggleRow has exactly one named switch, no unnamed outer tab stop (%s)',value=>{
 const {ToggleRow}=rows();
 const html=renderToStaticMarkup(React.createElement(ToggleRow,{label:'Show Net Scores',value,onToggle:()=>{}}));
 expect((html.match(/role="switch"/g)||[])).toHaveLength(1);
 expect(html).toContain('aria-label="Show Net Scores"');
 const input=html.match(/<input[^>]*>/)[0];
 expect(input.includes('checked=""')).toBe(value);
});
test.each(['PickerRow','NumberRow'])('real RNW %s retains accessible current value',kind=>{
 const Row=rows()[kind];
 const html=renderToStaticMarkup(React.createElement(Row,{label:'Distance Unit',value:'yards',displayValue:'Yards',options:[],onSelect:()=>{},onPress:()=>{}}));
 const button=html.match(/<button[^>]*>/)[0];
 expect(button).toMatch(/aria-label="[^"]*(?:Yards|yards)/);
});
