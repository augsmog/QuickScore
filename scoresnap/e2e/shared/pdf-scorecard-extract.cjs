/** Text/layout reader for this app's pdf-lib scorecard emitter, using pinned deps.
 * Not a general PDF reader. Unknown operators/font maps fail instead of passing.
 */
const {PDFDocument,PDFName,PDFDict,PDFRawStream,PDFArray,decodePDFRawStream}=require('pdf-lib');
function decode(stream){return Buffer.from(decodePDFRawStream(stream).decode()).toString('utf8');}
function unicodeMap(stream){
 const text=decode(stream),map=new Map();
 if(/beginbfrange/.test(text))throw Error('unsupported PDF Unicode range map');
 for(const section of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)){
  for(const pair of section[1].matchAll(/<([\da-f]{4})>\s*<((?:[\da-f]{4})+)>/gi)){
   map.set(pair[1].toUpperCase(),Buffer.from(pair[2],'hex').swap16().toString('utf16le'));
  }
 }
 if(!map.size)throw Error('missing PDF Unicode mapping');return map;
}
async function extractScorecardText(bytes){
 const doc=await PDFDocument.load(bytes),pages=[];
 for(const page of doc.getPages()){
  const fonts=page.node.Resources().lookup(PDFName.of('Font'),PDFDict),maps=new Map();
  for(const key of fonts.keys())maps.set(key.toString(),unicodeMap(doc.context.lookup(fonts.get(key),PDFDict).lookup(PDFName.of('ToUnicode'),PDFRawStream)));
  const contents=page.node.Contents();if(!(contents instanceof PDFArray))throw Error('unsupported PDF contents');
  const rows=new Map();
  for(let i=0;i<contents.size();i++){
   const raw=decode(doc.context.lookup(contents.get(i),PDFRawStream));
   if(/\bTJ\b|\bDo\b/.test(raw))throw Error('unsupported PDF text/form operator');
   for(const block of raw.matchAll(/\bBT\b([\s\S]*?)\bET\b/g)){
    const body=block[1],font=/\/(\S+)\s+[\d.]+\s+Tf/.exec(body),matrix=/1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm/.exec(body),hex=/<([\da-f]*)>\s*Tj/ig;
    if(!font||!matrix||[...body.matchAll(/\bTj\b/g)].length!==1)throw Error('unsupported PDF text block');
    const encoded=[...body.matchAll(hex)];if(encoded.length!==1||encoded[0][1].length%4)throw Error('unsupported PDF glyph encoding');
    const map=maps.get('/'+font[1]);if(!map)throw Error('unmapped PDF font');
    let text='';for(const glyph of encoded[0][1].match(/.{4}/g)??[]){if(!map.has(glyph.toUpperCase()))throw Error('unmapped PDF glyph');text+=map.get(glyph.toUpperCase());}
    const x=Number(matrix[1]),y=Number(matrix[2]);const cells=rows.get(y)??[];cells.push({x,text});rows.set(y,cells);
   }
  }
  pages.push([...rows].sort((a,b)=>b[0]-a[0]).map(([,cells])=>cells.sort((a,b)=>a.x-b.x).map(c=>c.text).join(' ')).join('\n'));
 }
 const text=pages.join('\f');if(!text.trim())throw Error('no scorecard text extracted');return text;
}
module.exports={extractScorecardText};
