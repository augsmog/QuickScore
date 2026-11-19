const fs=require('node:fs'),ts=require('typescript');
test('explicit offline sharing preserves local invite; online invite waits for enrollment',()=>{
 for(const [onlineEnabled,enrolled,visible] of [[false,false,true],[true,false,false],[true,true,true]]) {
 const jsx=(type,props)=>({type,props});
 const deps={'../stores/auth-store':{useAuthStore:f=>f({remoteUserId:null})},'../services/online-client':{},'../services/online-enrollment':{},'../db/supabase':{},'../services/cross-device':{onlineEnabled},'../stores/online-store':{useOnlineStore:f=>f({events:enrolled?{c:{snapshot:{protocol:1}}}:{}})},react:{useState:x=>[x,()=>{}],useEffect:()=>{}},'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{View:'View',Text:'Text',Pressable:'Pressable',Platform:{OS:'web'}},'../stores/contest-store':{},'../services/guest-join':{},'./theme':{COLORS:{}},'./LocalJoinLimitationBanner':{LocalJoinLimitationBanner:'Banner'},'../services/local-join-limitation':{getLocalJoinLimitation:()=>({})},'../config/features':{CROSS_DEVICE_SHARING_ENABLED:true}};
 const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/ui/ContestJoinCode.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n)},m,m.exports);
 const all=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(all):[n,...all(n.props?.children)];
 expect(all(m.exports.ContestJoinCode({contest:{id:'c',joinCode:'ABC234'}})).some(n=>n.props?.testID==='organizer-join-code')).toBe(visible);
 }
});
