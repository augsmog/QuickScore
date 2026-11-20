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
import { deriveFooter, SNAPSCORE_META, windowViewportMismatch, captureWindow, profileById } from '../scripts/bundle-from-maestro.mjs';

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

// ───────────── 4b. Switch tap slot FLATTENED to siblings (the real device shape, round 6) ─────────────
// On device React Native flattens `<View slot><Switch/></View>`: the Switch is promoted to a SIBLING
// of the (empty) slot ViewGroup — both direct children of the row. The structural `insideSwitchSlot`
// walk can't see the switch as the slot's child, so without the `control`-key pairing the switch kept
// `tappable` (rule 5 scored its 47x27 / 63x28) and rule 1 scored the slot as overlapping its switch.
function switchSiblingOfSlot(slotBounds, switchBounds, switchValue = '1') {
  return node('[0,0][360,800]', { 'resource-id': 'app-window' }, [
    node('[0,200][360,280]', {}, [ // row: slot and switch are SIBLINGS (flattened), plus the label
      node(slotBounds, { 'resource-id': 'tournament-toggle-slot' }),
      node(switchBounds, { 'resource-id': 'tournament-toggle', value: switchValue, checked: 'true' }),
      node('[100,210][340,238]', { text: 'Multi-Day Tournament' }),
    ]),
  ]);
}

test('switch-slot (flattened siblings): the switch is paired to its slot by control id → non-tappable, re-parented', () => {
  const viewport = { width: 360, height: 800 };
  // Android: 48dp slot [20,200][68,248], sibling switch [21,210][68,237] (47x27) overlapping it.
  const { nodes } = normalizeMaestroCapture(switchSiblingOfSlot('[20,200][68,248]', '[21,210][68,237]'), {
    density: 1, viewport, resourceMeta: SNAPSCORE_META,
  });
  const slot = nodes.find((n) => n.id === 'tournament-toggle-slot');
  const sw = nodes.find((n) => n.id === 'tournament-toggle');
  assert.equal(sw.meta.tappable, false, 'the sibling switch is paired to its slot by control id and marked non-tappable');
  assert.equal(sw.parentId, slot.id, 'the switch is re-parented under its slot so rule 1 skips the own-child pair');
  assert.equal(sw.meta.isSwitch, true, 'the switch keeps isSwitch (rule 7 contrast still scores it)');
  const { findings } = evaluateCheckpoint(nodes, { platform: 'android', viewport });
  const pairHits = findings.filter((f) =>
    (f.rule === 1 && f.nodes.includes('tournament-toggle-slot') && f.nodes.includes('tournament-toggle')) ||
    (f.rule === 5 && f.nodes.includes('tournament-toggle')));
  assert.equal(pairHits.length, 0, `no slot↔switch overlap and no switch tap-target finding: ${JSON.stringify(pairHits)}`);
  // The slot itself is still the measured target: shrink it and rule 5 fires on the slot.
  const small = normalizeMaestroCapture(switchSiblingOfSlot('[20,200][60,240]', '[21,210][68,237]'), {
    density: 1, viewport, resourceMeta: SNAPSCORE_META,
  });
  const slotHit = evaluateCheckpoint(small.nodes, { platform: 'android', viewport }).findings
    .filter((f) => f.rule === 5 && f.nodes.includes('tournament-toggle-slot'));
  assert.ok(slotHit.length >= 1, 'an undersized slot still fails rule 5 — the gate is not weakened');
});

// ───────────── 5. iOS full-viewport-width accessibility band (scroll indicator "0%") ─────────────
// iOS exposes the UIScrollView scroll-position indicator (and the keyboard "Typing Predictions"
// strip) as a text element spanning the FULL viewport width (x=0..width, outside the app's content
// inset), reported with an accessibility value like "0%". Scored as text it "paints over" every row
// it crosses. It must be demoted to a structural band (never scored); real controls are never touched.
test('full-width band: an edge-to-edge "0%" scroll indicator is demoted and never paints over a row', () => {
  const viewport = { width: 402, height: 874 };
  const meta = { ...SNAPSCORE_META, 'player-row': { role: 'control', meta: { tappable: true } } };
  const cap = node('[0,0][402,874]', { 'resource-id': 'app-window' }, [
    node('[79,709][369,753]', { 'resource-id': 'player-row', text: 'Ava' }),
    node('[0,717][402,747]', { value: '0%', text: '0%' }), // full-width scroll indicator
  ]);
  const { nodes } = normalizeMaestroCapture(cap, { density: 1, viewport, resourceMeta: meta });
  const band = nodes.find((n) => (n.text || '') === '0%');
  assert.ok(band && band.role !== 'text', 'the full-width "0%" band is demoted out of the text role');
  const { findings } = evaluateCheckpoint(nodes, { platform: 'ios', viewport });
  const overRow = findings.filter((f) => f.rule === 1 && /0%/.test(f.reason));
  assert.equal(overRow.length, 0, `the demoted band must not paint over any control: ${JSON.stringify(overRow)}`);
  // A normal inset label that genuinely overlaps a control is still flagged (not weakened).
  const real = node('[0,0][402,874]', { 'resource-id': 'app-window' }, [
    node('[79,709][369,753]', { 'resource-id': 'player-row', text: 'Ava' }),
    node('[90,720][300,745]', { text: 'overlaps' }),
  ]);
  const realHits = evaluateCheckpoint(
    normalizeMaestroCapture(real, { density: 1, viewport, resourceMeta: meta }).nodes,
    { platform: 'ios', viewport },
  ).findings.filter((f) => f.rule === 1 && /overlaps/.test(f.reason));
  assert.ok(realHits.length >= 1, 'a genuine inset text-over-control overlap is still flagged');
});

// ───────────── 6. A container-text (iOS window root "SnapScore") never paints over its descendants ──
test('ancestor text: the iOS "SnapScore" window root does not paint over the controls it wraps', () => {
  const viewport = { width: 402, height: 874 };
  const cap = node('[0,0][0,0]', {}, [ // structural root wrapper (dropped)
    node('[0,0][375,667]', { accessibilityText: 'SnapScore' }, [ // window root, labelled, NOT full-viewport
      node('[20,186][355,238]', { 'resource-id': 'home-new-contest', text: 'New Contest' }),
    ]),
  ]);
  const { nodes } = normalizeMaestroCapture(cap, { density: 1, viewport, resourceMeta: SNAPSCORE_META });
  const root = nodes.find((n) => (n.text || '') === 'SnapScore');
  assert.ok(root, 'the "SnapScore" container survives (it is 375x667, not the 402x874 viewport, so not a backdrop)');
  const { findings } = evaluateCheckpoint(nodes, { platform: 'ios', viewport });
  const snapHits = findings.filter((f) => f.rule === 1 && /SnapScore/.test(f.reason));
  assert.equal(snapHits.length, 0, `the ancestor container must not "paint over" its descendant control: ${JSON.stringify(snapHits)}`);
});

// ───────────── 7. iOS keyboard container (leaked bottom-row key) + sticky-footer exemption ─────────
// iOS nests the keyboard in an untagged full-width bottom-anchored container; its main layer carries a
// UIKeyboard* id but the bottom key row ("Emoji") are SIBLINGS that leak as app text over the footer.
function iosKeyboardOverFooter() {
  return node('[0,0][0,0]', {}, [
    node('[0,0][402,874]', { accessibilityText: 'SnapScore' }, [
      node('[20,762][382,816]', { 'resource-id': 'contest-continue', text: 'Continue' }), // sticky CTA
      node('[0,583][402,874]', {}, [ // keyboard container (untagged, bottom-anchored, full width)
        node('[0,583][402,816]', { 'resource-id': 'UIKeyboardLayoutStar Preview' }, [
          node('[20,600][60,640]', { text: 'Q' }),
        ]),
        node('[8,805][76,874]', { text: 'Emoji' }), // leaked bottom-row key (sibling of the layout layer)
      ]),
    ]),
  ]);
}
test('iOS keyboard: the whole keyboard container is stripped (leaked "Emoji" key gone) and folds the bottom inset', () => {
  const viewport = { width: 402, height: 874 };
  const { nodes, safeArea } = normalizeMaestroCapture(iosKeyboardOverFooter(), { density: 1, viewport, resourceMeta: SNAPSCORE_META });
  const texts = new Set(nodes.map((n) => (n.text || '').trim()));
  assert.ok(!texts.has('Emoji') && !texts.has('Q'), 'no keyboard key survives into app geometry');
  assert.ok(nodes.find((n) => n.id === 'contest-continue'), 'the sticky footer CTA (separate subtree) is kept');
  assert.ok(safeArea && safeArea.bottom > 0, 'the keyboard folds into the bottom safe-area inset');
  const { findings } = evaluateCheckpoint(nodes, { platform: 'ios', viewport });
  assert.equal(findings.filter((f) => f.rule === 1 && /Emoji/.test(f.reason)).length, 0, 'no keyboard-key-over-CTA finding');
  // Rule 2: the footer CTA sits behind the keyboard-raised inset but is EXEMPT (pinned chrome); content
  // hidden behind the footer is still caught separately.
  assert.equal(findings.filter((f) => f.rule === 2 && f.nodes.includes('contest-continue')).length, 0,
    'the sticky footer CTA is exempt from the content safe-area check (transient keyboard covers it)');
});

// ───────────── 8. Rule 5 edge-gap uses the PAINTED rect (scroll-clipped row vs fixed chrome) ──────
test('rule 5 edge-gap: a row clipped at the scroll edge is not "jammed" against the fixed footer', () => {
  const viewport = { width: 375, height: 667 };
  const meta = {
    'app-window': { role: 'container', meta: {} },
    'contest-scroll': { role: 'container', meta: { scrollClip: true } },
    'last-row': { role: 'control', meta: { tappable: true } },
    'contest-continue': { role: 'control', meta: { tappable: true, footerAnchor: true, cta: true } },
  };
  // last-row raw bottom 589 touches the footer top (0pt), but the scroll viewport ends at 577 so its
  // PAINTED bottom is 577 → a real 12pt gap. Rule 5 must use the painted extent and NOT flag it.
  const cap = node('[0,0][375,667]', { 'resource-id': 'app-window' }, [
    node('[0,122][375,577]', { 'resource-id': 'contest-scroll' }, [
      node('[79,545][342,589]', { 'resource-id': 'last-row', checked: 'true' }),
    ]),
    node('[20,589][355,643]', { 'resource-id': 'contest-continue', text: 'Continue', checked: 'true' }),
  ]);
  const { nodes } = normalizeMaestroCapture(cap, { density: 1, viewport, resourceMeta: meta });
  const { findings } = evaluateCheckpoint(nodes, { platform: 'ios', viewport });
  const gapHits = findings.filter((f) => f.rule === 5 && f.nodes.includes('last-row') && f.nodes.includes('contest-continue'));
  assert.equal(gapHits.length, 0, `scroll-clipped row must not jam against the fixed footer: ${JSON.stringify(gapHits)}`);
});

// ───────────── 9. Cross-leg capture: hierarchy window must match the profile viewport (round 7) ──────
// On the Mac mini both iOS legs boot concurrently and Maestro's shared iOS driver can return the OTHER
// leg's hierarchy for a checkpoint (observed at 433f1f8a: SE-3 "empty wizard" tree was 402x874; the
// 16-pro "join" tree was 375x667). windowViewportMismatch detects it from the normalized tree so the
// crossed artifact fails as a hard HARNESS error (named profile+root+expected), never a product finding.
const CFG_PATH = resolve(__dir, '../config/device-layout.config.json');
const CONFIG = JSON.parse(readFileSync(CFG_PATH, 'utf8'));
const win = (w, h) => [{ id: 'n0', role: 'text', text: 'SnapScore', bbox: { left: 0, top: 0, right: w, bottom: h }, parentId: null, meta: {} },
  { id: 'c', role: 'control', text: 'x', bbox: { left: 10, top: 100, right: 100, bottom: 140 }, parentId: 'n0', meta: {} }];

test('cross-leg detector: a correct window matches its profile; a crossed one is a named mismatch', () => {
  const se = profileById(CONFIG, 'iphone-se-3');
  const pro = profileById(CONFIG, 'iphone-16-pro');
  // Correct captures → no mismatch.
  assert.equal(windowViewportMismatch(win(375, 667), se), null, 'SE-3 window 375x667 matches');
  assert.equal(windowViewportMismatch(win(402, 874), pro), null, '16-pro window 402x874 matches');
  // The two real crosses at 433f1f8a → named mismatch (profile + root + expected).
  const seCross = windowViewportMismatch(win(402, 874), se);
  assert.ok(seCross && /402x874/.test(seCross) && /iphone-se-3/.test(seCross) && /375x667/.test(seCross), seCross);
  const proCross = windowViewportMismatch(win(375, 667), pro);
  assert.ok(proCross && /375x667/.test(proCross) && /iphone-16-pro/.test(proCross) && /402x874/.test(proCross), proCross);
  // captureWindow picks the largest top-level survivor (the OS window), not a child.
  assert.deepEqual(captureWindow(win(375, 667)), { id: 'n0', width: 375, height: 667 });
});

test('cross-leg detector: a window merely SHORTER than the profile (Android bars) is NOT flagged', () => {
  const android = profileById(CONFIG, 'android-compact'); // 360x800
  assert.equal(windowViewportMismatch(win(360, 752), android), null, 'a status/nav-bar-inset 360x752 window is legitimate');
  // ...but a width mismatch (a genuinely different device) still is.
  assert.ok(windowViewportMismatch(win(375, 752), android), 'a 375-wide window is not android-compact (360)');
});

test('cross-leg detector: fires on a real normalized crossed capture (SE-3 profile, 402x874 tree)', () => {
  const viewport = { width: 375, height: 667 }; // SE-3 profile viewport passed to normalize
  // A capture whose actual window is 402x874 (the 16-pro tree returned on the SE-3 leg).
  const crossed = node('[0,0][0,0]', {}, [
    node('[0,0][402,874]', { accessibilityText: 'SnapScore' }, [
      node('[20,186][355,238]', { 'resource-id': 'home-new-contest', text: 'New Contest' }),
    ]),
  ]);
  const { nodes } = normalizeMaestroCapture(crossed, { density: 1, viewport, resourceMeta: SNAPSCORE_META });
  const se = profileById(CONFIG, 'iphone-se-3');
  assert.ok(windowViewportMismatch(nodes, se), 'the 402x874 window on the SE-3 leg is detected as crossed');
});

// ───────────── 10. Footer bisection: scroll-edge clip EXEMPT; real overlay / keyboard-hidden FAIL ──
// new.tsx: the Continue footer is a flow sibling AFTER the KeyboardAvoidingView/ScrollView (verified in
// code) and the ScrollView ends with a 96pt spacer. A card merely cut by the scroll edge (painted
// bottom clamped to the scroll viewport, which ends at/above the footer top) is a plain scroll-edge
// fragment — NOT a footer bisection. A footer that OVERLAYS content, or an input hidden by the
// keyboard, still fails rule 2.
const rowNode = (id, bbox, meta = {}) => ({ id, role: 'control', text: id, bbox, hitRegion: bbox, parentId: 'app', meta: { required: true, ...meta } });

test('footer rule: a card cut at the scroll edge (footer is a flow sibling below) is EXEMPT from rule 2', () => {
  const viewport = { width: 375, height: 667 };
  // Card raw bottom 560 reaches the footer, but it is scroll-clipped to the viewport bottom 520 (the
  // footer sits BELOW the scroll area) → painted bottom 520 == footer.top → not a bisection.
  const nodes = [
    { id: 'app', role: 'container', bbox: { left: 0, top: 0, right: 375, bottom: 667 }, parentId: null, meta: {} },
    rowNode('player-2', { left: 79, top: 480, right: 342, bottom: 560 },
      { clipBottom: true, clipRect: { left: 79, top: 480, right: 342, bottom: 520 } }),
  ];
  const ctx = { platform: 'ios', viewport, safeArea: { top: 20, bottom: 0 }, footer: { left: 0, top: 520, right: 375, bottom: 667 } };
  const hits = evaluateCheckpoint(nodes, ctx).findings.filter((f) => f.rule === 2 && f.nodes.includes('player-2'));
  assert.equal(hits.length, 0, `scroll-edge-clipped card must be exempt: ${JSON.stringify(hits)}`);
});

test('footer rule: a footer that OVERLAYS content (card painted under it, not scroll-clipped) still FAILS', () => {
  const viewport = { width: 375, height: 667 };
  // Card is NOT scroll-clipped: its painted bottom 560 runs behind the footer top 520 → real overlay.
  const nodes = [
    { id: 'app', role: 'container', bbox: { left: 0, top: 0, right: 375, bottom: 667 }, parentId: null, meta: {} },
    rowNode('player-2', { left: 79, top: 480, right: 342, bottom: 560 }),
  ];
  const ctx = { platform: 'ios', viewport, safeArea: { top: 20, bottom: 0 }, footer: { left: 0, top: 520, right: 375, bottom: 667 } };
  const hits = evaluateCheckpoint(nodes, ctx).findings.filter((f) => f.rule === 2 && f.nodes.includes('player-2'));
  assert.ok(hits.length >= 1, 'content painted behind an overlapping footer is still a rule-2 finding');
});

test('footer rule: a focused input hidden by the keyboard-raised inset still FAILS rule 2', () => {
  const viewport = { width: 375, height: 667 };
  // No footer; the keyboard raised the bottom safe-area inset to 120 → usable bottom 547. The focused
  // input runs to 660, below that line → unreachable/covered → rule 2 fires (not footer chrome).
  const nodes = [
    { id: 'app', role: 'container', bbox: { left: 0, top: 0, right: 375, bottom: 667 }, parentId: null, meta: {} },
    rowNode('name-input', { left: 20, top: 610, right: 355, bottom: 660 }, { focused: true }),
  ];
  const ctx = { platform: 'ios', viewport, safeArea: { top: 20, bottom: 120 } };
  const hits = evaluateCheckpoint(nodes, ctx).findings.filter((f) => f.rule === 2 && f.nodes.includes('name-input'));
  assert.ok(hits.length >= 1, 'a keyboard-hidden focused input is still flagged');
});

test('footer rule (integration): a real contest-scroll card + flow-sibling footer is exempt', () => {
  const viewport = { width: 375, height: 667 };
  const meta = {
    'app-window': { role: 'container', meta: {} },
    'contest-scroll': { role: 'container', meta: { scrollClip: true } },
    'player-2': { role: 'control', meta: { tappable: true, required: true } },
    'contest-continue': { role: 'control', meta: { tappable: true, footerAnchor: true, cta: true } },
  };
  // ScrollView [0,122][375,520]; the last card raw-reaches 560 but is masked to 520; footer below it.
  const cap = node('[0,0][375,667]', { 'resource-id': 'app-window' }, [
    node('[0,122][375,520]', { 'resource-id': 'contest-scroll' }, [
      node('[79,480][342,560]', { 'resource-id': 'player-2', checked: 'true' }),
    ]),
    node('[20,520][355,574]', { 'resource-id': 'contest-continue', text: 'Continue', checked: 'true' }),
  ]);
  const { nodes } = normalizeMaestroCapture(cap, { density: 1, viewport, resourceMeta: meta });
  const hits = evaluateCheckpoint(nodes, { platform: 'ios', viewport }).findings
    .filter((f) => f.rule === 2 && f.nodes.includes('player-2'));
  assert.equal(hits.length, 0, `real scroll-edge card must not be flagged as footer-bisected: ${JSON.stringify(hits)}`);
});
