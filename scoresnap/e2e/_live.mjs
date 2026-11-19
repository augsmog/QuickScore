import {chromium} from 'playwright';
const base=process.env.BASE_URL; const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844}});
const p=await c.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
// block any non-GET to keep the walk read-only
await c.route('**/*',r=>r.request().method()==='GET'||r.request().method()==='OPTIONS'?r.continue():r.abort());
await p.goto(base,{waitUntil:'networkidle'}).catch(()=>{}); await p.waitForTimeout(3000);
await p.screenshot({path:`/tmp/qs-explore/${process.env.NAME}-home.png`});
const t=await p.evaluate(()=>[...document.querySelectorAll('[role=button],button,a,input')].filter(e=>e.offsetParent!==null).map(e=>(e.getAttribute('data-testid')||'')+':'+(e.getAttribute('aria-label')||e.innerText||'').replace(/\s+/g,' ').slice(0,40)));
console.log(p.url(), t.join(' | '));
try{await p.getByTestId('home-join-code').click({timeout:4000}); await p.waitForTimeout(1500); await p.screenshot({path:`/tmp/qs-explore/${process.env.NAME}-join.png`}); console.log('join url',p.url());}catch(e){console.log('nojoin',String(e).slice(0,100));}
console.log('errs',errs); await b.close();
