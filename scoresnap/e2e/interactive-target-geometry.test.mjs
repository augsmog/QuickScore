import test from 'node:test';
import assert from 'node:assert/strict';
import {findInteractiveTargetOverlaps} from './interactive-target-geometry.mjs';

test('interactive targets may touch or overlap by at most two CSS pixels', () => {
  const first = {name:'first',left:0,top:0,right:44,bottom:44};
  assert.deepEqual(findInteractiveTargetOverlaps([first,
    {name:'touching',left:44,top:0,right:88,bottom:44},
  ]), []);
  assert.deepEqual(findInteractiveTargetOverlaps([first,
    {name:'two pixel overlap',left:42,top:0,right:86,bottom:44},
  ]), []);
  assert.deepEqual(findInteractiveTargetOverlaps([first,
    {name:'three pixel overlap',left:41,top:0,right:85,bottom:44},
  ]), [
    {first:'first',second:'three pixel overlap',width:3,height:44},
  ]);
});

test('targets separated on either axis are not overlapping', () => {
  assert.deepEqual(findInteractiveTargetOverlaps([
    {name:'first',left:0,top:0,right:44,bottom:44},
    {name:'below',left:0,top:46,right:44,bottom:90},
  ]), []);
});

test('nested controls are excluded from sibling overlap checks', () => {
  assert.deepEqual(findInteractiveTargetOverlaps([
    {id:1,name:'plan',left:0,top:0,right:300,bottom:200},
    {id:2,parentId:1,name:'billing toggle',left:20,top:150,right:250,bottom:194},
  ]), []);
});
