import assert from 'node:assert/strict';

const MIN_TARGET_PX=44;
// Chromium's own layout occasionally rounds a true 44px box to e.g. 43.999969482421875
// (observed as exactly 44 - 2^-15). That's rendering jitter, not a real shortfall, so allow
// a small fixed epsilon rather than failing on sub-pixel noise.
const SUBPIXEL_EPS=0.01;

// Target size is the rendered border box, not the fragment visible at a scroll
// boundary. Reachability is separately checked by the journey before activation.
export async function assertTargetSize(locator) {
  assert.equal(await locator.count(),1,'target must be unique');
  const box=await locator.boundingBox();
  assert(box&&box.width>=MIN_TARGET_PX-SUBPIXEL_EPS&&box.height>=MIN_TARGET_PX-SUBPIXEL_EPS,`target must be >=44x44: ${JSON.stringify(box)}`);
  return box;
}
export async function assertLibraryTargets(page) {
  for(const id of ['skins','vegas','sixes'])await assertTargetSize(page.getByTestId(`game-mode-row-${id}`));
}
export async function assertHomeSettlementTargets(page,{chips=false}={}) {
  const cards=page.locator('[tabindex="0"]').filter({hasText:'Journey course'});
  assert(await cards.count()>0,'course entry card must exist');
  for(const card of await cards.all())await assertTargetSize(card);
  if(chips)for(const name of ['Stroke Play','Match Play']) {
    const chip=page.getByText(name,{exact:true}).locator('..').and(page.locator('[tabindex="0"]'));
    await assertTargetSize(chip);
  }
}
export async function assertSettlementTargets(page) {
  const buttons=page.getByRole('button',{name:/^(Mark settled|Unsettle) /});
  assert(await buttons.count()>0,'settlement controls must exist');
  for(const button of await buttons.all())await assertTargetSize(button);
}
export async function assertRulesSurface(page) {
  const sheet=page.getByTestId('game-info-sheet');
  // The dismissal scrim is behind this surface. Compare actual foreground
  // controls with each other and with unrelated text, not with its backdrop.
  const violations=await sheet.evaluate(root=>{
    const controls=[...root.querySelectorAll('[role="button"],button,[tabindex="0"]')];
    const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>2&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>2;
    const failures=[];
    for(let i=0;i<controls.length;i++)for(let j=i+1;j<controls.length;j++){
      if(!controls[i].contains(controls[j])&&!controls[j].contains(controls[i])&&overlap(controls[i].getBoundingClientRect(),controls[j].getBoundingClientRect()))failures.push('control-overlap');
    }
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode;if(!node.textContent.trim())continue;
      const range=document.createRange();range.selectNodeContents(node);
      for(const rect of range.getClientRects())for(const control of controls){
        if(!control.contains(node)&&overlap(rect,control.getBoundingClientRect()))failures.push(`text-over-control: ${node.textContent.trim()}`);
      }
    }
    return failures;
  });
  assert.deepEqual(violations,[]);
  await assertTargetSize(page.getByTestId('game-info-close'));
}
