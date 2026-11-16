import test from 'node:test';
import assert from 'node:assert/strict';
import {SAFE_AREA_PROFILES} from './safe-area-profiles.mjs';
import {accountHandoffLayout, HANDOFF_MIN_TARGET_PX} from '../src/ui/account-handoff-layout.ts';

test('handoff panel clears top inset and exposes 44px actions on every profile', () => {
  for (const [name, p] of Object.entries(SAFE_AREA_PROFILES)) {
    const l = accountHandoffLayout(p, {top: p.top});
    assert(l.paddingTop >= p.top, `${name} panel content starts below top inset`);
    assert(l.actionMinHeight >= 44 && HANDOFF_MIN_TARGET_PX === 44, `${name} action >= 44px`);
  }
  assert.equal(accountHandoffLayout(SAFE_AREA_PROFILES['iphone-se'], {top: 20}).compact, true);
  assert.equal(accountHandoffLayout({width: 430, height: 932}, {top: 0, left: 10}).paddingLeft, 26);
});
