import {chromium} from 'playwright';
const base='http://127.0.0.1:8192'; const b=await chromium.launch(); const c=await b.newContext({viewport:{width:390,height:844}});
await c.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
const p=await c.newPage(); p.setDefaultTimeout(4000);
const vis=async()=>(await p.evaluate(()=>[...document.querySelectorAll('[role=button],button,a,input,[data-testid]')].filter(e=>e.offsetParent!==null).map(e=>(e.getAttribute('data-testid')||'')+':'+(e.getAttribute('aria-label')||e.innerText||e.placeholder||'').replace(/\s+/g,' ').slice(0,35)))).join(' | ');
await p.goto(base); await p.waitForTimeout(2000);
await p.getByRole('tab',{name:/profile/i}).click(); await p.waitForTimeout(1200); console.log('PROFILE',p.url(),await vis()); await p.screenshot({path:'/tmp/qs-explore/profile.png',fullPage:true});
for (const t of [/settings/i,/account/i]) { try{ await p.getByText(t).first().click(); await p.waitForTimeout(1200); console.log('AFTER',t,p.url(),await vis()); break;}catch(e){console.log('no',t);} }
await p.screenshot({path:'/tmp/qs-explore/settings.png',fullPage:true});
try{await p.getByText(/delete account/i).first().scrollIntoViewIfNeeded(); console.log('DELETE visible:',await p.getByText(/delete account/i).first().isVisible());}catch(e){console.log('no delete account text');}
await p.goto(base); await p.waitForTimeout(1500); await p.getByTestId('home-see-all-modes').click(); await p.waitForTimeout(1200); console.log('MODES',p.url()); await p.screenshot({path:'/tmp/qs-explore/modes.png'});
await b.close();
