const fs = require('node:fs'), ts = require('typescript');
function load(file, deps = {}, env = {}) {
  const m = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('require','module','exports','process',code)(id => { if (!(id in deps)) throw Error(id); return deps[id]; },m,m.exports,{env});
  return m.exports;
}
test('manual sharing never implicitly enables Leagues or native links', () => {
  for (const value of [undefined,'false','True','1']) {
    const f = load('src/config/features.ts', {}, { EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING:'true', EXPO_PUBLIC_FEATURE_LEAGUES:value, EXPO_PUBLIC_FEATURE_NATIVE_LINKS:value });
    expect(f.CROSS_DEVICE_SHARING_ENABLED).toBe(true);
    expect(f.LEAGUES_ENABLED).toBe(false); expect(f.NATIVE_LINKS_ENABLED).toBe(false);
  }
});
test('every League service operation stops before an RPC when disabled', async () => {
  const rpc = jest.fn();
  const { leagueService } = load('src/services/leagues.ts', { '../config/features':{LEAGUES_ENABLED:false}, '../db/supabase':{supabase:{rpc}} });
  for (const method of Object.values(leagueService)) await expect(method('fixture','contest','player','mapped')).rejects.toThrow('Leagues are not available in this build.');
  expect(rpc).not.toHaveBeenCalled();
});
test('League tab is explicitly hidden and direct route is separately guarded', () => {
  expect(fs.readFileSync('app/(tabs)/_layout.tsx','utf8')).toMatch(/name="leagues".*href: LEAGUES_ENABLED \? "\/leagues" : null/);
  const route = fs.readFileSync('app/(tabs)/leagues.tsx','utf8');
  expect(route).toContain('if (!LEAGUES_ENABLED) return');
  expect(route).toContain('if (!LEAGUES_ENABLED || !remoteUserId) return');
});
test('native share/join intents are blocked while auth callbacks are preserved', () => {
  const {universalLinkPath} = load('src/services/universal-link.ts');
  const {redirectSystemPath} = load('app/+native-intent.tsx', { '../src/config/features':{NATIVE_LINKS_ENABLED:false}, '../src/services/universal-link':{universalLinkPath} });
  for (const path of ['snapscore://join/ABC234','snapscore://join/enter','/join/not-a-code','snapscore://join%2FABC234','https://snapscore.autumn8.me/join/ABC234','snapscore://r/'+'a'.repeat(64)]) expect(redirectSystemPath({path,initial:true})).toBe('/');
  for (const path of ['snapscore:///join/ABC234','snapscore:/join/ABC234','snapscore:join/ABC234',
    'com.scoresnap.app://join/ABC234','exp://localhost:8081/--/join/ABC234',
    '/%6aoin%2FABC234','//join/ABC234','snapscore:///r/'+'a'.repeat(64)]) {
    expect(redirectSystemPath({path,initial:true})).toBe('/');
    expect(redirectSystemPath({path,initial:false})).toBe('/');
  }
  for (const path of ['com.scoresnap.app://auth/callback?next=/join/ABC234','snapscore:///settings',
    'snapscore://auth/callback#state','/','/contest/123','/auth/sign-in']) {
    expect(redirectSystemPath({path,initial:true})).toBe(path);
    expect(redirectSystemPath({path,initial:false})).toBe(path);
  }
});
