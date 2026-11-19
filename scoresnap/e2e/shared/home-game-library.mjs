import assert from 'node:assert/strict';
export async function checkHomeGameLibrary(page, screenshotPath) {
  const button = page.getByTestId('home-see-all-modes');
  await button.waitFor();
  assert.equal(await button.getAttribute('role'), 'button');
  assert.equal(await button.getAttribute('aria-label'), 'See all game modes');
  const box = await button.boundingBox();
  assert.ok(box.width >= 44 && box.height >= 44, 'Accessible tap target');
  await button.click({timeout:10000});
  await page.getByRole('heading', {name:'50+ game modes', exact:true}).waitFor();
  const rows = page.locator('[data-testid^="game-mode-row-"]');
  assert.ok(await rows.count() >= 50, 'At least 50 playable rows');
  for (const row of await rows.all()) {
    await row.scrollIntoViewIfNeeded();
    assert.ok(await row.isVisible(), 'Each mode can be scrolled into view');
  }
  await rows.first().scrollIntoViewIfNeeded();
  const viewport = page.viewportSize();
  if (screenshotPath) {
    await page.setViewportSize({width:440,height:956});
    await page.screenshot({path:screenshotPath});
    await page.setViewportSize(viewport);
  }
  await page.getByTestId('game-mode-row-stroke_play').click();
  await page.getByTestId('game-info-sheet').waitFor({state:'visible'});
  assert.ok(await page.getByTestId('game-info-sheet').getByText('Stroke Play', {exact:true}).isVisible());
  await page.getByTestId('game-info-scrim').click();
}
