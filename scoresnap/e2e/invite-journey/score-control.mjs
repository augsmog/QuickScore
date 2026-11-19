import assert from 'node:assert/strict';
// A score control also renders its par/bogey label. Assert the numeric child,
// with an exact unique match, rather than treating the whole button as a number.
export async function assertScoreControl(control,expected) {
  const value=control.getByText(String(expected),{exact:true});
  assert.equal(await value.count(),1,'Expected one exact numeric score child');
  assert.equal(await value.innerText(),String(expected));
}
