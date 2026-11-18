import assert from 'node:assert/strict';
export function disposableURL(value) {
  const u=new URL(value);
  assert.equal(u.origin,'http://127.0.0.1:54321','Disposable API must be exact loopback stack');
  assert(!u.username && !u.password && u.pathname==='/' && !u.search && !u.hash,'API must have no credentials/path/query');
  return u.origin;
}
export function validateFixture(f) {
  disposableURL(f.api);
  assert.match(f.code,/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  assert.notEqual(f.code,'DGTWEW','Production invite is forbidden');
  assert.equal(f.players.length,2); assert.equal(new Set(f.players.map(p=>p.groupId)).size,2);
  assert.equal(new Set(f.players.map(p=>p.id)).size,2); assert.equal(f.hole,1);
}
export function assertBinding(f,m,actor) {
  assert.equal(m.user_id,actor); assert.equal(m.player_id,f.players[1].id); assert.equal(m.status,'approved');
}
export function assertShare(f,payload) {
  const urls=payload.match(/(?:snapscore:\/\/|https?:\/\/)[^\s]+/g) ?? [];
  assert(urls.some(value=>new URL(value).pathname===(value.startsWith('snapscore:')?`/${f.code}`:`/join/${f.code}`) &&
    (!value.startsWith('snapscore:') || new URL(value).hostname==='join')),'Actual share URL must contain canonical invite');
}
export function assertScores(f,s) {
  assert.equal(s.contest_id,f.contestId); assert.equal(s.invite_code,f.code);
  const rounds=s.rounds.filter(r=>r.id===f.roundId); assert.equal(rounds.length,1);
  for(const expected of f.players) {
    const matches=rounds[0].players.filter(p=>p.id===expected.id); assert.equal(matches.length,1);
    const p=matches[0]; assert.equal(p.group_id,expected.groupId);
    assert.equal(rounds[0].groups.filter(g=>g.id===p.group_id).length,1);
    const cells=p.cells.filter(c=>c.hole===f.hole); assert.equal(cells.length,1); assert.equal(cells[0].strokes,expected.score);
    assert.equal(p.cells.filter(c=>c.hole===2).length,1,'Untouched hole is present');
    for(const cell of p.cells.filter(c=>c.hole!==f.hole)) assert.equal(cell.strokes,null,'Unedited hole stays clear');
  }
}
// These reads are permitted only after validateFixture; never log responses or keys.
export function backend(f) {
  validateFixture(f);
  async function read(resource) {
    const response=await fetch(`${f.api}/rest/v1/${resource}`,{headers:{apikey:f.anonKey,Authorization:`Bearer ${f.adminKey}`}});
    assert(response.ok,'Disposable backend read failed');return response.json();
  }
  return { read, snapshot:async()=>{
    const r=await fetch(`${f.api}/rest/v1/rpc/fetch_snapshot`,{method:'POST',headers:{apikey:f.anonKey,Authorization:`Bearer ${f.hostSession.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({contest_id:f.contestId,after_revision:0})});
    assert(r.ok,'Authorized host snapshot failed'); return r.json();
  }};
}
export async function eventually(check) {
  const end=Date.now()+30000;
  do {try {return await check();}catch{} await new Promise(r=>setTimeout(r,250));}while(Date.now()<end);
  throw Error('Journey assertion did not converge within 30s');
}
