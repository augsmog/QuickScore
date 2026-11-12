import assert from 'node:assert/strict';
// Validate the complete value before checking individual fragments. Whitespace
// contributes ordering/spacing but has no glyph pixels of its own.
export function validateTextFragments(fragments,expected,rendered) {
 assert.equal(typeof expected,'string');assert(expected.trim().length>0,'Nonempty expected value required');
 assert.equal(rendered.trim(),expected,'Rendered value differs');
 const joined=fragments.join('');assert.equal(joined.trim(),expected,'Text fragments missing, reordered or duplicated');
 const boundaries=new Set([0,joined.length]);for(const {index} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(joined))boundaries.add(index);
 let offset=0;for(const fragment of fragments){offset+=fragment.length;assert(boundaries.has(offset),'Unsupported grapheme split across text nodes');}
 const meaningful=fragments.map((text,index)=>({text,index})).filter(x=>/\S/u.test(x.text));assert(meaningful.length>0,'No meaningful text fragments');return meaningful.map(x=>x.index);
}

// Preserve the old single-line value restriction across node boundaries. DOM
// order alone must not let CSS-reordered, gapped or wrapped fragments pass.
export function validateTextRunGeometry(runs) {
 const nonempty=runs.filter(r=>r.text.length>0);let previous;
 for(const run of nonempty){
  assert.equal(run.rects?.length,1,'Value fragments must form one unwrapped line');const rect=run.rects[0];
  assert(rect.width>0&&rect.height>0,'Value fragment has no layout');
  if(previous){const tolerance=1/32;assert(Math.abs(rect.y-previous.y)<=tolerance&&Math.abs(rect.height-previous.height)<=tolerance&&Math.abs(rect.x-(previous.x+previous.width))<=tolerance,'Value fragments not contiguous in visible order');}
  previous=rect;
 }
 assert(nonempty.length>0,'No value layout');
}
