// AUG-975: disposable Expo harness. No fixture identity enters the shipping app.
import { mkdtemp, cp, writeFile, symlink, mkdir, rm, realpath, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || 'e2e/screens/my-group');
// Keep disposable build output in the invoking worktree, including on the box.
const scratch = await mkdtemp(path.join(root, '.my-group-preview-'));
const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const run = (args) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, args, { cwd: scratch, stdio: 'inherit', env: {
    ...process.env, TMPDIR: path.join(scratch, '.metro-tmp'), EXPO_OFFLINE: '1', CI: '1', EXPO_PUBLIC_OFFLINE_MODE: 'true',
    EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: 'false',
  } });
  child.on('error', reject);
  child.on('exit', code => code === 0 ? resolve() : reject(Error(`Expo export exited ${code}`)));
});
let server, browser;
try {
  await mkdir(output, { recursive: true });
  await mkdir(path.join(scratch, '.metro-tmp'));
  await cp(path.join(root, 'assets/fonts'), path.join(scratch, 'assets/fonts'), { recursive: true });
  await cp(path.join(root, 'src'), path.join(scratch, 'src'), { recursive: true });
  await mkdir(path.join(scratch, 'app/contest/[id]'), { recursive: true });
  await cp(path.join(root, 'app/contest/[id]/index.tsx'), path.join(scratch, 'app/contest/[id]/index.tsx'));
  const modules = await realpath(path.join(root, 'node_modules'));
  await symlink(modules, path.join(scratch, 'node_modules'), 'dir');
  await writeFile(path.join(scratch, 'metro.config.cjs'), `const {getDefaultConfig}=require('expo/metro-config'); const c=getDefaultConfig(__dirname); c.watchFolders=[${JSON.stringify(modules)}]; c.resolver.nodeModulesPaths=[${JSON.stringify(modules)}]; module.exports=c;`);
  // Match the shipping Babel transform required by Zustand's web import.meta.
  await writeFile(path.join(scratch, 'babel.config.js'), `module.exports={presets:[['babel-preset-expo',{web:{unstable_transformImportMeta:true}}]]};`);
  await writeFile(path.join(scratch, 'package.json'), JSON.stringify({ name: 'my-group-preview', version: '1.0.0', main: 'expo-router/entry' }));
  await writeFile(path.join(scratch, 'app.json'), JSON.stringify({ expo: { name: 'My Group Preview', slug: 'my-group-preview', web: { output: 'single' }, plugins: ['expo-router'] } }));
  await writeFile(path.join(scratch, 'app/_layout.tsx'), `
import { useEffect, useState } from 'react';
import { Slot } from 'expo-router';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import { useContestStore } from '../src/stores/contest-store';
import { useOnlineStore } from '../src/stores/online-store';
import { COLORS } from '../src/ui/theme';
const players = [
  {id:'p1',name:'Amy Adams',handicap:0,scores:Array(18).fill(3)},
  {id:'p2',name:'Bob Brown',handicap:0,scores:Array(18).fill(4)},
  {id:'p3',name:'Cara Cole',handicap:18,scores:Array(18).fill(5)},
  {id:'p4',name:'Dan Diaz',handicap:0,scores:Array(18).fill(6)},
];
const groups = [
  {id:'g1',name:'First group',players:[players[0],players[2]]},
  {id:'g2',name:'Viewer group',players:[players[1],players[3]]},
];
const contest = {id:'my-group',name:'My group fixture',status:'active',betUnit:0,hasTeams:false,games:[],groups,
  createdAt:'2026-11-12T00:00:00Z',course:{name:'Fixture course',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1}))}};
export default function Layout() {
  const [ready,setReady]=useState(false);
  const [fonts]=useFonts({
    Marcellus_400Regular: require('../assets/fonts/Marcellus_400Regular.ttf'),
    MarcellusSC_400Regular: require('../assets/fonts/MarcellusSC_400Regular.ttf'),
    SourceSans3_400Regular: require('../assets/fonts/SourceSans3_400Regular.ttf'),
    SourceSans3_500Medium: require('../assets/fonts/SourceSans3_500Medium.ttf'),
    SourceSans3_600SemiBold: require('../assets/fonts/SourceSans3_600SemiBold.ttf'),
    SourceSans3_700Bold: require('../assets/fonts/SourceSans3_700Bold.ttf'),
    SourceSans3_800ExtraBold: require('../assets/fonts/SourceSans3_800ExtraBold.ttf'),
  });
  useEffect(()=>{let active=true; (async()=>{
    await useContestStore.persist.rehydrate();
    if(!active)return;
    useContestStore.setState({contests:[contest],activeContestId:contest.id});
    useOnlineStore.getState().repair(contest.id,{status:'approved',player_id:'p2',role:'player'}, {revision:1});
    setReady(true);
  })();return()=>{active=false};},[]);
  return ready && fonts ? <View style={{flex:1,backgroundColor:COLORS.bg}}><Slot /></View> : null;
}
`);
  await run([path.join(root, 'node_modules/expo/bin/cli'), 'export', '--platform', 'web', '--output-dir', 'dist', '--clear']);
  const port = process.env.MY_GROUP_PORT || '8096';
  const base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(root, 'e2e/serve.mjs')], {
    env: { ...process.env, PORT: port, WEB_ROOT: path.join(scratch, 'dist') }, stdio: 'inherit',
  });
  for (let attempt = 0; ; attempt++) {
    if (server.exitCode !== null) throw Error('Preview server exited');
    try { if ((await fetch(base)).ok) break; } catch {}
    if (attempt === 30) throw Error('Preview server did not start');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); console.error('Page error:', error.message); });
  await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
  await page.goto(`${base}/contest/my-group`);
  const control = page.getByRole('switch', { name: 'My group' });
  await control.waitFor().catch(async error => {
    await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: false });
    console.error('Capture DOM:', await page.locator('body').innerText());
    console.error('Page errors:', errors);
    throw error;
  });
  const files = [];
  for (const [state, expected] of [
    ['off', [['p1','Amy Adams','1'], ['p2','Bob Brown','2'], ['p3','Cara Cole','3'], ['p4','Dan Diaz','4']]],
    ['on', [['p2','Bob Brown','2'], ['p4','Dan Diaz','4']]],
  ]) {
    if (state === 'on') await control.click();
    await page.waitForFunction(({checked,count}) =>
      document.querySelector('[data-testid="leaderboard-my-group"]')?.getAttribute('aria-checked') === String(checked)
      && document.querySelectorAll('[data-testid^="leaderboard-player-"]').length === count,
    { checked: state === 'on', count: expected.length }).catch(async error => {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: false });
      console.error('Failed state', state, await control.evaluate(node => node.outerHTML));
      console.error('Rendered rows', await page.locator('[data-testid^="leaderboard-player-"]').evaluateAll(nodes => nodes.map(node => ({id:node.dataset.testid,rect:node.getBoundingClientRect().toJSON()}))));
      console.error('Capture DOM:', await page.locator('body').innerText());
      throw error;
    });
    assert.equal(await control.isEnabled(), true);
    assert.deepEqual(await page.locator('[data-testid^="leaderboard-player-"]').evaluateAll(nodes => nodes.map(n => n.dataset.testid)),
      expected.map(([,name]) => `leaderboard-player-${name}`));
    for (const [id,,rank] of expected) assert.equal(await page.getByTestId(`leaderboard-rank-${id}`).textContent(), rank);
    await page.evaluate(() => document.fonts.ready);
    const file = `my-group-${state}-390x844.png`;
    await page.screenshot({ path: path.join(output, file), fullPage: false, animations: 'disabled' });
    const png = await readFile(path.join(output, file));
    assert.equal(png.readUInt32BE(16), 390); assert.equal(png.readUInt32BE(20), 844);
    files.push({ path: file, sha256: createHash('sha256').update(png).digest('hex'), rows: expected, checked: state === 'on' });
  }
  assert.deepEqual(errors, []);
  const sources = {};
  for (const file of ['app/contest/[id]/index.tsx', 'src/stores/online-store.ts', 'src/stores/contest-store.ts',
    'src/components/LeaderboardResultsList.tsx', 'src/engine/leaderboard-rows.ts']) {
    sources[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
  }
  const manifest = { sources, ticket: 'AUG-975', head_sha: process.env.PR_HEAD_SHA || checkoutSha, checkout_sha: checkoutSha,
    run_url: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT || null, viewport: { width:390,height:844 }, files };
  await writeFile(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest, null, 2));
} finally {
  await browser?.close(); server?.kill(); await rm(scratch, { recursive: true, force: true });
}
