// Exercise actual screen handlers with the repository's isolated renderer fixtures.
const fs=require('fs'),path=require('path');
const app=path.resolve(__dirname,'../../scoresnap');
process.chdir(app);
function fixture(file,code,expression){
 const localRequire=id=>id.startsWith('.')?require(path.resolve(app,'tests',id)):require(id);
 return new Function('require','jest','expect','structuredClone',code+'\nreturn '+expression)(localRequire,jest,expect,structuredClone);
}
const wizardSource=fs.readFileSync('tests/new-contest-paywall.test.cjs','utf8');
const wizard=fixture('wizard',wizardSource.slice(0,wizardSource.indexOf('const gameCard')).replace("firstName: 'Augie'","firstName: 'Golfer'"),'harness');
const ledger=fs.readFileSync('tests/paywall-clubhouse-ledger.test.cjs','utf8');
const pwCode=ledger.slice(0,ledger.indexOf("test('AC-PW1"))+ledger.slice(ledger.indexOf('function screen('),ledger.indexOf("test('AC-PW3"));
const paywall=fixture('paywall',pwCode,'({screen,nodes,text,button,C})');
const {act}=require('react-test-renderer');
test('ordinary wizard handlers route free two-name two-round draft; fallback Close preserves names',()=>{
 const h=wizard('free');expect(h.players()[0].name).toBe('Golfer');
 for(let i=0;i<3;i++)h.press('+ ADD PLAYER');expect(h.players()).toHaveLength(5);
 expect(h.byId('contest-continue').disabled).toBe(true);h.input('Player 2 name','QA Guest');
 expect(h.byId('contest-continue').disabled).toBe(false);
 expect(h.players().filter(p=>p.name.trim())).toHaveLength(2);
 expect(h.find(n=>n.type==='Text' && n.props.children==='2 ready')).toBeDefined();
 act(()=>h.byId('tournament-toggle').onValueChange(true));act(()=>h.byId('rounds-2').onPress());
 h.press('Continue');expect(h.byId('game-mode-stroke_play').accessibilityState.selected).toBe(true);
 h.press('Continue');h.press('Start');expect(h.push).toHaveBeenCalledWith('/paywall?tier=td');expect(h.addContest).not.toHaveBeenCalled();
 const p=paywall.screen({owner:'free',target:'td',restore:()=>{throw Error('RESTORE_FORBIDDEN')}});const tree=p.render();
 expect(paywall.text(tree)).toContain('Run the game. We do the math.');expect(paywall.text(tree)).toContain('$79.99/year');
 expect(paywall.button(tree,'Currently unavailable').props.disabled).toBe(true);
 const close=paywall.nodes(tree).find(n=>n.props?.testID==='paywall-close');close.props.onPress();expect(p.back).toHaveBeenCalledTimes(1);
 // Router back is observed above; retained wizard instance is the repository's fixture contract.
 h.press('Back');h.press('Back');expect(h.players().map(p=>p.name)).toEqual(['Golfer','QA Guest','','','']);h.press('Continue');expect(h.byId('game-mode-stroke_play')).toBeDefined();h.press('Back');expect(h.byId('tournament-toggle').value).toBe(true);expect(h.addContest).not.toHaveBeenCalled();
});
test('missing second name blocks ordinary Continue; entitled two-round control creates instead',()=>{
 const invalid=wizard('free');expect(invalid.byId('contest-continue').disabled).toBe(true);
 const entitled=wizard('td');entitled.input('Your name','QA Host');entitled.input('Player 2 name','QA Guest');act(()=>entitled.byId('tournament-toggle').onValueChange(true));entitled.press('Continue');entitled.press('Continue');entitled.press('Start');expect(entitled.push).not.toHaveBeenCalled();expect(entitled.addContest).toHaveBeenCalledTimes(1);
});
