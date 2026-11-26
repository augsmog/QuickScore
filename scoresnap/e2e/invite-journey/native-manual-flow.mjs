import assert from 'node:assert/strict';
export const hostName='JourneyHost', guestName='Journey Guest', guestVisitor='Journey Visitor';
export const id=id=>({id});
export const tap=tapOn=>({tapOn});
export const wait=visible=>({extendedWaitUntil:{visible,timeout:30000}});
export const launch={launchApp:{clearState:false,permissions:{all:'allow'}}};
const fill=(selector,inputText)=>[tap(selector),{inputText}];
const scroll=(element,direction='DOWN')=>({scrollUntilVisible:{element: typeof element==='string'?{text:element}:element,direction,timeout:20000}});
const newContestTitle='^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) Round$';
const codePattern=/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function signInSteps(email,password) {
  return [launch,tap('Skip'),wait('Already have an account\\? Sign in'),tap('Already have an account\\? Sign in'),
    ...fill('Email address',email),...fill('Password',password),{hideKeyboard:{}},tap('^Sign In$'),wait(id('home-new-contest'))];
}
export function hostCreateSteps(name) {
  assert.match(name,/^Native Journey [a-f0-9]{12}$/);
  return [wait(id('home-join-code')),tap(id('home-new-contest')),wait(id('contest-step-setup')),
    ...fill(newContestTitle,name),{hideKeyboard:{}},scroll('Player 2 name'),...fill('Player 2 name',guestName),{hideKeyboard:{}},
    scroll(id('add-group')),tap(id('add-group')),scroll(id('player-group-'+guestName),'UP'),tap(id('player-group-'+guestName)),
    tap(id('contest-continue')),wait(id('contest-step-gamemodes')),tap(id('contest-continue')),
    wait(id('contest-step-round-settings')),tap(id('contest-start')),wait(id('round-status-chip')),
    wait('Enable online sharing'),tap('Enable online sharing'),wait(id('organizer-join-code'))];
}
export function guestRequestSteps(code) {
  assert.match(code,codePattern);assert.notEqual(code,'DGTWEW');
  return [launch,wait('Join a group'),tap('Join a group'),wait('^Join with code$'),
    ...fill('^Join code$',code),...fill('^Display name$',guestVisitor),{hideKeyboard:{}},tap('Find contest'),
    wait('Request sent.*'),{assertNotVisible:'.*Guest sign-in unavailable.*'},{assertNotVisible:'.*Approved online scorecard.*'}];
}
export function guestReconnectSteps(name) {
  assert.match(name,/^Native Journey [a-f0-9]{12}$/);
  const scorecard=id('home-join-code');
  // Identity persists from actual request; do not resubmit or inject the code on reconnect.
  return [launch,wait(scorecard),tap(scorecard),wait(name+' · Approved online scorecard')];
}
export function hostReopenSteps(name) {
  assert.match(name,/^Native Journey [a-f0-9]{12}$/);
  return [launch,wait(id('home-new-contest')),tap('^Contests$'),wait(name),tap(name),wait(id('round-status-chip'))];
}
export function hiddenEntrySteps(email,password) {
  return [launch,wait('Skip'),{assertNotVisible:'Join a group'},...signInSteps(email,password).slice(1,4),
    {assertNotVisible:'^Join with code$'},...signInSteps(email,password).slice(4),
    {assertNotVisible:id('home-join-code')}];
}
export function deriveFreshFixture(seed,row,snapshot) {
  assert.match(row.id,uuid);assert.equal(row.owner_id,seed.hostSession.user.id);
  assert.equal(row.name,seed.name);assert.equal(stateFresh(row.created_at,seed.startedAt),true,'round must originate in this run');
  assert.equal(snapshot.contest_id,row.id);assert.equal(snapshot.name,seed.name);
  const code=snapshot.invite_code;assert.match(code,codePattern);assert.notEqual(code,'DGTWEW');
  assert.equal(snapshot.rounds.length,1);
  const round=snapshot.rounds[0];assert.match(round.id,uuid);assert.equal(round.name,seed.name);
  assert.equal(round.course.holes.length,18);assert.equal(round.course.holes[0].par,4);
  assert.equal(round.players.length,2);assert.equal(round.groups.length,2);
  const players=[{name:hostName,score:4,group:'Group 1'},{name:guestName,score:6,group:'Group 2'}].map(expected=>{
    const matches=round.players.filter(p=>p.displayName===expected.name);assert.equal(matches.length,1);
    const p=matches[0];assert.match(p.id,uuid);assert.match(p.group_id,uuid);
    assert.equal(round.groups.filter(g=>g.id===p.group_id && g.name===expected.group).length,1);
    assert.equal(p.cells.length,18);assert(p.cells.every(c=>c.strokes===null),'round not empty');
    return {name:expected.name,score:expected.score,id:p.id,groupId:p.group_id};
  });
  assert.equal(new Set(players.map(p=>p.groupId)).size,2);
  return {api:seed.api,anonKey:seed.anonKey,adminKey:seed.adminKey,hostSession:seed.hostSession,code,contestId:row.id,roundId:round.id,hole:1,players};
}
const stateFresh=(createdAt,startedAt)=>Number.isFinite(Date.parse(createdAt)) && Date.parse(createdAt)>=startedAt;
