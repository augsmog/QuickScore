import assert from 'node:assert/strict';
export const strokeKey=JSON.stringify([JSON.stringify(['Sam','Augie','stroke_play',5]),0]);
export const nassauKey=JSON.stringify([JSON.stringify(['Sam','Augie','nassau',15]),0]);
export function assertStrokeMark(ledger){assert.deepEqual(Object.keys(ledger?.marks||{}),[strokeKey],'Only intended Stroke Play transaction marked');const stamp=ledger.marks[strokeKey];assert(Number.isFinite(Date.parse(stamp)));assert.equal(ledger.marks[nassauKey],undefined);return stamp;}
