import test from 'node:test';
import assert from 'node:assert/strict';
import {roundCountPillStyle, groupChipStyle, nameInputMinHeight, handicapInputBox, SETUP_MIN_TARGET_PX, SWITCH_HIT_SLOP} from '../src/ui/tournament-setup-layout.ts';

test('tournament setup targets are at least 44px', () => {
  assert.equal(SETUP_MIN_TARGET_PX, 44);
  for (const s of [roundCountPillStyle, groupChipStyle, handicapInputBox]) assert(s.minHeight >= 44);
  assert(roundCountPillStyle.minWidth >= 44 && groupChipStyle.minWidth >= 44);
  assert(nameInputMinHeight >= 44);
  // AUG-1367: hitSlop pads height to 44pt without resizing the native ~51x31pt Switch.
  assert(31 + SWITCH_HIT_SLOP.top + SWITCH_HIT_SLOP.bottom >= 44);
});

test('new.tsx wires the shared styles', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(new URL('../app/contest/new.tsx', import.meta.url), 'utf8');
  assert(src.includes('...roundCountPillStyle'));
  assert(src.includes('...groupChipStyle'));
  assert.match(src, /minHeight: nameInputMinHeight/);
  assert.match(src, /\.\.\.handicapInputBox/);
});

test('AUG-1367: toggles use hitSlop instead of a style box that clips the native Switch', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(new URL('../app/contest/new.tsx', import.meta.url), 'utf8');
  // A forced width/height style box overrides nothing on a native Switch (intrinsic ~51x31pt) and
  // instead clipped/overlapped the label (Sentry/owner report). hitSlop extends the tap target
  // without resizing the control.
  assert(!/<Switch[\s\S]{0,400}?style=\{\{\s*width:\s*44,\s*height:\s*44\s*\}\}/.test(src), 'no Switch should force a 44x44 style box');
  assert.equal((src.match(/hitSlop=\{SWITCH_HIT_SLOP\}/g) || []).length, 2, 'both tournament-toggle and team-mode switches use SWITCH_HIT_SLOP');
});

test('AUG-1367: Team Mode off-state uses the same light track/thumb tokens as other toggles', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(new URL('../app/contest/new.tsx', import.meta.url), 'utf8');
  const teamMode = src.slice(src.indexOf('testID="team-mode"'), src.indexOf('testID="team-mode"') + 300);
  assert.match(teamMode, /trackColor=\{\{\s*false:\s*COLORS\.border,\s*true:\s*COLORS\.primary\s*\}\}/, 'off-track should not be the low-contrast surfaceHighest token');
  assert.match(teamMode, /thumbColor=\{COLORS\.card\}/, 'thumb should be the light card token, not the near-black text token');
});

test('AUG-1367: rounds picker is not hard-indented away from the toggle above it', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(new URL('../app/contest/new.tsx', import.meta.url), 'utf8');
  assert(!src.includes('paddingLeft: 48'), 'the rounds picker should not carry an orphaned 48pt indent');
});

test('AUG-1367: the HCP row wraps instead of clipping when a group chip is also present', async () => {
  const {readFileSync} = await import('node:fs');
  const src = readFileSync(new URL('../app/contest/new.tsx', import.meta.url), 'utf8');
  const hcpRowStart = src.indexOf('gap: 6, marginTop: 4');
  assert.notEqual(hcpRowStart, -1);
  assert.match(src.slice(hcpRowStart - 40, hcpRowStart + 40), /flexWrap:\s*"wrap"/);
});
