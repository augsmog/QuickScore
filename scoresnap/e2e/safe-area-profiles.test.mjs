import test from 'node:test';
import assert from 'node:assert/strict';
import {getSafeAreaProfile, SAFE_AREA_PROFILES} from './safe-area-profiles.mjs';

test('safe-area browser profiles match the supported iPhone viewport and inset matrix', () => {
  assert.deepEqual(getSafeAreaProfile('iphone-se'), {width:375,height:667,top:20,bottom:0});
  assert.deepEqual(getSafeAreaProfile(), {width:393,height:852,top:59,bottom:34});
  assert.deepEqual(getSafeAreaProfile('iphone-pro-max'), {width:430,height:932,top:59,bottom:34});
  assert.deepEqual(getSafeAreaProfile('iphone-13-mini'), {width:375,height:812,top:50,bottom:34});
  assert.deepEqual(getSafeAreaProfile('iphone-13-notch'), {width:390,height:844,top:47,bottom:34});
  assert.deepEqual(getSafeAreaProfile('iphone-16-pro'), {width:402,height:874,top:62,bottom:34});
  assert.deepEqual(getSafeAreaProfile('iphone-16-pro-max'), {width:440,height:956,top:62,bottom:34});
  assert.equal(Object.keys(SAFE_AREA_PROFILES).length, 7);
  assert.throws(() => getSafeAreaProfile('unknown'), /Unknown DEVICE_PROFILE/);
  for (const inheritedName of ['toString','constructor','__proto__']) {
    assert.throws(() => getSafeAreaProfile(inheritedName), /Unknown DEVICE_PROFILE/);
  }
});

test('every profile has a top inset that clears its notch/island and a home-indicator bottom on notched devices', () => {
  for (const [name, p] of Object.entries(SAFE_AREA_PROFILES)) {
    assert(p.width >= 375 && p.height > p.width, `${name} portrait dims`);
    assert(p.top >= 20, `${name} top inset clears status bar`);
    if (p.top > 20) assert.equal(p.bottom, 34, `${name} notched device has home indicator inset`);
    assert(Object.isFrozen(p), `${name} frozen`);
  }
});
