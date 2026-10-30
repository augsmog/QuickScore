// Isolated Expo export of the real paywall; mocks exist only in a disposable project.
import { mkdtemp, cp, writeFile, symlink, mkdir, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.argv[2] || path.join(tmpdir(), 'paywall-screens'));
const scratch = await mkdtemp(path.join(tmpdir(), 'snapscore-paywall-'));
const run = (args, cwd=scratch, env={}) => new Promise((resolve,reject) => {
  const child=spawn(process.execPath,args,{cwd,env:{...process.env,EXPO_OFFLINE:'1',CI:'1',...env},stdio:'inherit'});
  child.on('error',reject); child.on('exit',code=>code===0?resolve():reject(Error('Command exited '+code)));
});
let server,browser;
try {
  await mkdir(output,{recursive:true});
  await cp(path.join(root,'src'),path.join(scratch,'src'),{recursive:true});
  await mkdir(path.join(scratch,'app'));
  const modules = await realpath(path.join(root,'node_modules'));
  await writeFile(path.join(scratch,'metro.config.cjs'), `const {getDefaultConfig}=require('expo/metro-config'); const c=getDefaultConfig(__dirname); c.watchFolders=[${JSON.stringify(modules)}]; c.resolver.nodeModulesPaths=[${JSON.stringify(modules)}]; module.exports=c;`);
  await cp(path.join(root,'app/paywall.tsx'),path.join(scratch,'app/index.tsx'));
  await symlink(path.join(root,'node_modules'),path.join(scratch,'node_modules'),'dir');
  await writeFile(path.join(scratch,'package.json'),JSON.stringify({name:'paywall-preview',version:'1.0.0',main:'expo-router/entry'}));
  await writeFile(path.join(scratch,'app.json'),JSON.stringify({expo:{name:'Paywall Preview',slug:'paywall-preview',web:{output:'single'},plugins:['expo-router']}}));
  await writeFile(path.join(scratch,'app/_layout.tsx'),"import { Slot } from 'expo-router'; import { SafeAreaProvider } from 'react-native-safe-area-context'; export default function Layout(){return <SafeAreaProvider><Slot /></SafeAreaProvider>}");
  await writeFile(path.join(scratch,'src/stores/scan-store.ts'),"export const useScanStore = (select: any) => select({tier:'free'});");
  await writeFile(path.join(scratch,'src/services/purchases.ts'),`
const pkg=(identifier:string,priceString:string)=>({product:{identifier,priceString}});
export async function getPackages(){return {annual:pkg('pro-year','$24.99'),monthly:pkg('pro-month','$3.99'),td_annual:pkg('td-year','$79.99'),td_monthly:pkg('td-month','$12.99')};}
export async function purchasePackage(){return false;}
export async function restorePurchases(){return false;}
export async function syncProStatus(){}
`);
  // Replace only the eligibility service in this temporary copy; use the production builder unchanged.
  const { readFile } = await import('node:fs/promises');
  let plans=await readFile(path.join(root,'src/services/paywall-plans.ts'),'utf8');
  const start=plans.indexOf('export async function eligibleAnnualTrials');
  const end=plans.indexOf("\nimport { PAYWALL_COPY",start);
  plans=plans.slice(0,start)+"export async function eligibleAnnualTrials(){return {'pro-year':true,'td-year':true};}\n"+plans.slice(end);
  plans=plans.replace("import Purchases, { INTRO_ELIGIBILITY_STATUS, type PurchasesPackage } from 'react-native-purchases';","import type { PurchasesPackage } from 'react-native-purchases';");
  await writeFile(path.join(scratch,'src/services/paywall-plans.ts'),plans);
  await run([path.join(root,'node_modules/expo/bin/cli'),'export','--platform','web','--output-dir','dist']);
  const port=process.env.PAYWALL_PORT || '8097';
  server=spawn(process.execPath,[path.join(root,'e2e/serve.mjs')],{env:{...process.env,PORT:port,WEB_ROOT:path.join(scratch,'dist')},stdio:'inherit'});
  await new Promise((resolve,reject)=>{server.once('error',reject);setTimeout(resolve,1000);});
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:852},deviceScaleFactor:1});
  await page.route('**/*',route=>['127.0.0.1','localhost'].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
  await page.goto('http://127.0.0.1:'+port);
  await page.getByText('Start 7-day free trial',{exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(output,'paywall-yearly.png'),fullPage:true});
  await page.getByText('or $3.99/month',{exact:true}).click();
  await page.getByText('Subscribe — $3.99/month',{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'paywall-monthly.png'),fullPage:true});
} finally {
  await browser?.close(); server?.kill(); await rm(scratch,{recursive:true,force:true});
}
