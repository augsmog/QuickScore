const {execFileSync}=require('node:child_process');
const path=require('node:path');
for(const file of ['binding.test.ts','payload.test.ts','packet.test.ts']) {
 test('ASC approved-source acceptance: '+file,()=>{
  const output=execFileSync(process.execPath,[require.resolve('tsx/cli'),'store/asc/__tests__/'+file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8',timeout:30000});
  expect(output).toContain('passed');
 });
}
