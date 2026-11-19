const {PDFDocument,PDFName}=require('pdf-lib');
const fs=require('node:fs');
const {extractScorecardText}=require('../e2e/shared/pdf-scorecard-extract.cjs');
async function fixture(){
 const doc=await PDFDocument.create();doc.registerFontkit(require('@pdf-lib/fontkit'));
 const font=await doc.embedFont(fs.readFileSync('assets/fonts/SourceSans3_400Regular.ttf'),{subset:false});
 const page=doc.addPage();page.drawText('Zoë Δημήτρης Алексей',{font,size:10,x:40,y:750});page.drawText('71',{font,size:10,x:40,y:730});
 return {doc,page};
}
test('portable extractor decodes real embedded Unicode and positioned rows',async()=>{
 const {doc}=await fixture();expect(await extractScorecardText(await doc.save())).toBe('Zoë Δημήτρης Алексей\n71');
});
test('portable extraction fails closed on unknown operators, unmapped glyphs and corrupt bytes',async()=>{
 for(const raw of ['BT /Font 10 Tf 1 0 0 1 0 0 Tm <0000> Tj ET','/Unknown Do','[<0001>] TJ']){
  const {doc,page}=await fixture();page.node.addContentStream(doc.context.register(doc.context.flateStream(raw)));
  await expect(extractScorecardText(await doc.save())).rejects.toThrow();
 }
 await expect(extractScorecardText(Buffer.from('not a PDF'))).rejects.toThrow();
});
