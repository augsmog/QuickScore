import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createMetrics,count,screen,evaluate,aggregate} from './metrics.mjs';
const journey=()=>({status:'gated',baseline:null,budget:{activations:20,screens:3,timeoutMs:1000},assertions:['entry','outcome']});
const attempt=()=>({metrics:{...createMetrics(),activations:5,durationMs:100},assertions:['entry','outcome']});
test('counters retain independent units and distinct screens/transitions',()=>{
 const m=createMetrics(); for(const k of ['activations','textEdit','focus','scroll']) count(m,k);
 screen(m,'home');screen(m,'form');screen(m,'home');screen(m,'home');
 assert.equal(m.activations,1);assert.equal(m.textEdit,1);assert.equal(m.focus,1);assert.equal(m.scroll,1);
 assert.deepEqual(m.screens,['home','form']);assert.equal(m.transitions.length,3);
});
test('complete attempt passes',()=>assert.equal(evaluate(journey(),attempt()).status,'passed'));
for(const [name,change] of [
 ['activation budget', (j,a)=>a.metrics.activations=21],
 ['screen budget',(j,a)=>a.metrics.screens=['a','b','c','d']],
 ['absolute timeout',(j,a)=>a.metrics.durationMs=1001],
 ['missing assertion',(j,a)=>a.assertions.pop()],
 ['page error',(j,a)=>a.pageErrors=['boom']],
]) test(name+' fails',()=>{const j=journey(),a=attempt();change(j,a);assert.equal(evaluate(j,a).status,'failed');});
test('20% regression fails even when delta <=2',()=>{const j=journey();j.baseline={activations:4};assert.match(evaluate(j,attempt()).errors.join(),/>20%/);});
test('delta >2 fails even when below 20%',()=>{const j=journey(),a=attempt();j.budget.activations=100;j.baseline={activations:50};a.metrics.activations=53;const r=evaluate(j,a);assert.deepEqual(r.errors,['activation baseline regression >2']);});
test('baseline time is record-only until ten samples, then median +50%',()=>{const j=journey(),a=attempt();j.baseline={activations:5,timeSamples:Array(9).fill(10)};assert.equal(evaluate(j,a).status,'passed');j.baseline.timeSamples.push(10);assert.match(evaluate(j,a).errors.join(),/time baseline/);});
const issue=()=>({...journey(),status:'known_issue',knownIssue:{date:'2026-10-31',signature:'outcome',linear:'AUG-289'}});
const broken=()=>({...attempt(),error:'dialog absent',signature:'outcome',assertions:['entry']});
const now=new Date('2026-10-31T12:00:00Z');
test('declared xfail passes only at its assertion',()=>assert.equal(evaluate(issue(),broken(),{now}).status,'expected_failure'));
test('unrelated xfail failure stays red',()=>{const a=broken();a.signature='startup';assert.equal(evaluate(issue(),a,{now}).status,'failed');});
test('unexpected pass requires marker removal',()=>assert.match(evaluate(issue(),attempt(),{now}).errors.join(),/remove marker/));
test('stale known issue fails unless explicitly renewed',()=>{const j=issue();j.knownIssue.date='2026-10-01';assert.match(evaluate(j,broken(),{now}).errors.join(),/stale/);j.knownIssue.renewedUntil='2026-11-02';assert.equal(evaluate(j,broken(),{now}).status,'expected_failure');});
test('missing assertions before xfail remain red',()=>{const a=broken();a.assertions=[];assert.equal(evaluate(issue(),a,{now}).status,'failed');});
for(const status of ['missing','skipped','errored','failed'])test(status+' required journey is red',()=>assert.equal(aggregate(['J'],status==='missing'?[]:[{id:'J',status}]).status,'failed'));
test('duplicate and extra inventory is red',()=>assert.equal(aggregate(['J'],[{id:'J',status:'passed'},{id:'J',status:'passed'}]).status,'failed'));

const featureJourney=()=>({...journey(),features:[{name:'score',class:'core',maxActivations:2,maxScrolls:0,reachability:{status:'known_issue',linear:'AUG-306',signature:'no-accessible-name',date:'2026-10-31'}}]});
const featureAttempt=()=>{const a=attempt();a.metrics.reachability=[{feature:'score',status:'expected_failure',signature:'no-accessible-name',depth:1,scrolls:0}];return a;};
test('feature semantic xfail preserves gated outcomes',()=>{const j=featureJourney(),a=featureAttempt();assert.equal(evaluate(j,a,{now}).status,'passed');a.assertions.pop();assert.equal(evaluate(j,a,{now}).status,'failed');});
for(const [name,mutate] of [
 ['missing reachability',a=>a.metrics.reachability=[]],
 ['wrong signature',a=>a.metrics.reachability[0].signature='control-hidden'],
 ['unexpected pass',a=>{a.metrics.reachability[0].signature=null;a.metrics.reachability[0].status='passed';}],
 ['too deep',a=>a.metrics.reachability[0].depth=3],
 ['core scroll',a=>a.metrics.reachability[0].scrolls=1],
])test('feature '+name+' stays red',()=>{const a=featureAttempt();mutate(a);assert.equal(evaluate(featureJourney(),a,{now}).status,'failed');});
test('stale feature marker stays red',()=>{const j=featureJourney();j.features[0].reachability.date='2026-10-01';assert.equal(evaluate(j,featureAttempt(),{now}).status,'failed');});
test('empty or duplicate required inventory is red',()=>{assert.equal(aggregate([],[]).status,'failed');assert.equal(aggregate(['J','J'],[{id:'J',status:'passed'}]).status,'failed');});
test('skipped attempt with otherwise complete evidence is red',()=>{const a=attempt();a.status='skipped';assert.equal(evaluate(journey(),a).status,'failed');});
test('a core control behind an adapter disclosure stays red',()=>{const a=featureAttempt();a.metrics.reachability[0].disclosures=['round-status-chip'];assert.equal(evaluate(featureJourney(),a,{now}).status,'failed');});
test('unknown xfail assertion cannot satisfy the inventory',()=>{const j=issue(),a=broken();j.knownIssue.signature='invented';a.signature='invented';assert.equal(evaluate(j,a,{now}).status,'failed');});
