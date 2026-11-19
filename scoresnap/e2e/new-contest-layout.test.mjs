import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SWITCH_INTRINSIC, SWITCH_TAP_TARGET, SWITCH_LABEL_GAP, ROUNDS_BLOCK_PADDING_LEFT, SCROLL_END_SPACER} from '../src/ui/new-contest-layout.ts';

const src = readFileSync(new URL('../app/contest/new.tsx', import.meta.url), 'utf8');

test('tap-target wrapper fits the intrinsic switch and reaches 44pt', () => {
  assert(SWITCH_TAP_TARGET.minWidth >= SWITCH_INTRINSIC.width);
  assert(SWITCH_TAP_TARGET.minHeight >= 44);
  assert(SWITCH_LABEL_GAP >= 8);
});
test('no Switch is force-sized to 44x44 (overflowed into label)', () => {
  assert.doesNotMatch(src, /<Switch[^>]*style=\{\{ width: 44, height: 44 \}\}/s);
  assert.doesNotMatch(src, /testID="(tournament-toggle|team-mode)"[\s\S]{0,200}style=\{\{ width: 44/);
});
test('rounds picker is not indented and scroll end clears the Continue bar', () => {
  assert.equal(ROUNDS_BLOCK_PADDING_LEFT, 0);
  assert.doesNotMatch(src, /paddingLeft: 48/);
  assert(SCROLL_END_SPACER >= 112);
  assert.match(src, /height: SCROLL_END_SPACER/);
});
test('team mode off-state uses light track/thumb, not dark pill', () => {
  assert.match(src, /testID="team-mode"[\s\S]{0,200}false: COLORS\.border/);
});
