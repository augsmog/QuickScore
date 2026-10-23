import assert from 'node:assert/strict';
export async function visible(control) {
  await control.waitFor({state:'visible'});
  assert.equal(await control.count(), 1, 'control must be unique');
  assert(await control.isEnabled(), 'control must be enabled');
}
export const UH1 = visible;
export async function UH2(page, control, destination) {
  await UH1(control);
  await control.click();
  await destination();
}
export async function UH3(page, control, {escape, restored} = {}) {
  await visible(control);
  // Prove keyboard reachability using real Tab navigation, never focus() injection.
  let reached = false;
  for (let i=0; i<80; i++) {
    await page.keyboard.press('Tab');
    if (await control.evaluate(el => el === document.activeElement)) { reached=true; break; }
  }
  assert(reached, 'dismiss must be keyboard reachable');
  if (escape) {
    await page.keyboard.press('Escape');
    await escape();
    assert(await restored.evaluate(el=>el === document.activeElement), 'focus restored to opener');
  } else await page.keyboard.press('Enter');
}
export async function UH4(page, {cancel, destination, unchanged}) {
  await UH2(page, cancel, destination);
  await unchanged();
}
export async function UH5(page, {error, recovery, destination}) {
  await visible(error);
  await UH2(page, recovery, destination);
}
export async function UH6(page, {entry, dismiss, destination}) {
  await visible(entry);
  await UH1(dismiss); // Before any submit: OS history/Escape alone cannot satisfy this.
  await UH2(page, dismiss, destination);
}
