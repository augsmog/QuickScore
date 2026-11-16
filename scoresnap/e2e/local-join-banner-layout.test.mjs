import test from 'node:test';
import assert from 'node:assert/strict';
import {SAFE_AREA_PROFILES} from './safe-area-profiles.mjs';
import {localJoinBannerLayout, MIN_TARGET_PX} from '../src/ui/local-join-banner-layout.ts';

test('guest banner clears top/bottom safe bands and exposes a 44px action on every profile', () => {
  for (const [name, p] of Object.entries(SAFE_AREA_PROFILES)) {
    const l = localJoinBannerLayout(p.height, p);
    assert(l.topOffset >= p.top, `${name} banner starts below top inset`);
    assert(l.actionMinHeight >= 44 && MIN_TARGET_PX === 44, `${name} action >= 44px`);
    assert(l.usableHeight >= l.actionMinHeight * 4, `${name} room for banner + action after safe bands`);
  }
  assert.equal(localJoinBannerLayout(667, SAFE_AREA_PROFILES['iphone-se']).compact, true);
});
