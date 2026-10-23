import {chromium} from 'playwright';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {gate,required} from './shared/usability-gate.mjs';
import {UH1,UH2,UH3,UH5,UH6,visible} from './shared/usability.mjs';
const base=process.env.BASE_URL || 'http://127.0.0.1:8089';
const out=process.env.OUT_DIR || 'e2e/screens/usability';
fs.mkdirSync(out,{recursive:true});
const home=p=>p.getByText('Precision Scoring',{exact:false}).locator('visible=true');
const cases={
  'join-empty':async p=>{
    await p.getByText('Join with code',{exact:true}).locator('visible=true').click();
    await p.waitForURL('**/join/enter');
    if(process.env.MISSING_DISMISS==='1') await p.getByTestId('join-dismiss').evaluate(el=>el.remove());
    await UH6(p,{entry:p.getByPlaceholder('Join code'),dismiss:p.getByRole('button',{name:'Back to home',exact:true}),destination:()=>visible(home(p))});
  },
  'join-invalid':async p=>{
    await p.getByText('Join with code',{exact:true}).locator('visible=true').click();
    await p.getByPlaceholder('Join code').fill('ZZZZZZ');
    await p.getByPlaceholder('Display name').fill('Guest');
    await p.getByText('Find contest',{exact:true}).click();
    await UH5(p,{error:p.getByText(/Contest not found on this device/),recovery:p.getByTestId('join-dismiss'),destination:()=>visible(home(p))});
  },
  'join-deeplink':async p=>{
    await p.goto(base+'/join/ZZZZZZ');
    await UH1(p.getByTestId('join-dismiss'));
    await UH3(p,p.getByTestId('join-dismiss'));
    await visible(home(p));
  },
  'create-cancel':async p=>{
    await p.getByText('New Contest',{exact:true}).locator('visible=true').click();
    await visible(p.getByPlaceholder('Your name'));
    await p.getByPlaceholder('Your name').fill('Unsubmitted');
    await UH3(p,p.getByTestId('new-contest-back'));
    await visible(home(p));
    const state=await p.evaluate(()=>JSON.parse(localStorage.getItem('snapscore-contests')||'null'));
    assert.equal(state?.state?.contests?.length || 0,0);
  },
  'review-error':async p=>{
    await p.goto(base+'/scan/review?scanData=%7Bbad');
    await visible(p.getByText('Invalid Scorecard Data',{exact:true}));
    await UH5(p,{error:p.getByText(/Malformed scorecard data/),recovery:p.getByTestId('review-back'),destination:()=>visible(home(p))});
  },
};
const results=[];
let browser;
try {
  assert.deepEqual(Object.keys(cases).sort(),[...required].sort(),'required discovery mismatch');
  browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
  for(const id of required){
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
    await context.tracing.start({screenshots:true,snapshots:true,sources:true});
    const p=await context.newPage(); p.setDefaultTimeout(6000);
    const errors=[];p.on('pageerror',e=>errors.push(e.message));
    try {
      await p.goto(base);await visible(home(p));
      await cases[id](p);assert.deepEqual(errors,[]);
      results.push({id,status:'passed'});
    }catch(e){results.push({id,status:'failed',error:String(e),pageErrors:errors});}
    await p.screenshot({path:`${out}/${id}.png`});
    await context.tracing.stop({path:`${out}/${id}.zip`});
    await context.close();
  }
}catch(e){results.push({id:'startup',status:'failed',error:String(e)});}
finally{await browser?.close();fs.writeFileSync(`${out}/results.json`,JSON.stringify({required,results},null,2));}
console.log(results);
try { gate({required,results}); } catch(e) { console.error(e); process.exitCode=1; }
