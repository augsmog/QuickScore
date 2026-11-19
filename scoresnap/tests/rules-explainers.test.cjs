const {execFileSync}=require('node:child_process');
const path=require('node:path');
const fixtures=require('./fixtures/rules-explainer-examples.json');
for (const fixture of fixtures) test(fixture.id,()=>{
 execFileSync(process.execPath,['--import','tsx',path.join(__dirname,'rules-explainer-runner.mjs'),fixture.id],{stdio:'pipe'});
});
