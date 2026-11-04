import test from 'node:test';
import assert from 'node:assert/strict';
import {getSafeAreaProfile, SAFE_AREA_PROFILES} from './safe-area-profiles.mjs';

test('safe-area browser profiles match the supported iPhone viewport and inset matrix', () => {
  assert.deepEqual(getSafeAreaProfile('iphone-se'), {width:375,height:667,top:20,bottom:0});
  assert.deepEqual(getSafeAreaProfile(), {width:393,height:852,top:59,bottom:34});
  assert.deepEqual(getSafeAreaProfile('iphone-pro-max'), {width:430,height:932,top:59,bottom:34});
  assert.equal(Object.keys(SAFE_AREA_PROFILES).length, 3);
  assert.throws(() => getSafeAreaProfile('unknown'), /Unknown DEVICE_PROFILE/);
  for (const inheritedName of ['toString','constructor','__proto__']) {
    assert.throws(() => getSafeAreaProfile(inheritedName), /Unknown DEVICE_PROFILE/);
  }
});
