import {chromium} from 'playwright';
import fs from 'node:fs';
const base=process.env.BASE_URL||'http://127.0.0.1:8192'; const out='/tmp/qs-explore/j'; fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844}});
await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
if(process.env.TIER){await c.addInitScript(t=>localStorage.setItem('snapscore-scans',JSON.stringify({version:1,state:{tier:t,isPro:true,isTD:t==='td',scanMonth:'',scansUsed:0}})),process.env.TIER);}
const p=await c.newPage(); p.setDefaultTimeout(5000); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
let taps=0, n=0; const log=[];
const dump=async(tag)=>{n++; await p.waitForTimeout(700); await p.screenshot({path:`${out}/${String(n).padStart(2,'0')}-${tag}.png`});
 const t=await p.evaluate(()=>[...document.querySelectorAll('[role=button],button,input,[data-testid],a')].filter(e=>e.offsetParent!==null).map(e=>`${e.getAttribute('data-testid')||''}:${(e.getAttribute('aria-label')||e.innerText||e.placeholder||'').replace(/\s+/g,' ').slice(0,40)}`).slice(0,60));
 log.push({n,tag,url:p.url(),taps,els:t}); console.log(`#${n} ${tag} taps=${taps} ${p.url()}\n  `+t.join(' | '));};
const tap=async(loc)=>{taps++; await loc.click();};
const fill=async(loc,v)=>{taps++; await loc.fill(v);};
await p.goto(base); await p.waitForTimeout(2000); await dump('home');
await tap(p.getByTestId('home-new-contest')); await dump('new');
const names=['Augie','Sam','Lee','Pat','Max','Kai','Jo','Ray'];
await fill(p.getByPlaceholder('Your name'),names[0]); await fill(p.getByPlaceholder('Player 2 name'),names[1]);
for(let i=2;i<8;i++){ await tap(p.getByText(/add player/i).first()); await fill(p.getByPlaceholder(`Player ${i+1} name`),names[i]); }
await dump('8players');
const step=async(tag,fn)=>{try{await fn(); await dump(tag);}catch(e){console.log('STEPFAIL',tag,String(e).slice(0,200)); await dump('FAIL-'+tag);}};
await step('multiday',async()=>{await tap(p.getByTestId('tournament-toggle')); });
if(p.url().includes('paywall')){await step('paywall-close',async()=>{await tap(p.getByRole('button',{name:/close/i}).first());}); const kept=await p.getByPlaceholder('Player 8 name').inputValue().catch(()=>'MISSING'); console.log('AFTER_PAYWALL player8=',kept);}
await step('rounds2',async()=>{await tap(p.getByTestId('rounds-2'));});
await step('group2',async()=>{await tap(p.getByTestId('add-group'));});
await step('assign',async()=>{for(const nm of ['Max','Kai','Jo','Ray']) await tap(p.getByTestId('player-group-'+nm));});
await step('next1',async()=>{await tap(p.getByText(/^next/i).last());});
await step('next2',async()=>{await tap(p.getByText(/^next/i).last());});
await step('start',async()=>{await tap(p.getByText(/start contest/i));});
const contestUrl=p.url(); console.log('CONTEST',contestUrl,'TAPS_TO_CREATE',taps);
await step('reload',async()=>{await p.reload(); await p.waitForTimeout(2000);});


await step('score-plus',async()=>{await tap(p.getByTestId('score-plus-Augie'));});
await step('next-hole-x17',async()=>{for(let i=0;i<17;i++) await tap(p.getByTestId('score-next-hole'));});
await step('group2',async()=>{await tap(p.getByText('Group 2',{exact:true}));});
await step('finalize',async()=>{await tap(p.getByText(/Finalize Round/i));});
await step('settlement-tab',async()=>{await tap(p.getByText(/^settlement$/i).first());});
await step('home-tab',async()=>{await p.goto(base+'/contests'); await p.waitForTimeout(1500);});
fs.writeFileSync(out+'/log.json',JSON.stringify({log,errs},null,1));
await b.close();
