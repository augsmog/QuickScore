import test from 'node:test';
import assert from 'node:assert/strict';
import {cases} from './adapter.mjs';

const toast='Local join code copied · same browser only';
const invite='Same browser only — This join code works on this device/browser, not another phone. Live cross-device sharing is coming. Join with code JRNY26.';
// Exercise the real adapter assertion callbacks; this is not browser evidence.
async function run({clipboard=invite,visibleToast=toast,code='JRNY26',persisted='JRNY26'}={}) {
  const checks=[],captures=[];
  await cases['J-invite-from-round']({
    page:{
      getByTestId:id=>({id,innerText:async()=>`Join code: ${code}`}),
      getByText:(text,options)=>({waitFor:async state=>{
        assert.deepEqual(options,{exact:true});assert.deepEqual(state,{state:'visible'});
        assert.equal(text,visibleToast);
      }}),
      evaluate:async fn=>String(fn).includes('navigator.clipboard.readText')?clipboard:[{joinCode:persisted}],
    },
    act:{activate:async locator=>assert.equal(locator.id,'journey-invite')},
    check:async(name,fn)=>{checks.push(name);if(name!=='entry')await fn();},
    step:async name=>captures.push(name),
  });
  return {checks,captures};
}
test('exact code-only local disclosure reaches persistence check and capture',async()=>{
  assert.deepEqual(await run(),{checks:['entry','code-visible','activation','destination','outcome'],captures:['invite-copied']});
});
for(const [name,options] of [
  ['missing warning',{clipboard:'Join with code JRNY26.'}],
  ['old URL',{clipboard:'http://127.0.0.1:8092/join/JRNY26'}],
  ['wrong clipboard code',{clipboard:invite.replace('JRNY26','BAD234')}],
  ['old link toast',{visibleToast:'Local invite link copied · same browser only'}],
  ['wrong visible code',{code:'BAD234'}],
  ['changed persisted code',{persisted:'BAD234'}],
])test(`${name} stays red`,async()=>{await assert.rejects(run(options));});
