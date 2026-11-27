// The Android leg could not go green: Android reports only the visible part of a row, so a control
// that is merely scrolled half out of the list is measured as a 4dp-tall target and fails rule 5
// (run 46008363328: "0" 60x4, "A" 48x4, the contest name field 320x22). DotBot's verifier
// (android-wizard-reveal.mjs) can prove such a sliver is the same control, whole, after a
// scroll-only move. This wires that proof into the verdict. It forgives nothing without the proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { androidWizardRevealCoverage, loadRevealCapture } from './android-wizard-reveal-coverage.mjs';
import { evaluateCheckpoint } from './geometry-rules.mjs';
import { runBundle } from '../run-geometry.mjs';

const vp = { top: 120, bottom: 650, left: 0, right: 360 };
const box = (top, bottom, left = 20, right = 340) => ({ top, bottom, left, right });
const control = (id, top, bottom, extra = {}) => {
  const bbox = box(top, bottom, extra.left ?? 20, extra.right ?? 340);
  return { id, role: 'control', text: id, enabled: true, bbox, hitRegion: { ...bbox }, meta: { resourceId: id, tappable: true, scrollViewport: { ...vp }, ...extra.meta } };
};
const png = (seed) => { const b = Buffer.alloc(33, seed); Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b); b.writeUInt32BE(1080, 16); b.writeUInt32BE(2400, 20); return b; };
const sha = (b) => createHash('sha256').update(b).digest('hex');
const SCROLL = { id: 'contest-scroll', role: 'container', text: '', enabled: true, bbox: { ...vp }, hitRegion: { ...vp }, meta: { resourceId: 'contest-scroll', scrollClip: true } };

// One checkpoint, captured three times: as the flow left it, after the list moved down 40dp
// (shows what was cut at the top edge), and after it moved up 44dp (shows the bottom edge).
function capture(t, { shift = 0, seed = 1, name = 'bundle.json' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'android-reveal-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bytes = png(seed);
  writeFileSync(join(dir, 'scene.png'), bytes);
  const clipped = (id, top, bottom, extra) => {
    const a = Math.max(top + shift, vp.top), b = Math.min(bottom + shift, vp.bottom);
    return b - a > 0 ? [control(id, a, b, extra)] : [];
  };
  const nodes = [SCROLL,
    ...clipped('wizard-contest-name', 90, 142),      // top sliver: 22dp of 52 showing
    ...clipped('wizard-course', 245, 297),
    ...clipped('tournament-toggle-slot', 375, 423),
    ...clipped('wizard-player-name-1', 450, 502),
    ...clipped('wizard-player-handicap-2', 646, 698, { left: 280, right: 340 }), // bottom sliver: 4dp of 52 showing
  ];
  const bundle = { schema: 'device-layout/v1', platform: 'android', profile: 'android-compact', sourceSha: 'a'.repeat(40), buildHash: 'b'.repeat(64), configSha256: 'c'.repeat(64), fontScale: 1,
    checkpoints: [{ flow: 'new-contest', checkpoint: 'multi day on', screen: 'new-contest', state: 'default', deviceId: 'android-compact', platform: 'android', screenshot: 'scene.png', screenshotSha256: sha(bytes),
      context: { viewport: { width: 360, height: 800 }, safeArea: { left: 0, right: 0, top: 45, bottom: 48 }, footer: box(650, 720, 0, 360), fontScale: 1, measuredKeyboardInset: 0 }, nodes }] };
  writeFileSync(join(dir, name), JSON.stringify(bundle));
  return { dir, bundle, path: join(dir, name) };
}
const scene = (t) => {
  const main = capture(t), down = capture(t, { shift: 40, seed: 2 }), up = capture(t, { shift: -44, seed: 3 });
  return { main, down, up, reveals: [loadRevealCapture(down.path), loadRevealCapture(up.path)], cp: main.bundle.checkpoints[0] };
};
const node = (cp, id) => cp.nodes.find((n) => n.id === id);
const cover = (s, reveals = s.reveals) => androidWizardRevealCoverage(s.main.bundle, { evidenceDir: s.main.dir, reveals });
const proved = (s, id, reveals) => Boolean(cover(s, reveals).get(s.cp)?.has(node(s.cp, id)));
const sizeFindings = (s, id, map = cover(s)) => evaluateCheckpoint(s.cp.nodes, { ...s.cp.context, platform: 'android' }, map.get(s.cp)).findings.filter((f) => f.rule === 5 && f.nodes.includes(id) && /effective size/.test(f.reason));

test('without reveal captures both slivers fail the 48dp rule, exactly as before', (t) => {
  const s = scene(t);
  assert.equal(cover(s, []).size, 0);
  assert.equal(sizeFindings(s, 'wizard-contest-name', new Map()).length, 1);
  assert.equal(sizeFindings(s, 'wizard-player-handicap-2', new Map()).length, 1);
  assert.match(sizeFindings(s, 'wizard-player-handicap-2', new Map())[0].reason, /60×4 < 48×48/);
});

test('a top sliver and a bottom sliver are each proved by the capture that scrolled the right way, and only then pass', (t) => {
  const s = scene(t);
  assert.ok(proved(s, 'wizard-contest-name'));
  assert.ok(proved(s, 'wizard-player-handicap-2'));
  assert.equal(sizeFindings(s, 'wizard-contest-name').length, 0);
  assert.equal(sizeFindings(s, 'wizard-player-handicap-2').length, 0);
  // Each needs its own direction.
  assert.ok(proved(s, 'wizard-contest-name', [s.reveals[0]]) && !proved(s, 'wizard-contest-name', [s.reveals[1]]));
  assert.ok(proved(s, 'wizard-player-handicap-2', [s.reveals[1]]) && !proved(s, 'wizard-player-handicap-2', [s.reveals[0]]));
  // Controls that were whole all along are not in the proof set: nothing is granted that was not needed.
  assert.ok(!proved(s, 'wizard-course'));
  const proof = cover(s).get(s.cp).get(node(s.cp, 'wizard-contest-name'));
  assert.equal(proof.targetId, 'wizard-contest-name');
  assert.equal(proof.witnessIds.length, 2);
  assert.match(proof.revealPng, /^[0-9a-f]{64}$/);
});

test('the proof changes nothing for a control that is really too small', (t) => {
  const s = scene(t);
  // 30dp tall in the middle of the list, in every capture: not a sliver, never proved.
  for (const c of [s.main, s.down, s.up]) { const n = node(c.bundle.checkpoints[0], 'wizard-course'); n.bbox.bottom = n.bbox.top + 30; n.hitRegion = { ...n.bbox }; }
  const reveals = [{ ...s.reveals[0], bundle: s.down.bundle }, { ...s.reveals[1], bundle: s.up.bundle }];
  assert.ok(!proved(s, 'wizard-course', reveals));
  assert.equal(sizeFindings(s, 'wizard-course', cover(s, reveals)).length, 1);
  // And a sliver whose whole frame turns out to be under 48dp stays a finding.
  const r = node(s.down.bundle.checkpoints[0], 'wizard-contest-name'); r.bbox.bottom = r.bbox.top + 40; r.hitRegion = { ...r.bbox };
  assert.ok(!proved(s, 'wizard-contest-name', reveals));
});

for (const [why, mutate] of Object.entries({
  'another candidate': (s) => { s.reveals[0].bundle.sourceSha = 'd'.repeat(40); },
  'another build': (s) => { s.reveals[0].bundle.buildHash = 'd'.repeat(64); },
  'another gate config': (s) => { s.reveals[0].bundle.configSha256 = 'd'.repeat(64); },
  'another profile': (s) => { s.reveals[0].bundle.profile = 'android-large'; s.reveals[0].bundle.checkpoints[0].deviceId = 'android-large'; },
  'another font scale': (s) => { s.reveals[0].bundle.checkpoints[0].context.fontScale = 1.3; },
  'the screenshot was replaced': (s) => writeFileSync(join(s.down.dir, 'scene.png'), png(9)),
  'the same frame presented as the reveal': (s) => { s.reveals[0] = loadRevealCapture(s.main.path); },
  'the keyboard came up between the two': (s) => { s.reveals[0].bundle.checkpoints[0].context.measuredKeyboardInset = 280; },
  'the footer moved': (s) => { s.reveals[0].bundle.checkpoints[0].context.footer.top = 640; },
  'the control changed state': (s) => { node(s.reveals[0].bundle.checkpoints[0], 'wizard-contest-name').text = 'Saturday'; },
  'a witness changed state': (s) => { for (const n of s.reveals[0].bundle.checkpoints[0].nodes) if (n.id !== 'wizard-contest-name' && n.id !== 'contest-scroll') n.checked = true; },
  'the list did not move as one': (s) => { const n = node(s.reveals[0].bundle.checkpoints[0], 'wizard-contest-name'); n.bbox.top += 9; n.bbox.bottom += 9; n.hitRegion = { ...n.bbox }; },
  'the reveal has the checkpoint twice': (s) => { s.reveals[0].bundle.checkpoints.push(structuredClone(s.reveals[0].bundle.checkpoints[0])); },
  'the control is required at this checkpoint': (s) => { node(s.cp, 'wizard-contest-name').meta.required = true; node(s.reveals[0].bundle.checkpoints[0], 'wizard-contest-name').meta.required = true; },
  'the control has no stable id': (s) => { for (const c of [s.cp, s.reveals[0].bundle.checkpoints[0]]) { const n = node(c, 'wizard-contest-name'); n.id = 'n17'; n.meta.resourceId = ''; } },
})) test(`no proof, and the finding stays, when ${why}`, (t) => {
  const s = scene(t);
  const id = why === 'the control has no stable id' ? 'n17' : 'wizard-contest-name';
  mutate(s);
  assert.ok(!cover(s).get(s.cp)?.has(node(s.cp, id)));
  assert.equal(sizeFindings(s, id).length, 1);
});

test('fewer than two unchanged witnesses is no proof', (t) => {
  const s = scene(t);
  for (const c of [s.cp, ...s.reveals.map((r) => r.bundle.checkpoints[0])]) c.nodes = c.nodes.filter((n) => ['contest-scroll', 'wizard-contest-name', 'wizard-course'].includes(n.id));
  assert.ok(!proved(s, 'wizard-contest-name'));
});

test('it is an Android proof only: an iPhone bundle, another flow, or a proof set handed to iPhone rules gets nothing', (t) => {
  const s = scene(t);
  const map = cover(s);
  // The same set given to the iPhone rule does not waive the iPhone size check.
  const ios = evaluateCheckpoint(s.cp.nodes, { ...s.cp.context, platform: 'ios' }, map.get(s.cp)).findings.filter((f) => f.rule === 5 && f.nodes.includes('wizard-player-handicap-2') && /effective size/.test(f.reason));
  assert.equal(ios.length, 1);
  const other = structuredClone(s.main.bundle); other.platform = 'ios'; other.checkpoints[0].platform = 'ios';
  assert.equal(androidWizardRevealCoverage(other, { evidenceDir: s.main.dir, reveals: s.reveals }).size, 0);
  const paywall = structuredClone(s.main.bundle); paywall.checkpoints[0].flow = 'paywall';
  assert.equal(androidWizardRevealCoverage(paywall, { evidenceDir: s.main.dir, reveals: s.reveals }).size, 0);
  // No evidence directory: nothing can be bound to a screenshot.
  assert.equal(androidWizardRevealCoverage(s.main.bundle, { reveals: s.reveals }).size, 0);
});

test('the geometry runner uses the proof, reports it, and fails closed on a broken reveal file', (t) => {
  const s = scene(t);
  const waivers = { schema: 'device-layout-waivers/v1', waivers: [] };
  const without = runBundle(structuredClone(s.main.bundle), waivers, new Date(), { evidenceDir: s.main.dir });
  const sized = (out) => out.results[0].kept.filter((f) => f.rule === 5 && /effective size/.test(f.reason)).map((f) => f.nodes[0]).sort();
  assert.deepEqual(sized(without), ['wizard-contest-name', 'wizard-player-handicap-2']);
  const withProof = runBundle(s.main.bundle, waivers, new Date(), { evidenceDir: s.main.dir, reveals: s.reveals });
  assert.deepEqual(sized(withProof), []);
  assert.deepEqual(withProof.results[0].verifiedScrollReveals.map((p) => p.targetId).sort(), ['wizard-contest-name', 'wizard-player-handicap-2']);
  mkdirSync(join(s.down.dir, 'x'));
  writeFileSync(join(s.down.dir, 'x', 'broken.json'), '{not json');
  assert.throws(() => loadRevealCapture(join(s.down.dir, 'x', 'broken.json')), /Android wizard reveal/);
});
