/** Compare pdftotext -layout output from a saved/reopened PDF with a frozen fixture.
 * Whitespace/Unicode normalization only: scores, totals, order and names stay exact.
 */
const fs=require('node:fs');
const {execFileSync}=require('node:child_process');
const normalize=text=>text.normalize('NFC').replace(/\s+/g,' ').trim();
function compareScorecardText(text,fixture){
 const errors=[];
 if(typeof text!=='string'||!text.trim())return {status:'failed',errors:['missing extracted PDF text']};
 if(fixture?.schema!=='snapscore-pdf-fixture/1')return {status:'failed',errors:['fixture schema']};
 const e=fixture.expected;
 if(!Array.isArray(e?.players)||e.players.length===0||!Array.isArray(e?.results)||e.results.length!==e.players.length)return {status:'failed',errors:['fixture expectations']};
 const rows=text.split(/[\r\n\f]+/).map(normalize).filter(Boolean);
 const wanted=[e.title,e.course,fixture.contest.createdAt];
 for(const p of e.players){
  if(!Array.isArray(p.scores)||p.scores.length!==18||p.scores.some(n=>!Number.isInteger(n)||n<=0)||p.scores.reduce((a,b)=>a+b,0)!==p.total){errors.push(`invalid frozen scores/total: ${p.name}`);continue;}
  wanted.push(p.name);
  for(let i=0;i<18;i+=9){wanted.push(Array.from({length:9},(_,j)=>String(i+j+1)).join(' '),p.scores.slice(i,i+9).join(' '));}
  wanted.push(String(p.total));
 }
 wanted.push('Results:',...e.results);
 let cursor=0;
 for(const line of wanted){
  if(typeof line!=='string'){errors.push('invalid frozen text');continue;}
  const at=rows.indexOf(normalize(line),cursor);
  if(at<0)errors.push(`missing/changed PDF row: ${line}`);else cursor=at+1;
 }
 return {schema:'snapscore-pdf-comparison/1',status:errors.length?'failed':'passed',errors};
}
function compareSavedPdf(pdfPath,fixture,execute=execFileSync){
 // Missing extractor, unreadable/corrupt file and extraction failure never pass.
 if(!fs.readFileSync(pdfPath).subarray(0,5).equals(Buffer.from('%PDF-')))throw Error('not a PDF');
 return compareScorecardText(execute('pdftotext',['-layout',pdfPath,'-'],{encoding:'utf8'}),fixture);
}
module.exports={compareScorecardText,compareSavedPdf};
if(require.main===module){
 try{const r=compareSavedPdf(process.argv[2],JSON.parse(fs.readFileSync(process.argv[3],'utf8')));console.log(JSON.stringify(r,null,2));process.exitCode=r.status==='passed'?0:1;}
 catch(e){console.error(`PDF comparison failed: ${e.message}`);process.exitCode=1;}
}
