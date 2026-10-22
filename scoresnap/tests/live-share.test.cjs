const { execFileSync } = require('node:child_process');
const run = body => void execFileSync(process.execPath, ['--import','tsx','--input-type=module','-e', `
import assert from 'node:assert/strict';
const mod = await import('./src/services/live-share-snapshot.ts');
const { buildSnapshot, validShareToken, linkExpired } = mod.default ?? mod;
const contest = {id:'private-contest-id',name:'Private round',email:'private@example.com',course:{name:'Private location',holes:[{num:1,par:4,hcp:1,yards:400},{num:2,par:4,hcp:2,yards:400}]},status:'active',betUnit:100,groups:[{id:'private-group',name:'Private group',players:[{id:'private-player',name:'Sam',email:'private@example.com',handicap:9,scores:[4,0],team:null},{id:'other-id',name:'Lee',handicap:0,scores:[5,0],team:null}]}],games:['stroke_play']};
${body}`], {encoding:'utf8'});
test('snapshot allowlist removes private fields and raw contest JSON',()=>run(`
const snapshot = buildSnapshot(contest); const text=JSON.stringify(snapshot);
for (const value of ['private','Private','example.com','handicap','betUnit','course','playerId','groupId','email']) assert(!text.includes(value),value);
assert.deepEqual(Object.keys(snapshot).sort(),['completed','games','players']);
assert.deepEqual(snapshot.players[0],{displayName:'Sam',scores:[4,0],total:4,toPar:0});
assert.deepEqual(Object.keys(snapshot.games[0]).sort(),['game','standings']);
assert.equal(snapshot.completed,false); assert.equal(buildSnapshot({...contest,status:'completed'}).completed,true);`));
test('snapshot normalizes invalid scores before totals',()=>run(`
contest.groups[0].players[0].scores=[-2,NaN,100];
assert.deepEqual(buildSnapshot(contest).players[0],{displayName:'Sam',scores:[0,0],total:0,toPar:0});`));
test('tokens require exactly 64 lowercase hexadecimal characters',()=>run(`
assert(validShareToken('a1'.repeat(32)));
for(const token of [null,undefined,1,'','a'.repeat(63),'a'.repeat(65),'A'.repeat(64),'g'.repeat(64),' '+ 'a'.repeat(64),'../abc','a'.repeat(64)+'?x']) assert(!validShareToken(token));`));
test('expiry denies at the boundary and rejects invalid timestamps',()=>run(`
const end=Date.parse('2026-10-22T12:00:00Z'); const expiry=new Date(end+7*86400000).toISOString();
assert(!linkExpired(expiry,end)); assert(!linkExpired(expiry,end+7*86400000-1));
assert(linkExpired(expiry,end+7*86400000)); assert(linkExpired(expiry,end+8*86400000)); assert(linkExpired('bad',end));`));
