import test from 'node:test';
import assert from 'node:assert/strict';
import {roundCountPillStyle, groupChipStyle, nameInputMinHeight, handicapInputBox, SETUP_MIN_TARGET_PX} from '../src/ui/tournament-setup-layout.ts';

test('tournament setup targets are at least 44px', () => {
  assert.equal(SETUP_MIN_TARGET_PX, 44);
  for (const s of [roundCountPillStyle, groupChipStyle, handicapInputBox]) assert(s.minHeight >= 44);
  assert(roundCountPillStyle.minWidth >= 44 && groupChipStyle.minWidth >= 44);
  assert(nameInputMinHeight >= 44);
});

test('new.tsx wires the shared styles', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(new URL('../app/contest/new.tsx', import.meta.url), 'utf8');
  assert(src.includes('...roundCountPillStyle'));
  assert(src.includes('...groupChipStyle'));
  assert.match(src, /minHeight: nameInputMinHeight/);
  assert.match(src, /\.\.\.handicapInputBox/);
});
