import test from 'node:test';
import assert from 'node:assert/strict';
import {roundCountPillStyle, groupChipStyle, nameInputMinHeight, handicapInputBox, switchTapSlot, SETUP_MIN_TARGET_PX, SETUP_MIN_TARGET_ANDROID_PX, setupMinTargetPx, setupTargets} from '../src/ui/tournament-setup-layout.ts';

test('tournament setup baseline targets are at least 44px', () => {
  assert.equal(SETUP_MIN_TARGET_PX, 44);
  for (const s of [roundCountPillStyle, groupChipStyle, handicapInputBox]) assert(s.minHeight >= 44);
  assert(roundCountPillStyle.minWidth >= 44 && groupChipStyle.minWidth >= 44);
  assert(nameInputMinHeight >= 44);
});

// AUG-1367: the switch tap slot must guarantee a >=44pt target while centering the
// native switch, so the switch keeps its intrinsic size and cannot overflow its label.
test('switchTapSlot is a >=44pt centered tap slot', () => {
  assert(switchTapSlot.minWidth >= 44 && switchTapSlot.minHeight >= 44);
  assert.equal(switchTapSlot.alignItems, 'center');
  assert.equal(switchTapSlot.justifyContent, 'center');
});

// AUG-1376: Android Material tap targets must be >=48dp; iOS/web keep the 44pt baseline.
test('setupTargets widens every tap target to 48dp on Android', () => {
  assert.equal(SETUP_MIN_TARGET_ANDROID_PX, 48);
  assert.equal(setupMinTargetPx('android'), 48);
  assert.equal(setupMinTargetPx('ios'), 44);
  assert.equal(setupMinTargetPx('web'), 44);
  assert.equal(setupMinTargetPx(undefined), 44);

  const a = setupTargets('android');
  assert.equal(a.minTarget, 48);
  for (const s of [a.roundCountPillStyle, a.groupChipStyle, a.teamChipStyle, a.switchTapSlot, a.handicapInputBox]) {
    assert(s.minHeight >= 48, `android minHeight ${s.minHeight} >= 48`);
  }
  for (const s of [a.roundCountPillStyle, a.groupChipStyle, a.teamChipStyle, a.switchTapSlot]) {
    assert(s.minWidth >= 48, `android minWidth ${s.minWidth} >= 48`);
  }
  assert.equal(a.nameInputMinHeight, 48);
  assert.equal(a.handicapInputBox.width, 60); // handicap stays 60 wide, height grows to 48

  const i = setupTargets('ios');
  assert.equal(i.minTarget, 44);
  assert.equal(i.roundCountPillStyle.minHeight, 44);
  assert.equal(i.switchTapSlot.minWidth, 44);
});

test('new.tsx wires the platform-aware shared styles', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(new URL('../app/contest/new.tsx', import.meta.url), 'utf8');
  // Builds the platform-aware target set from Platform.OS and spreads the shared styles.
  assert.match(src, /setupTargets\(Platform\.OS\)/);
  assert(src.includes('roundCountPillStyle'));
  assert(src.includes('groupChipStyle'));
  assert(src.includes('nameInputMinHeight'));
  assert(src.includes('handicapInputBox'));
  assert(src.includes('switchTapSlot'));
});
