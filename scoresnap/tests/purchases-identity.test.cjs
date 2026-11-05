const fs=require('fs'),ts=require('typescript');
function load(deps){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync('src/services/purchases.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText)(n=>{if(n in deps)return deps[n];throw Error(n)},m,m.exports);return m.exports;}
test('startup identity waits for configure, deduplicates restores, switches accounts and skips anonymous logout',async()=>{
 const original=process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY;process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY='test-only';global.__DEV__=false;
 let configured=false,anonymous=true,tier='free';const order=[];const info=()=>({tier});
 const purchases={configure:()=>{configured=true;order.push('configure');},addCustomerInfoUpdateListener:()=>{},getCustomerInfo:async()=>info(),logIn:jest.fn(async id=>{expect(configured).toBe(true);order.push(id);anonymous=false;tier=id==='A'?'pro':'free';return {customerInfo:info()};}),isAnonymous:async()=>anonymous,logOut:jest.fn(async()=>{expect(configured).toBe(true);order.push('logout');anonymous=true;tier='free';return info();})};
 const state={setTier:jest.fn()};const svc=load({'react-native':{Platform:{OS:'ios'},NativeModules:{RNPurchases:{}}},'@sentry/react-native':{},'react-native-purchases':{__esModule:true,default:purchases,LOG_LEVEL:{},PURCHASES_ERROR_CODE:{}},'../stores/scan-store':{useScanStore:{getState:()=>state}},'./entitlements':{tierFromCustomerInfo:i=>i.tier}});
 try{await Promise.all([svc.identifyUser('A'),svc.initPurchases(),svc.identifyUser('A')]);expect(order).toEqual(['configure','A']);expect(state.setTier).toHaveBeenLastCalledWith('pro');await Promise.all([svc.logOutPurchases(),svc.logOutPurchases(),svc.identifyUser('B')]);expect(order).toEqual(['configure','A','logout','B']);expect(purchases.logOut).toHaveBeenCalledTimes(1);expect(state.setTier).toHaveBeenLastCalledWith('free');await svc.logOutPurchases();await svc.identifyUser('A');expect(purchases.logIn.mock.calls.map(c=>c[0])).toEqual(['A','B','A']);}finally{delete global.__DEV__;if(original===undefined)delete process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY;else process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY=original;}
});

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
async function withIdentityService(run) {
 const original=process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY; process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY='test-only'; global.__DEV__=false;
 const sdk={configure:jest.fn(),addCustomerInfoUpdateListener:jest.fn(),getCustomerInfo:async()=>({}),logIn:jest.fn(async()=>({customerInfo:{}})),isAnonymous:async()=>false,logOut:jest.fn(async()=>({}))};
 const service=load({'react-native':{Platform:{OS:'ios'},NativeModules:{RNPurchases:{}}},'@sentry/react-native':{},'react-native-purchases':{__esModule:true,default:sdk,LOG_LEVEL:{},PURCHASES_ERROR_CODE:{}},'../stores/scan-store':{useScanStore:{getState:()=>({setTier:()=>{}})}},'./entitlements':{tierFromCustomerInfo:()=> 'free'}});
 const warn=jest.spyOn(console,'warn').mockImplementation(()=>{});
 try { await run(service,sdk); } finally { warn.mockRestore(); delete global.__DEV__; if(original===undefined) delete process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY; else process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY=original; }
}
test('preview requires confirmed matching identity, not configure or auth actor alone',async()=>withIdentityService(async(s)=>{
 expect(await s.waitForPurchaseIdentity(null)).toBeNull(); await s.initPurchases();
 expect(await s.waitForPurchaseIdentity(null)).toBeNull(); expect(await s.waitForPurchaseIdentity('A')).toBeNull();
 await s.identifyUser('A'); const revision=await s.waitForPurchaseIdentity('A'); expect(revision).not.toBeNull();
 expect(s.isPurchaseIdentityCurrent(revision,'A')).toBe(true); expect(await s.waitForPurchaseIdentity('B')).toBeNull();
 expect(s.isPurchaseIdentityCurrent(revision,null)).toBe(false);
}));
test('preview waits for queued identity and rejects superseded snapshots',async()=>withIdentityService(async(s,sdk)=>{
 await s.identifyUser('A'); const previous=await s.waitForPurchaseIdentity('A'), login=deferred(); sdk.logIn.mockReturnValueOnce(login.promise);
 const switching=s.identifyUser('B'); expect(s.isPurchaseIdentityCurrent(previous,'A')).toBe(false);
 let settled=false; const snapshot=s.waitForPurchaseIdentity('B').then(v=>{settled=true;return v;});
 for(let i=0;i<8;i++)await Promise.resolve(); expect(settled).toBe(false);
 const newest=s.identifyUser('C'); login.resolve({customerInfo:{}}); await switching; expect(await snapshot).toBeNull(); await newest;
 const revision=await s.waitForPurchaseIdentity('C'); expect(revision).not.toBeNull(); expect(s.isPurchaseIdentityCurrent(revision,'C')).toBe(true);
}));
test('failed identity leaves preview unavailable until a successful retry; logout invalidates',async()=>withIdentityService(async(s,sdk)=>{
 await s.identifyUser('A'); const previous=await s.waitForPurchaseIdentity('A'); sdk.logIn.mockRejectedValueOnce(Error('test failure'));
 await s.identifyUser('B'); expect(s.isPurchaseIdentityCurrent(previous,'A')).toBe(false); expect(await s.waitForPurchaseIdentity('A')).toBeNull(); expect(await s.waitForPurchaseIdentity('B')).toBeNull();
 await s.identifyUser('B'); const revision=await s.waitForPurchaseIdentity('B'); expect(revision).not.toBeNull();
 await s.logOutPurchases(); expect(s.isPurchaseIdentityCurrent(revision,'B')).toBe(false); expect(await s.waitForPurchaseIdentity(null)).not.toBeNull();
}));
