import assert from 'node:assert/strict';

// Padding cannot fix a scroll viewport which extends behind the footer.
export async function assertCreateFooterClear(page) {
  const geometry=await page.getByPlaceholder('Your name').evaluate(el=>{
    let scroll=el.parentElement;
    while(scroll&&!/auto|scroll/.test(getComputedStyle(scroll).overflowY))scroll=scroll.parentElement;
    const footer=document.querySelector('[data-testid="contest-continue"]').parentElement;
    const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
    return {scroll:scroll&&rect(scroll),footer:rect(footer)};
  });
  assert(geometry.scroll&&geometry.scroll.height>0,'New Contest scroll viewport must exist');
  assert(geometry.scroll.bottom<=geometry.footer.top+0.5,
    `New Contest scroll viewport overlaps Continue footer: ${JSON.stringify(geometry)}`);
  return geometry;
}
