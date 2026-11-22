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
