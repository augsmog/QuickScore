import test from 'node:test';
import assert from 'node:assert/strict';
import {assertScoreControl} from './score-control.mjs';
function control(children) {return {getByText(text,options){assert.equal(options.exact,true);const matches=children.filter(s=>s===text);return {count:async()=>matches.length,innerText:async()=>matches[0]};}};}
test('numeric score child is asserted separately from the par/bogey label',async()=>{
  await assertScoreControl(control(['4','PAR']),4);
  await assertScoreControl(control(['6','DOUBLE BOGEY']),6);
});
test('wrong, missing, substring and duplicate numeric values cannot satisfy score assertion',async()=>{
  for(const children of [['5','PAR'],['PAR'],['14','PAR'],['4','4','PAR']]) await assert.rejects(assertScoreControl(control(children),4));
});
