import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReachReport} from './reach-report.mjs';

const manifest={journeys:[
  {id:'J-home',persona:'First-time player',start:'home',status:'gated',features:[
    {name:'create',accessibleName:'New Contest',maxActivations:2,maxScrolls:0},
    {name:'invite',accessibleName:'Invite players',maxActivations:3,maxScrolls:1},
  ]},
  {id:'J-deferred',status:'deferred',features:[{name:'join',accessibleName:'Join',maxActivations:2,maxScrolls:0}]},
]};

test('reach report records tap depth, scrolls, fold position, name status and budget per profile',()=>{
  const report={deviceProfile:'iphone-se',sha:'abc123',viewport:{width:375,height:667},safeArea:{bottom:0},results:[
    {id:'J-home',status:'passed',metrics:{reachability:[
      {feature:'create',status:'passed',depth:1,scrolls:0,rect:{x:10,y:100,width:180,height:48}},
      {feature:'invite',status:'expected_failure',depth:3,scrolls:1,rect:{x:10,y:620,width:180,height:44}},
    ]}},
  ]};
  const text=renderReachReport(report,manifest);
  assert.match(text,/iphone-se \(375×667; bottom inset 0px\)/);
  assert.match(text,/home \| create \(New Contest\) \| 1 \| 0 \| yes \| yes \| 2 taps \/ 0 scrolls/);
  assert.match(text,/home \| invite \(Invite players\) \| 3 \| 1 \| no \| known issue \| 3 taps \/ 1 scrolls/);
  assert.doesNotMatch(text,/J-deferred/);
});

test('missing feature evidence remains an explicit gap instead of disappearing',()=>{
  const text=renderReachReport({deviceProfile:'iphone-15-pro',sha:'def456',viewport:{width:393,height:852},safeArea:{bottom:34},results:[]},manifest);
  assert.match(text,/home \| invite \(Invite players\) \| not measured \| not measured \| not measured \| not measured/);
  assert.match(text,/Unmeasured features: 2/);
});

test('a recorded exact-name failure preserves its measured signature',()=>{
  const text=renderReachReport({deviceProfile:'iphone-15-pro',sha:'ghi789',viewport:{width:393,height:852},safeArea:{bottom:34},results:[
    {id:'J-home',status:'failed',metrics:{reachability:[{feature:'create',status:'failed',signature:'no-accessible-name',depth:1,scrolls:0,rect:{x:10,y:100,width:180,height:48}}]}},
  ]},manifest);
  assert.match(text,/create \(New Contest\) \| 1 \| 0 \| yes \| failed: no-accessible-name/);
  assert.doesNotMatch(text,/create \(New Contest\).*not measured/);
});
