import {chromium} from 'playwright';
const out='/workspace/aos-state/reports/ss-copyfix-20261031';
const browser=await chromium.launch();
try {
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 const page=await context.newPage();
 const course={name:'Pine Valley GC',holes:Array.from({length:18},(_,i)=>({num:i+1,par:4,hcp:i+1,yards:380}))};
 const contest={id:'copyfix-round',name:'Thursday round',course,status:'completed',betUnit:5,hasTeams:false,groups:[{id:'g',name:'Group 1',players:[{id:'a',name:'Amy',handicap:0,team:null,scores:Array(18).fill(4)},{id:'b',name:'Ben',handicap:0,team:null,scores:Array(18).fill(5)}]}],games:['stroke_play'],createdAt:new Date().toISOString()};
 await page.addInitScript(c=>{
 localStorage.setItem('snapscore-contests',JSON.stringify({version:0,state:{contests:[c],activeContestId:c.id}}));
 localStorage.setItem('snapscore-onboarding',JSON.stringify({version:0,state:{hasCompletedOnboarding:true,hasSeenDemo:true}}));
 },contest);
 await page.goto('http://127.0.0.1:18149/profile',{waitUntil:'networkidle'});
 await page.getByText('ROUND RESULTS',{exact:true}).waitFor();
 await page.screenshot({path:out+'/profile-390.png',fullPage:true});
 await page.goto('http://127.0.0.1:18149/contest/copyfix-round/settlement',{waitUntil:'networkidle'});
 await page.getByText(/^settlement$/i).locator('visible=true').first().click({force:true});
 await page.getByText('Try Pro free for 7 days',{exact:true}).waitFor();
 await page.screenshot({path:out+'/free-settlement-390.png'});
 console.log('PASS profile and Free teaser at 390px');
 await context.close();
 const onboarding=await browser.newPage({viewport:{width:390,height:844}});
 await onboarding.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
 await onboarding.goto('http://127.0.0.1:18151/onboarding',{waitUntil:'networkidle'});
 console.log('ONBOARD BODY',await onboarding.locator('body').innerText());
 await onboarding.getByText(/^next$/i).locator('visible=true').first().click({force:true});
 await onboarding.waitForTimeout(800);
 await onboarding.screenshot({path:out+'/onboarding-slide2-390.png'});
 console.log('PASS onboarding slide 2 at 390px');
} finally {await browser.close();}
