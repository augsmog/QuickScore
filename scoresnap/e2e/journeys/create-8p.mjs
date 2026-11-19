import assert from 'node:assert/strict';

export const creationPlayers=['Augie','Sam','Alex','Blair','Casey','Drew','Ellis','Frankie'];
export function assertCreatedTournament(contests) {
  assert.equal(contests.length,1,'exactly one contest created');
  const c=contests[0];
  assert.equal(c.isTournament,true,'multi-day selection must persist');
  assert.equal(c.currentRound,1);
  assert.equal(c.rounds?.length,2,'both rounds must persist');
  const expected=[creationPlayers.slice(0,4),creationPlayers.slice(4)];
  const groups=gs=>{
    assert.equal(gs.length,2);
    assert.deepEqual(gs.map(g=>g.players.map(p=>p.name)),expected,'exact four-player group assignments');
    for(const g of gs)for(const p of g.players)assert.deepEqual(p.scores,Array(18).fill(0));
  };
  groups(c.groups);
  assert.deepEqual(c.rounds.map(r=>r.number),[1,2]);
  assert.equal(new Set(c.rounds.map(r=>r.id)).size,2);
  for(const r of c.rounds)groups(r.groups);
}

// Reveal only through counted wheel actions; activation geometry stays enforced
// by the runner, including the short SE viewport and clipped ancestors.
async function reveal({page,act},locator) {
  await locator.waitFor({state:'attached'});
  for(let i=0;i<20;i++) {
    const state=await locator.evaluate(el=>{
      const r=el.getBoundingClientRect();let s=el.parentElement;
      while(s&&!(s.scrollHeight>s.clientHeight+1&&/(auto|scroll)/.test(getComputedStyle(s).overflowY)))s=s.parentElement;
      const b=s?s.getBoundingClientRect():{top:0,bottom:innerHeight};
      const top=Math.max(0,b.top),bottom=Math.min(innerHeight,b.bottom);
      if(r.top>=top+2&&r.bottom<=bottom-2)return {visible:true};
      if(!s)throw Error('No scrollable ancestor for creation control');
      document.querySelectorAll('[data-creation-scroll]').forEach(n=>n.removeAttribute('data-creation-scroll'));
      s.setAttribute('data-creation-scroll','active');
      return {delta:Math.max(-500,Math.min(500,r.top<top?r.top-top-24:r.bottom-bottom+24))};
    });
    if(state.visible)return;
    await act.scroll(page.locator('[data-creation-scroll="active"]'),state.delta);
  }
  throw Error('Creation control exceeds twenty bounded scrolls');
}
export async function create8p(q) {
  const {page,act,check,step,enter}=q;
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('snapscore-contests')||'null')?.state.contests||[]);
  const press=async locator=>{await reveal(q,locator);await act.activate(locator);};
  await check('entry',async()=>assert.deepEqual(await saved(),[]));
  await press(page.getByTestId('home-new-contest'));await enter('create');await step('create');
  await press(page.getByTestId('tournament-toggle').getByRole('switch'));
  await press(page.getByTestId('rounds-2'));await step('two-rounds');
  for(const [i,name]of creationPlayers.entries()) {
    if(i>=2)await press(page.getByText('+ ADD PLAYER',{exact:true}).locator('..'));
    const input=page.getByPlaceholder(i===0?'Your name':`Player ${i+1} name`,{exact:true});
    await reveal(q,input);await act.type(input,name);
  }
  const course=page.getByPlaceholder('My Course',{exact:true});
  await reveal(q,course);await act.type(course,'Creation Course');await step('eight-players');
  await press(page.getByTestId('add-group'));
  for(const name of creationPlayers.slice(4))await press(page.getByTestId(`player-group-${name}`));
  await step('two-groups');
  await press(page.getByText('Continue',{exact:true}));await enter('setup-modes');await step('modes');
  await press(page.getByText('Continue',{exact:true}));await enter('setup-settings');await step('settings');
  await press(page.getByText('Start',{exact:true}));
  await check('destination',()=>page.waitForURL(/\/contest\/(?!new$)[^/]+$/));
  await enter('round-scorecard');
  await check('outcome',async()=>assertCreatedTournament(await saved()));await step('created');
}
