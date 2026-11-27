// The Android reveal captures scroll the New Contest list a little and must put it back exactly
// where the flow left it, or every later checkpoint is taken at the wrong place. The capture script
// asks this probe two things, from native UI dumps: where the list is, and how far it has moved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrollArea, scrollDelta, parseDump } from '../scripts/wizard-scroll-probe.mjs';

const b = (l, t, r, bt) => `[${l},${t}][${r},${bt}]`;
const maestro = (rows) => JSON.stringify({ attributes: { bounds: b(0, 0, 1080, 2400) }, children: [{ attributes: { 'resource-id': 'contest-scroll', bounds: b(0, 360, 1080, 1950) },
  children: rows.map(([id, t, bt]) => ({ attributes: { 'resource-id': id, bounds: b(60, t, 1020, bt) }, children: [] })) }] });
const uiautomator = (rows) => `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><hierarchy rotation="0"><node index="0" text="" resource-id="contest-scroll" class="android.widget.ScrollView" bounds="${b(0, 360, 1080, 1950)}">${
  rows.map(([id, t, bt]) => `<node index="0" text="" resource-id="${id}" class="android.view.ViewGroup" bounds="${b(60, t, 1020, bt)}" />`).join('')}</node></hierarchy>`;
const ROWS = [['wizard-contest-name', 360, 426], ['wizard-course', 735, 891], ['tournament-toggle-slot', 1125, 1269], ['', 1300, 1400], ['', 1500, 1600]];
const moved = (dy) => ROWS.map(([id, t, bt]) => [id, t + dy, bt + dy]);

for (const [format, make] of [['a Maestro hierarchy', maestro], ['a uiautomator dump', uiautomator]]) {
  test(`${format}: the list is found, with a centre to swipe from`, () => {
    assert.deepEqual(scrollArea(parseDump(make(ROWS))), { x: 540, top: 360, bottom: 1950 });
  });
  test(`${format}: movement is measured from controls that are whole in both dumps`, () => {
    assert.equal(scrollDelta(parseDump(make(ROWS)), parseDump(make(moved(120)))), 120);
    assert.equal(scrollDelta(parseDump(make(ROWS)), parseDump(make(moved(-288)))), -288);
    assert.equal(scrollDelta(parseDump(make(ROWS)), parseDump(make(ROWS))), 0);
  });
}

test('a control cut by the list edge in either dump is not used to measure', () => {
  // The contest name is a 66px sliver before and whole (156px) after: its top did not move by 120.
  const after = [['wizard-contest-name', 390, 546], ...moved(120).slice(1)];
  assert.equal(scrollDelta(parseDump(maestro(ROWS)), parseDump(maestro(after))), 120);
});

test('no answer rather than a guess', () => {
  const none = JSON.stringify({ attributes: { bounds: b(0, 0, 1080, 2400) }, children: [] });
  assert.equal(scrollArea(parseDump(none)), null);
  assert.equal(scrollDelta(parseDump(maestro(ROWS)), parseDump(none)), null);
  // Controls disagree about how far the list moved: not a scroll.
  const torn = [ROWS[0], ['wizard-course', 835, 991], ['tournament-toggle-slot', 1325, 1469]];
  assert.equal(scrollDelta(parseDump(maestro(ROWS)), parseDump(maestro(torn))), null);
  // An id that appears twice identifies nothing.
  const twice = [...ROWS, ['wizard-course', 1700, 1856]];
  assert.equal(scrollDelta(parseDump(maestro(twice)), parseDump(maestro(twice.map(([id, t, bt]) => [id, t + 50, bt + 50])))), 50); // measured from the unique ones only
  assert.throws(() => parseDump('neither json nor xml'), /not a UI dump/);
});

test('the command prints the answer, and exits 3 when there is none', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'probe-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../scripts/wizard-scroll-probe.mjs', import.meta.url));
  writeFileSync(join(dir, 'a.json'), maestro(ROWS)); writeFileSync(join(dir, 'b.xml'), uiautomator(moved(-96))); writeFileSync(join(dir, 'c.json'), '{"attributes":{},"children":[]}');
  const run = (...args) => spawnSync('node', [cli, ...args], { encoding: 'utf8' });
  assert.equal(run('area', join(dir, 'a.json')).stdout.trim(), '540 360 1950');
  assert.equal(run('delta', join(dir, 'a.json'), join(dir, 'b.xml')).stdout.trim(), '-96');
  assert.equal(run('area', join(dir, 'c.json')).status, 3);
  assert.equal(run('delta', join(dir, 'a.json'), join(dir, 'c.json')).status, 3);
  assert.equal(run('delta', join(dir, 'a.json'), join(dir, 'missing.json')).status, 3);
  assert.equal(run('nonsense').status, 2);
});
