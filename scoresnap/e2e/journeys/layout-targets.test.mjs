import {test} from 'node:test';import assert from 'node:assert/strict';import {assertTargetSize} from './layout-targets.mjs';
const fakeLocator=box=>({count:async()=>1,boundingBox:async()=>box});
test('exact 44x44 passes',async()=>{await assertTargetSize(fakeLocator({width:44,height:44}));});
test('sub-pixel rendering jitter (observed 44 - 2^-15) still passes',async()=>{await assertTargetSize(fakeLocator({width:44,height:43.999969482421875}));});
test('a meaningfully short target still fails',async()=>{await assert.rejects(()=>assertTargetSize(fakeLocator({width:40,height:40})),/target must be >=44x44/);});
test('a non-unique target still fails',async()=>{await assert.rejects(()=>assertTargetSize({count:async()=>2,boundingBox:async()=>({width:44,height:44})}),/target must be unique/);});
