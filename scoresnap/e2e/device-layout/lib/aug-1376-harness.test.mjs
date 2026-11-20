// AUG-1376 — regression tests for the native-harness fixes landed this round, each derived from a
// REAL capture artifact (pinned under lib/fixtures/native/*) or a minimal synthetic hierarchy:
//
//   1. SE-3 empty-wizard footer: a stale-frame CTA reported BELOW the viewport must still yield a
//      well-formed sticky-footer rect (never a negative-area box that aborts the whole profile).
//   2. IME / soft-keyboard chrome: Android keyboard window + suggestion strip are stripped as OS
//      chrome (not scored as app controls) and folded into the usable viewport's bottom inset.
//   3. ScrollView clipping: a row scrolled behind the fixed header/footer is reported by Maestro at
//      an off-frame position it is NOT painted at; normalize clips it and rule 1 stops flagging it.
//   4. Switch tap slot: the Switch keeps its own testID while the `*-slot` wrapper is the measured
//      >=48dp tap target; the enclosed switch is marked non-tappable so its 47x27 never scores rule 5.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeMaestroCapture } from './normalize-maestro.mjs';
import { evaluateCheckpoint, finiteRect } from './geometry-rules.mjs';
import { deriveFooter, SNAPSCORE_META } from '../scripts/bundle-from-maestro.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const fx = (f) => JSON.parse(readFileSync(resolve(__dir, 'fixtures/native', f), 'utf8'));
// A raw Maestro hierarchy node.
const node = (bounds, attrs = {}, children = []) => ({ attributes: { bounds, ...attrs }, children });

// ───────────────────────── 1. SE-3 empty-wizard footer (real fixture) ─────────────────────────
test('SE-3 empty-wizard: a CTA reported below the viewport still yields a well-formed footer', () => {
  const viewport = { width: 375, height: 667 }; // iPhone SE (3rd gen), points → density 1
  const { nodes } = normalizeMaestroCapture(fx('ios-se3-empty-wizard.hierarchy.json'), {
    density: 1, viewport, resourceMeta: SNAPSCORE_META,
  });
  // Precondition (locks in the regression): this capture frame reports Continue BELOW the screen.
  const cta = nodes.find((n) => n.id === 'contest-continue');
  assert.ok(cta, 'contest-continue CTA present in the capture');
  assert.ok(cta.bbox.top >= viewport.height,
    `CTA top ${cta.bbox.top} is at/below the viewport bottom ${viewport.height} (stale pre-settle frame)`);

  const footer = deriveFooter(nodes, viewport);
  assert.ok(footer, 'a footer is still synthesized from the CTA');
  // The old code spanned [cta.top, viewport.height] = [762, 667], an inverted/negative-area rect
  // that validateBundle rejects → the whole SE-3 profile aborted with zero results.
  assert.ok(finiteRect(footer), `footer must be finite with positive area: ${JSON.stringify(footer)}`);
  assert.ok(footer.bottom > footer.top, 'footer bottom is below its top (not inverted)');
  assert.equal(footer.bottom, Math.max(viewport.height, cta.bbox.bottom));
});

// ───────────────────────── 2. IME / soft-keyboard chrome (real fixture) ─────────────────────────
test('Android name-entry: IME keyboard + suggestion strip is stripped and never scores as app UI', () => {
  const viewport = { width: 360, height: 800 }; // compact AVD, 480dpi → density 3
  const { nodes, safeArea } = normalizeMaestroCapture(fx('android-compact-name-entry.hierarchy.json'), {
    density: 3, viewport, resourceMeta: SNAPSCORE_META,
  });
  const keptText = new Set(nodes.map((n) => (n.text || '').trim()));
  // Suggestion-strip words and the voice-input key are OS keyboard chrome — must be gone.
  for (const word of ['Available', 'Availability', 'Voice input']) {
    assert.ok(!keptText.has(word), `IME chrome "${word}" must not survive into app geometry`);
  }
  // App content that happens to share a prefix (the typed name) is kept.
  assert.ok(keptText.has('Ava'), 'the typed contest/player name (app input) is retained');
  // The keyboard's top edge is folded into the usable viewport: bottom inset grows beyond 0.
  assert.ok(safeArea && safeArea.bottom > 0, 'keyboard height folds into the bottom safe-area inset');
});

test('Android name-entry: no IME text paints over the Continue CTA (rule 1 is clean of keyboard chrome)', () => {
  const viewport = { width: 360, height: 800 };
  const { nodes } = normalizeMaestroCapture(fx('android-compact-name-entry.hierarchy.json'), {
    density: 3, viewport, resourceMeta: SNAPSCORE_META,
  });
  const { findings } = evaluateCheckpoint(nodes, { platform: 'android', viewport });
  const imeOverContinue = findings.filter((f) => f.rule === 1 && /Available|Voice input|Availability/.test(f.reason));
  assert.equal(imeOverContinue.length, 0, `IME-over-Continue rule-1 findings: ${JSON.stringify(imeOverContinue)}`);
});

// ───────────────────────── 3. ScrollView clipping (synthetic) ─────────────────────────
// Maestro reports a scrolled row's frame in raw screen coords. A row scrolled above the scroll
// viewport overlaps the fixed header's bbox but is NOT painted there (the ScrollView masks it).
function scrolledBehindHeader() {
  return node('[0,0][375,667]', { 'resource-id': 'app-window' }, [
    node('[20,20][64,64]', { 'resource-id': 'back', text: 'Back' }),
    node('[0,100][375,600]', { 'resource-id': 'contest-scroll' }, [
      node('[20,40][200,80]', { 'resource-id': 'scrolled-up', text: 'ScrolledUp' }),  // fully above viewport
      node('[20,90][200,130]', { 'resource-id': 'partial', text: 'Partial' }),         // straddles viewport top
      node('[20,200][200,240]', { 'resource-id': 'visible', text: 'Visible' }),        // fully inside
    ]),
  ]);
}
const SCROLL_META = {
  'app-window': { role: 'container', meta: {} },
  back: { role: 'control', meta: { tappable: true } },
  'contest-scroll': { role: 'container', meta: { scrollClip: true } },
  'scrolled-up': { role: 'control', meta: { tappable: true } },
  partial: { role: 'control', meta: { tappable: true } },
  visible: { role: 'control', meta: { tappable: true } },
};
const NO_SCROLL_META = { ...SCROLL_META, 'contest-scroll': { role: 'container', meta: {} } };

test('scroll-clip: a row scrolled above the viewport is marked clippedOut; a straddling row is clipped', () => {
  const viewport = { width: 375, height: 667 };
  const { nodes } = normalizeMaestroCapture(scrolledBehindHeader(), { density: 1, viewport, resourceMeta: SCROLL_META });
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  assert.equal(byId['scrolled-up'].meta.clippedOut, true, 'row above the scroll viewport is fully masked');
  assert.ok(byId.partial.meta.clipRect, 'a straddling row records its visible (clipped) rect');
  assert.equal(byId.partial.meta.clipRect.top, 100, 'the clipped rect starts at the scroll viewport top');
  assert.ok(!byId.visible.meta.clipRect && !byId.visible.meta.clippedOut, 'a fully-visible row is untouched');
});

test('scroll-clip: rule 1 flags the unclipped overlap but NOT the scroll-masked one', () => {
  const viewport = { width: 375, height: 667 };
  // Without the scroll container, the scrolled row overlaps Back's bbox → a (false) rule-1 finding.
  const bare = normalizeMaestroCapture(scrolledBehindHeader(), { density: 1, viewport, resourceMeta: NO_SCROLL_META });
  const bareHits = evaluateCheckpoint(bare.nodes, { platform: 'ios', viewport }).findings
    .filter((f) => f.rule === 1 && f.nodes.includes('scrolled-up'));
  assert.ok(bareHits.length >= 1, 'unclipped: Maestro\'s raw scrolled frame overlaps the header (the artifact)');
  // With the scroll container, the masked row is not painted there → no rule-1 finding.
  const clipped = normalizeMaestroCapture(scrolledBehindHeader(), { density: 1, viewport, resourceMeta: SCROLL_META });
  const clippedHits = evaluateCheckpoint(clipped.nodes, { platform: 'ios', viewport }).findings
    .filter((f) => f.rule === 1 && f.nodes.includes('scrolled-up'));
  assert.equal(clippedHits.length, 0, 'scroll-masked content is not reported as overlapping fixed chrome');
});

// ───────────────────────── 4. Switch tap slot (synthetic) ─────────────────────────
// The `*-slot` wrapper (>=48dp) is the tap target; the Switch inside keeps its own testID but is the
// indicator, marked non-tappable so its fixed 47x27 (reported here as value "1") never scores rule 5.
function switchInSlot(slotBounds) {
  return node('[0,0][360,800]', { 'resource-id': 'app-window' }, [
    node('[0,200][360,280]', {}, [ // row
      node(slotBounds, { 'resource-id': 'tournament-toggle-slot' }, [
        node('[20,210][83,238]', { 'resource-id': 'tournament-toggle', value: '1', checked: 'true' }),
      ]),
    ]),
  ]);
}

test('switch-slot: the enclosed Switch is non-tappable; the slot is the measured target; isSwitch kept', () => {
  const viewport = { width: 360, height: 800 };
  const { nodes } = normalizeMaestroCapture(switchInSlot('[20,206][68,254]'), {
    density: 1, viewport, resourceMeta: SNAPSCORE_META,
  });
  const slot = nodes.find((n) => n.id === 'tournament-toggle-slot');
  const sw = nodes.find((n) => n.id === 'tournament-toggle');
  assert.ok(slot && sw, 'both the slot and the switch survive (both carry testIDs)');
  assert.notEqual(slot.meta.tappable, false, 'the slot stays a tap target');
  assert.equal(sw.meta.tappable, false, 'the enclosed switch is marked non-tappable');
  assert.equal(sw.meta.isSwitch, true, 'the switch keeps isSwitch so rule 7 can still score its contrast');
});

test('switch-slot: rule 5 scores the >=48dp slot, not the 63x28 switch', () => {
  const viewport = { width: 360, height: 800 };
  // 48x48 slot on Android → rule 5 clean; the switch is excluded (non-tappable).
  const ok = normalizeMaestroCapture(switchInSlot('[20,206][68,254]'), { density: 1, viewport, resourceMeta: SNAPSCORE_META });
  const okHits = evaluateCheckpoint(ok.nodes, { platform: 'android', viewport }).findings
    .filter((f) => f.rule === 5 && (f.nodes.includes('tournament-toggle') || f.nodes.includes('tournament-toggle-slot')));
  assert.equal(okHits.length, 0, `a 48dp slot passes rule 5 and the switch is not scored: ${JSON.stringify(okHits)}`);
  // An undersized slot (40x40) DOES fail — the slot is genuinely the measured target now.
  const small = normalizeMaestroCapture(switchInSlot('[20,206][60,246]'), { density: 1, viewport, resourceMeta: SNAPSCORE_META });
  const smallHits = evaluateCheckpoint(small.nodes, { platform: 'android', viewport }).findings
    .filter((f) => f.rule === 5 && f.nodes.includes('tournament-toggle-slot'));
  assert.ok(smallHits.length >= 1, 'an undersized slot is flagged (proves the slot is the measured target)');
});
