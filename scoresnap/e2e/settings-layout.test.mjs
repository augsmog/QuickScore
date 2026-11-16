import test from 'node:test';
import assert from 'node:assert/strict';
import {SAFE_AREA_PROFILES} from './safe-area-profiles.mjs';
import {settingsLayout, SETTINGS_MIN_TARGET_PX} from '../src/ui/settings-layout.ts';

test('settings: switch target and rows are >= 44px and bottom clears home band on every profile', () => {
  for (const [name, p] of Object.entries(SAFE_AREA_PROFILES)) {
    const l = settingsLayout({top: p.top, bottom: p.bottom});
    assert.equal(SETTINGS_MIN_TARGET_PX, 44);
    assert(l.switchTarget.minHeight >= 44 && l.switchTarget.minWidth >= 44, `${name} switch target >= 44px`);
    assert(l.rowMinHeight >= 44, `${name} row >= 44px`);
    assert(l.scrollPaddingBottom >= p.bottom + 60, `${name} last row clears bottom inset`);
    assert(l.edges.includes('top') && l.edges.includes('left') && l.edges.includes('right'), `${name} side/top edges owned`);
  }
});

test('settings: landscape side insets are reported', () => {
  const l = settingsLayout({top: 0, bottom: 21, left: 47, right: 47});
  assert.deepEqual(l.sideInset, {left: 47, right: 47});
});
