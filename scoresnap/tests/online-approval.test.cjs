const fs=require('node:fs'),ts=require('typescript');
test('web host approval confirms then calls decide; cancel leaves membership unchanged',async()=>{
 const decide=jest.fn(async()=>{}), player={id:'p',displayName:'Joiner'}, event={snapshot:{rounds:[{players:[player]}]}};
 let cursor=0;
 const React={useEffect:()=>{},useState:init=>[([true,[],[{id:'request',status:'pending',requested_name:'Joiner'}],''])[cursor++]??init,()=>{}]};
 const jsx=(type,props)=>({type,props});
 const deps={'./TournamentCompletion':{TournamentCompletion:'Completion'},'../services/online-client':{hostOrDiscover:async()=>null},react:React,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',Pressable:'Pressable',ScrollView:'ScrollView',Platform:{OS:'web'},Alert:{alert:()=>{}},AppState:{}},'../services/cross-device':{client:{decide},onlineEnabled:true,onlineQueue:async()=>({entries:[]})},'../stores/online-store':{useOnlineStore:f=>f({events:{c:event}})},'../stores/auth-store':{useAuthStore:f=>f({remoteUserId:'host',isAnonymous:false})},'./theme':{COLORS:{}}};
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/ui/OnlineSyncPanel.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n)},m,m.exports);
 const all=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(all):[n,...all(n.props?.children)];
 const tree=m.exports.OnlineSyncPanel({contest:{id:'c'}});
 const approve=all(tree).find(n=>n.type==='Pressable'&&all(n).some(x=>x.type==='Text'&&x.props.children==='Approve as Joiner'));
 expect(approve).toBeDefined();
 const previous=globalThis.confirm;try {
 globalThis.confirm=()=>false;approve.props.onPress();expect(decide).not.toHaveBeenCalled();
 globalThis.confirm=()=>true;approve.props.onPress();expect(decide).toHaveBeenCalledWith('request',true,'p');
 } finally {globalThis.confirm=previous;}
});
