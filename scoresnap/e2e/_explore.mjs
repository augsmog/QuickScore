import {chromium} from 'playwright';
const base=process.env.BASE_URL||'http://127.0.0.1:8192';
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844}});
await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
const p=await c.newPage(); await p.goto(base+(process.env.PATHX||'')); await p.waitForTimeout(2500);
await p.screenshot({path:'/tmp/qs-explore/'+(process.env.NAME||'home')+'.png',fullPage:true});
const els=await p.evaluate(()=>[...document.querySelectorAll('[role=button],a,button,input,[data-testid]')].filter(e=>e.offsetParent!==null).map(e=>{const r=e.getBoundingClientRect();return `${e.tagName}|${e.getAttribute('role')||''}|${e.getAttribute('data-testid')||''}|${(e.getAttribute('aria-label')||e.innerText||e.placeholder||'').replace(/\s+/g,' ').slice(0,60)}|y=${Math.round(r.y)}`}));
console.log(els.join('\n')); console.log('URL',p.url()); await b.close();
