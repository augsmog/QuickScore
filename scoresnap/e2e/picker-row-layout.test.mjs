import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PICKER_ROW_STYLE, PICKER_ROW_MIN_TARGET_PX} from '../src/ui/picker-row-layout.ts';

test('AUG-1228: picker row is >= 44px and cannot shrink at first paint', () => {
  assert.equal(PICKER_ROW_MIN_TARGET_PX, 44);
  assert(PICKER_ROW_STYLE.minHeight >= 44);
  assert.equal(PICKER_ROW_STYLE.flexShrink, 0);
});

test('AUG-1228: Settings PickerRow (Distance Unit) uses the shared style', () => {
  const src = readFileSync(new URL('../app/settings.tsx', import.meta.url), 'utf8');
  const row = src.slice(src.indexOf('function PickerRow'), src.indexOf('function NumberRow'));
  assert(row.includes('...PICKER_ROW_STYLE'));
  assert(!/minHeight:\s*44/.test(row), 'no ad-hoc minHeight left in PickerRow');
});
