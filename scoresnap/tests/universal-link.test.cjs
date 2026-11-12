const fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
const assert=require('node:assert/strict');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/services/universal-link.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,URL});
const route=exportsObject.universalLinkPath;
test('universal links accept only exact shared-live/join routes, discard credentials and malformed paths', () => {
const origin='https://snapscore.autumn8.me', token='a'.repeat(64);
for(const path of [origin+'/r/'+token,'snapscore://r/'+token,'/r/'+token]) assert.equal(route(path,origin),'/r/'+token);
assert.equal(route(origin+'/join/abc234?secret=hidden#auth',origin),'/join/ABC234');
assert.equal(route('snapscore://join/ABC234',origin),'/join/ABC234');
for(const bad of ['https://evil.test/r/'+token,'https://snapscore.autumn8.me.evil/r/'+token,'https://user:pass@snapscore.autumn8.me/r/'+token,'http://snapscore.autumn8.me/r/'+token,'//evil.test/join/ABC234','/join/ABC%2F34','/r/short','/auth/sign-in','/join/ABC234/extra','/join/AB0123']) assert.equal(route(bad,origin),'/',bad);

});
test('native association config uses existing flag and configured public origin',()=>{
 const context={module:{exports:{}},require:()=>JSON.parse(fs.readFileSync('app.json','utf8')),process,URL};
 vm.runInNewContext(fs.readFileSync('app.config.js','utf8'),context); const config=context.module.exports;
 const old=process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING, url=process.env.EXPO_PUBLIC_WEB_URL;
 try {
  delete process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING;
  expect(config().ios.associatedDomains).toBeUndefined();
  process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING='true';process.env.EXPO_PUBLIC_WEB_URL='https://snapscore.autumn8.me';
  expect(config().ios.associatedDomains).toEqual(['applinks:snapscore.autumn8.me']);
  expect(config().android.intentFilters[0].autoVerify).toBe(true);
  process.env.EXPO_PUBLIC_WEB_URL='http://evil.test';expect(()=>config()).toThrow();
 }finally{
  for(const [key,value] of [['EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING',old],['EXPO_PUBLIC_WEB_URL',url]]) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
