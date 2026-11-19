import {assertStrokeMark} from './settlement-row-contract.mjs';
import assert from 'node:assert/strict';
import {account,seedAcceptance,visible,text,press,reveal,persisted,waitState,stablePaint} from './acceptance-common.mjs';
const storage='snapscore-settlement-marks';
const scope=id=>JSON.stringify([account.id,`acceptance-round-${id}`]);
export async function acceptanceSetup(context,page,j,base) {
  if(j.id!=='J-settlement-mark-lifecycle')return false;
  await seedAcceptance(context,{kind:'settlement',tier:'pro'});
  await page.goto(base+'/');await visible(page.getByTestId('home-new-contest'));return true;
}
export async function acceptanceReady(page,id) {
  if(id==='acceptance-round'){await visible(page.getByTestId('contest-header'));await stablePaint(page);return true;}
  if(id==='acceptance-settlement'){await visible(page.getByTestId('settlement-scroll'));await stablePaint(page);return true;}
  return false;
}
export const acceptanceCases={'J-settlement-mark-lifecycle':async({page,act,check,step,enter,reload,navigate})=>{
  const row=game=>page.getByTestId('settlement-scroll').getByText(game,{exact:true}).locator('..');
  const mark=()=>row('stroke play').getByRole('button',{name:'Mark settled Sam to Augie',exact:true});
  const undo=()=>row('stroke play').getByRole('button',{name:'Unsettle Sam to Augie',exact:true});
  const otherUnmarked=async()=>{assert.equal(await row('nassau').getByRole('button',{name:'Unsettle Sam to Augie',exact:true}).count(),0);await visible(row('nassau').getByRole('button',{name:'Mark settled Sam to Augie',exact:true}));};
  const intendedRow=async()=>{await reveal(page,act,row('stroke play'));assert.equal(await row('stroke play').count(),1);await text(row('stroke play').getByText('Sam → Augie',{exact:true}),'Sam → Augie');await text(row('stroke play').getByText('$5.00',{exact:true}),'$5.00');await text(row('stroke play').getByText('stroke play',{exact:true}),'stroke play');};
  const open=async id=>{
    await navigate(`/contest/acceptance-round-${id}`);await enter('acceptance-round');
    await visible(page.getByTestId('contest-header').getByText(`Acceptance round ${id.toUpperCase()}`,{exact:true}));
    // Use existing adapter's test-only tab ID; do not add role/name semantics.
    await act.activate(page.getByTestId('journey-settlement'));await enter('acceptance-settlement');
  };
  await check('entry',async()=>{assert.equal((await persisted(page,'snapscore-auth')).user.id,account.id);const ledgers=(await persisted(page,storage))?.ledgers||{};assert.equal(Object.keys(ledgers).length,0);});
  await open('a');
  await check('unmarked',async()=>{assert.equal(await undo().count(),0);assert.equal(await page.getByRole('button',{name:'Mark settled Sam to Augie',exact:true}).count(),2);await text(page.getByTestId('settlement-session-total'),'$20.00');});await step('unmarked');
  await intendedRow();await press(page,act,mark());
  let saved,timestamp,label;
  await check('marked',async()=>{
    await visible(undo());label=(await undo().innerText()).trim();assert.match(label,/^Settled \S/);
    await waitState(page,storage,`s=>Object.keys(s?.ledgers?.[${JSON.stringify(scope('a'))}]?.marks||{}).length===1`);
    saved=(await persisted(page,storage)).ledgers[scope('a')];timestamp=assertStrokeMark(saved);await otherUnmarked();
  });await step('marked');
  await reload();await enter('acceptance-round');await act.activate(page.getByTestId('journey-settlement'));await enter('acceptance-settlement');
  await check('reload-persists',async()=>{await reveal(page,act,undo());await text(undo(),label);assert.deepEqual((await persisted(page,storage)).ledgers[scope('a')],saved);assert.equal(assertStrokeMark(saved),timestamp);await otherUnmarked();});await step('reloaded-mark');
  await open('b');
  await check('other-contest-unmarked',async()=>{assert.equal(await undo().count(),0);assert.equal(await page.getByRole('button',{name:'Mark settled Sam to Augie',exact:true}).count(),2);assert.equal(Object.keys((await persisted(page,storage))?.ledgers?.[scope('b')]?.marks||{}).length,0);});await step('other-unmarked');
  await intendedRow();await press(page,act,mark());
  let savedB;
  await check('other-contest-independent',async()=>{await visible(undo());await waitState(page,storage,`s=>Object.keys(s?.ledgers?.[${JSON.stringify(scope('b'))}]?.marks||{}).length===1`);const ledgers=(await persisted(page,storage)).ledgers;assert.deepEqual(ledgers[scope('a')],saved);savedB=ledgers[scope('b')];assertStrokeMark(savedB);await otherUnmarked();});await step('other-marked');
  await open('a');await press(page,act,undo());
  await check('undo',async()=>{await waitState(page,storage,`s=>Object.keys(s?.ledgers?.[${JSON.stringify(scope('a'))}]?.marks||{}).length===0`);assert.equal(await undo().count(),0);assert.deepEqual((await persisted(page,storage)).ledgers[scope('b')],savedB);});await step('undone');
  await reload();await enter('acceptance-round');await act.activate(page.getByTestId('journey-settlement'));await enter('acceptance-settlement');
  await check('undo-persists',async()=>{assert.equal(await undo().count(),0);assert.equal(await page.getByRole('button',{name:'Mark settled Sam to Augie',exact:true}).count(),2);});await step('undo-reloaded');
  await check('by-game-values',async()=>{
    // Source renders always-visible read-only rows; AUG-317 requires no expansion interaction.
    for(const [i,name,amount] of [[0,'Stroke Play','5.00'],[1,'Nassau','15.00']]) {
      const game=page.getByTestId(`settlement-game-${i}`);await reveal(page,act,game);await text(game.getByText(name,{exact:true}),name);await text(game.getByText('18 Holes',{exact:true}),'18 Holes');
      await text(page.getByTestId(`settlement-game-${i}-player-Augie`).getByText(`+$${amount}`,{exact:true}),`+$${amount}`);await text(page.getByTestId(`settlement-game-${i}-player-Augie`).getByText('Augie',{exact:true}),'Augie');
      await text(page.getByTestId(`settlement-game-${i}-player-Sam`).getByText(`−$${amount}`,{exact:true}),`−$${amount}`);await text(page.getByTestId(`settlement-game-${i}-player-Sam`).getByText('Sam',{exact:true}),'Sam');
      await step(`by-game-${i}`);
    }
  });
  await open('b');
  await check('outcome',async()=>{await reveal(page,act,undo());await visible(undo());assert.deepEqual((await persisted(page,storage)).ledgers[scope('b')],savedB);assert.equal(Object.keys((await persisted(page,storage)).ledgers[scope('a')].marks).length,0);});await step('other-still-marked');
}};
