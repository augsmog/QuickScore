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
// 1.0.1 contract: Join by code needs no native association. The config never adds one, whatever
// the sharing flag or web origin says, and refuses to build if native links are switched on
// without signed association evidence (see tests/eas-associated-domains-guard.test.cjs).
test('native association config adds no association for Join by code and refuses unverified native links',()=>{
 const context={module:{exports:{}},require:()=>JSON.parse(fs.readFileSync('app.json','utf8')),process,URL};
 vm.runInNewContext(fs.readFileSync('app.config.js','utf8'),context); const config=context.module.exports;
 const keys=['EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING','EXPO_PUBLIC_WEB_URL','EXPO_PUBLIC_FEATURE_NATIVE_LINKS'];
 const saved=keys.map(key=>[key,process.env[key]]);
 try {
  for(const key of keys) delete process.env[key];
  expect(config().ios.associatedDomains).toBeUndefined();
  expect(config().android.intentFilters).toBeUndefined();
  process.env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING='true';process.env.EXPO_PUBLIC_WEB_URL='https://snapscore.autumn8.me';
  expect(config().ios.associatedDomains).toBeUndefined();
  expect(config().android.intentFilters).toBeUndefined();
  // An attacker-controlled origin cannot add an association either: the origin is no longer read.
  process.env.EXPO_PUBLIC_WEB_URL='http://evil.test';
  expect(config().ios.associatedDomains).toBeUndefined();
  expect(config().android.intentFilters).toBeUndefined();
  process.env.EXPO_PUBLIC_FEATURE_NATIVE_LINKS='false';
  expect(config().ios.associatedDomains).toBeUndefined();
  for(const value of ['true','True','1','']){process.env.EXPO_PUBLIC_FEATURE_NATIVE_LINKS=value;expect(()=>config()).toThrow('NATIVE_LINK_ASSOCIATIONS_UNVERIFIED');}
 }finally{
  for(const [key,value] of saved) {if(value===undefined)delete process.env[key];else process.env[key]=value;}
 }
});
