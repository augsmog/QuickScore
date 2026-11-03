const { test } = require('@jest/globals');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const source = fs.readFileSync('src/services/live-share-auth.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const loaded = { exports: {} };
new Function('module', 'exports', js)(loaded, loaded.exports);
const { assertLiveShareActor } = loaded.exports;

test('queued live-share work is rejected when account identity changes', () => {
  assert.throws(() => assertLiveShareActor({ user: { id: 'account-b' } }, 'account-a'), /Account changed/);
  assert.throws(() => assertLiveShareActor(null, 'account-a'), /Account changed/);
  assert.throws(() => assertLiveShareActor({ user: { id: 'account-a', is_anonymous: true } }, 'account-a'), /Account changed/);
  assert.doesNotThrow(() => assertLiveShareActor({ user: { id: 'account-a' } }, 'account-a'));
});

test('score-edit publisher captures its actor before deferred service import', () => {
  const store = fs.readFileSync('src/stores/contest-store.ts', 'utf8');
  assert.match(store, /const expectedActorId = auth\.user\?\.id \?\? auth\.remoteUserId \?\? null;\s+void import\('\.\.\/services\/live-share'\)\.then\(m => m\.publishSnapshot\(contest, expectedActorId\)\)/);
});
