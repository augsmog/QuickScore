import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('host totals are asserted only after the round status sheet is dismissed', async () => {
  const source = await readFile(new URL('../e2e/xdevice-four-context.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('async function converge(indices) {');
  const end = source.indexOf('\n}\n', start);
  assert(start >= 0 && end > start, 'converge helper exists');
  const converge = source.slice(start, end);
  const snapshot = converge.indexOf("await freshResponse(0, 'fetch_snapshot'");
  const closeSheet = converge.indexOf('await closeStatus(pages[0]);', snapshot);
  const totals = converge.indexOf('host total missing', closeSheet);
  assert(snapshot >= 0 && closeSheet > snapshot && totals > closeSheet,
    'fresh host snapshot is read, then the status sheet closes, then visible totals are checked');
});
