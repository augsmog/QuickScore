// AUG-1376 — regression tests for the two "not a real element" shapes the native captures carry,
// derived from REAL artifacts (art-android2 / art-ios), pinned under lib/fixtures/native/*.
//
// Before this fix the converter emitted the OS window-root wrappers as zero-bbox measured nodes
// (Android: no `bounds` attribute → n0/n1 with {0,0,0,0}; iOS: `[0,0][0,0]`), and #343's
// fail-closed validator (correctly) rejected the whole bundle:
//   "has 2 node(s) without an id and finite measured bbox"
//   node "n0"/"n1" malformed hitRegion (…positive width/height)
// It also scored the OS status bar / gesture taskbar / iOS status overlay as app controls.
// These tests lock in: no malformed geometry survives, system chrome is excluded, the measured
// safe area reflects the real bars, and the window root is a backdrop (not a giant text/control).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeMaestroCapture } from './normalize-maestro.mjs';
import { finiteRect } from './geometry-rules.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(resolve(__dir, 'fixtures/native', f), 'utf8'));

// The real compact AVD (480dpi → density 3) reports a 1080×2400 px screen (= 360×800 dp). The
// status bar is the top 136px strip (45.3dp) and the gesture taskbar the bottom 144px (48dp).
const ANDROID = { density: 3, viewport: { width: 360, height: 800 } };
// iPhone 16 Pro: Maestro iOS bounds are already points (density 1), 402×874pt, status overlay 54pt.
const IOS = { density: 1, viewport: { width: 402, height: 874 } };

function assertNoMalformedGeometry(nodes) {
  // Exactly the two checks run-geometry's validateBundle applies to every node.
  for (const n of nodes) {
    assert.ok(n.id && typeof n.id === 'string', `node has an id: ${JSON.stringify(n.bbox)}`);
    assert.ok(finiteRect(n.bbox), `node "${n.id}" has a finite, positive-area bbox`);
    assert.ok(n.hitRegion == null || finiteRect(n.hitRegion), `node "${n.id}" hitRegion is finite/positive`);
  }
}

test('android: structural wrappers dropped — no malformed zero-bbox nodes (the RED regression)', () => {
  const { nodes } = normalizeMaestroCapture(fx('android-compact-join-entry.hierarchy.json'), ANDROID);
  assert.ok(nodes.length > 0);
  assertNoMalformedGeometry(nodes);
  // The boundless root wrappers must not resurface as n0/n1 zero-bbox containers.
  assert.equal(nodes.some((n) => finiteRect(n.bbox) === false), false);
});

test('android: OS system chrome (status bar / launcher taskbar) is not scored as app controls', () => {
  const { nodes, chrome } = normalizeMaestroCapture(fx('android-compact-join-entry.hierarchy.json'), ANDROID);
  // No surviving node belongs to a system-UI package.
  const sys = nodes.filter((n) => /^(com\.android\.systemui|com\.android\.launcher3)\b/.test(n.meta?.resourceId || ''));
  assert.equal(sys.length, 0, 'no com.android.systemui / launcher3 survivors');
  // The chrome we removed includes the top status strip and the bottom taskbar strip.
  assert.ok(chrome.some((c) => c.bbox.top <= 1 && c.bbox.bottom <= 60), 'removed a top status strip');
  assert.ok(chrome.some((c) => c.bbox.bottom >= 799), 'removed a bottom taskbar strip');
});

test('android: measured safe area reflects the real bars (≈45dp status / 48dp taskbar)', () => {
  const { safeArea } = normalizeMaestroCapture(fx('android-compact-join-entry.hierarchy.json'), ANDROID);
  assert.ok(safeArea, 'measured a safe area from the chrome bars');
  assert.ok(Math.abs(safeArea.top - 136 / 3) < 0.5, `top ≈ 45.3dp, got ${safeArea.top}`);
  assert.ok(Math.abs(safeArea.bottom - 144 / 3) < 0.5, `bottom ≈ 48dp, got ${safeArea.bottom}`);
});

test('android: the full-viewport app window is a backdrop, real controls survive', () => {
  const { nodes } = normalizeMaestroCapture(fx('android-compact-join-entry.hierarchy.json'), ANDROID);
  assert.ok(nodes.some((n) => n.meta?.backdrop === true), 'app window marked backdrop');
  // The home "New Contest" CTA (a real testID) is kept and tappable.
  const cta = nodes.find((n) => n.id === 'home-new-contest');
  assert.ok(cta, 'home-new-contest survives');
  assert.equal(cta.meta.backdrop, undefined);
});

test('android: populated New Contest screen converts cleanly; the multi-day switch survives', () => {
  const { nodes } = normalizeMaestroCapture(fx('android-compact-multi-day-on.hierarchy.json'), ANDROID);
  assertNoMalformedGeometry(nodes);
  const sw = nodes.find((n) => n.id === 'tournament-toggle');
  assert.ok(sw, 'tournament-toggle switch survives the chrome/backdrop pass');
  // Inferred interactive (checked=true) and not swallowed as a backdrop. (The isSwitch semantic
  // rides in via bundle-from-maestro's resourceMeta, covered in bundle-from-maestro.test.mjs.)
  assert.equal(sw.role, 'control');
  assert.equal(sw.meta.backdrop, undefined);
  // No system-UI package leaked through on a richer screen either.
  assert.equal(nodes.some((n) => /^(com\.android\.systemui|com\.android\.launcher3)\b/.test(n.meta?.resourceId || '')), false);
});

test('ios: degenerate [0,0][0,0] wrappers dropped — no malformed nodes; status overlay excluded', () => {
  const { nodes, chrome, safeArea } = normalizeMaestroCapture(fx('ios-16pro-join-entry.hierarchy.json'), IOS);
  assert.ok(nodes.length > 0);
  assertNoMalformedGeometry(nodes);
  // The iOS status-bar overlay (its text includes the clock / Wi-Fi strings) must be removed.
  assert.equal(nodes.some((n) => /Wi-Fi bars|No signal/.test(n.text || '')), false);
  assert.ok(chrome.length >= 1, 'removed the status overlay window');
  // Status overlay is a 54pt top strip; the declared 59pt inset is the floor, so top stays ≥54.
  assert.ok(!safeArea || safeArea.top >= 54 - 0.5, 'measured top inset covers the status strip');
});

test('ios: window root tagged with the app name is a backdrop, not a screen-wide text rect', () => {
  const { nodes } = normalizeMaestroCapture(fx('ios-16pro-join-entry.hierarchy.json'), IOS);
  // The app-named window root ("SnapScore", full screen) must not remain a text/control node that
  // would "paint over" every control (rule 1) — it is a backdrop container.
  const named = nodes.find((n) => n.text === 'SnapScore');
  if (named) {
    assert.equal(named.role, 'container');
    assert.equal(named.meta.backdrop, true);
  }
  // No surviving leaf spans the whole viewport as a text/control.
  const giant = nodes.filter((n) => n.role !== 'container' &&
    (n.bbox.right - n.bbox.left) >= IOS.viewport.width - 2 &&
    (n.bbox.bottom - n.bbox.top) >= IOS.viewport.height - 2);
  assert.equal(giant.length, 0);
});

test('ios: keyboard-up capture still yields only finite geometry', () => {
  // The name-entry checkpoint brings up the keyboard (a second window). Re-parenting + chrome
  // handling must still leave every emitted node with finite, positive-area geometry.
  const { nodes } = normalizeMaestroCapture(fx('ios-16pro-name-entry.hierarchy.json'), IOS);
  assert.ok(nodes.length > 0);
  assertNoMalformedGeometry(nodes);
});

test('duplicate resource-ids do not form a graph cycle (crash regression)', () => {
  // Native hierarchies reuse resource-ids across siblings; the chrome/backdrop pass keys the parent
  // graph on node identity, not the string id, so this must terminate and not throw.
  const dup = {
    attributes: {}, // boundless root wrapper
    children: [
      { attributes: { bounds: '[0,0][402,874]' }, children: [
        { attributes: { bounds: '[0,0][100,40]', 'resource-id': 'dup', text: 'a' }, children: [
          { attributes: { bounds: '[0,0][50,20]', 'resource-id': 'dup', text: 'b' }, children: [] },
        ] },
        { attributes: { bounds: '[0,50][100,90]', 'resource-id': 'dup', text: 'c' }, children: [] },
      ] },
    ],
  };
  const { nodes } = normalizeMaestroCapture(dup, IOS);
  assert.ok(nodes.length >= 3);
  assertNoMalformedGeometry(nodes);
});
