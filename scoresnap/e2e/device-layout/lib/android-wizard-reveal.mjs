// Android A2/A3 capture evidence only. This module does not score or waive the geometry gate.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const MIN_TARGET_DP = 48;
const EPS = 1e-8; // arithmetic tolerance only, not a reduced minimum
const ALIGN_DP = 0.51; // native integer pixel quantization at compact density
const AXES = ['left', 'top', 'right', 'bottom'];
const SCENE = 'new-contest';
const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
const fail = message => { throw new Error('Android wizard reveal: ' + message); };
const isHex = (v, n) => typeof v === 'string' && v.length === n && /^[0-9a-f]+$/.test(v);
const close = (a, b, e = EPS) => Math.abs(a - b) <= e;
const finite = r => r && AXES.every(k => Number.isFinite(r[k]));
const rect = r => finite(r) && r.right > r.left && r.bottom > r.top;
const exactRect = (a, b) => finite(a) && finite(b) && AXES.every(k => close(a[k], b[k]));
const inside = (inner, outer) => inner.left >= outer.left - EPS && inner.top >= outer.top - EPS &&
  inner.right <= outer.right + EPS && inner.bottom <= outer.bottom + EPS;
const w = r => r.right - r.left;
const h = r => r.bottom - r.top;
const semantic = n => [n.role, n.text, n.enabled, n.checked, n.selected, n.focused, n.meta?.required === true];
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

function onlyCheckpoint(bundle, name) {
  if (bundle.schema !== 'device-layout/v1' || bundle.platform !== 'android' ||
      !isHex(bundle.sourceSha, 40) || !isHex(bundle.buildHash, 64) || !isHex(bundle.configSha256, 64))
    fail('source/build/config/profile binding is required');
  const hits = bundle.checkpoints?.filter(x => x.flow === SCENE && x.checkpoint === name) || [];
  if (hits.length !== 1 || hits[0].platform !== 'android' || hits[0].deviceId !== bundle.profile ||
      !Array.isArray(hits[0].nodes)) fail('expected precisely one same-scene Android checkpoint');
  return hits[0];
}
function measurePng(cp, reader) {
  if (typeof cp.screenshot !== 'string' || !/^[\w.-]+\.png$/.test(cp.screenshot) ||
      !isHex(cp.screenshotSha256, 64)) fail('missing native PNG binding');
  const bytes = reader(cp.screenshot);
  if (!Buffer.isBuffer(bytes) || bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG) ||
      bytes.readUInt32BE(8) !== 13 || bytes.toString('ascii', 12, 16) !== 'IHDR' ||
      createHash('sha256').update(bytes).digest('hex') !== cp.screenshotSha256)
    fail('native PNG hash/header mismatch');
  const dims = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (dims.some(n => n === 0)) fail('invalid native PNG size');
  return dims;
}
function bound(a, b) {
  const geometry = (cp) => {
    const { viewport, safeArea, footer, fontScale } = cp.context || {};
    if (!viewport || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) ||
        !safeArea || !AXES.every(k => Number.isFinite(safeArea[k]) && safeArea[k] >= 0) ||
        !Number.isFinite(fontScale) || (footer != null && !finite(footer))) fail('measured viewport/insets required');
    return { left: safeArea.left, right: viewport.width - safeArea.right, top: safeArea.top,
      bottom: Math.min(viewport.height - safeArea.bottom, footer?.top ?? Infinity) };
  };
  const aa = geometry(a), bb = geometry(b);
  if (!rect(aa) || !exactRect(aa, bb) || a.context.fontScale !== b.context.fontScale ||
      !same([a.context.viewport.width, a.context.viewport.height, a.context.measuredKeyboardInset],
        [b.context.viewport.width, b.context.viewport.height, b.context.measuredKeyboardInset]) ||
      !same(a.context.footer == null ? [] : AXES.map(k => a.context.footer[k]),
        b.context.footer == null ? [] : AXES.map(k => b.context.footer[k])))
    fail('scroll aperture, footer, keyboard or font scale changed');
  return bb;
}
function node(cp, id) {
  // An ordinal n17 or a duplicate blank-player ID is not a stable identity.
  if (typeof id !== 'string' || !/^[a-z][a-z0-9_-]+$/i.test(id) || /^n\d+$/.test(id))
    fail('expected a native stable ID, not an anonymous ordinal');
  const found = cp.nodes.filter(n => n.id === id || n.meta?.resourceId === id);
  if (found.length !== 1 || found[0].id !== id || found[0].meta?.resourceId !== id)
    fail('missing or ambiguous native ID ' + id);
  const n = found[0];
  if (n.role !== 'control' || n.enabled !== true || n.meta?.tappable === false ||
      n.meta?.clippedOut === true || !rect(n.bbox) || !rect(n.hitRegion) || !rect(n.meta?.scrollViewport))
    fail('unmeasured, disabled or non-tappable control ' + id);
  return n;
}
function fullyWithin(n, safe) {
  return [n.bbox, n.hitRegion].every(r => inside(r, safe) && inside(r, n.meta.scrollViewport));
}

// Trusted inputs come from the existing native bundler, not authored JSON. Before and reveal are
// separate original captures of one checkpoint, with a scroll-only gesture between them.
export function verifyAndroidWizardReveal({ before, reveal, checkpoint, targetId, witnessIds, readBeforePng, readRevealPng }) {
  const a = onlyCheckpoint(before, checkpoint), b = onlyCheckpoint(reveal, checkpoint);
  if (!same([before.sourceSha, before.buildHash, before.configSha256, before.profile, before.fontScale, a.screen, a.state],
    [reveal.sourceSha, reveal.buildHash, reveal.configSha256, reveal.profile, reveal.fontScale, b.screen, b.state]))
    fail('different candidate, profile or checkpoint state');
  if (!same(measurePng(a, readBeforePng), measurePng(b, readRevealPng)) ||
      a.screenshotSha256 === b.screenshotSha256) fail('same frame or different native screenshot dimensions');
  const safe = bound(a, b);
  const p = node(a, targetId), r = node(b, targetId);
  const vp = p.meta.scrollViewport;
  if (!exactRect(vp, r.meta.scrollViewport) || !same(semantic(p), semantic(r)) ||
      !['left', 'right'].every(k => close(p.bbox[k], r.bbox[k], ALIGN_DP)))
    fail('target state, horizontal frame or measured scroll root changed');
  const top = close(p.bbox.top, vp.top, ALIGN_DP);
  const bottom = close(p.bbox.bottom, vp.bottom, ALIGN_DP);
  if (top === bottom || h(p.bbox) >= MIN_TARGET_DP - EPS ||
      w(p.bbox) + EPS < MIN_TARGET_DP || !inside(p.bbox, vp))
    fail('original is not a measured vertical-only sliver at a single scroll edge');
  if (!fullyWithin(r, safe) || [r.bbox, r.hitRegion].some(x => w(x) + EPS < MIN_TARGET_DP || h(x) + EPS < MIN_TARGET_DP))
    fail('reveal does not prove a full measured 48dp target inside viewport, safe area and footer');
  if (!Array.isArray(witnessIds) || witnessIds.length < 2 || new Set(witnessIds).size !== witnessIds.length ||
      witnessIds.includes(targetId)) fail('two distinct unchanged native scroll witnesses are required');
  const shifts = witnessIds.map(id => {
    const x = node(a, id), y = node(b, id);
    if (!same(semantic(x), semantic(y)) || !fullyWithin(x, safe) || !fullyWithin(y, safe) ||
        !exactRect(vp, x.meta.scrollViewport) || !exactRect(vp, y.meta.scrollViewport) ||
        !['left', 'right'].every(k => close(x.bbox[k], y.bbox[k], ALIGN_DP)) ||
        !close(h(x.bbox), h(y.bbox), ALIGN_DP) ||
        !close(y.bbox.top - x.bbox.top, y.hitRegion.top - x.hitRegion.top, ALIGN_DP))
      fail('scroll witness state or frame changed: ' + id);
    return y.bbox.top - x.bbox.top;
  });
  const shift = shifts[0], edge = top ? 'bottom' : 'top';
  if ((top ? shift : -shift) <= ALIGN_DP || !shifts.every(x => close(x, shift, ALIGN_DP)) ||
      !close(r.bbox[edge] - p.bbox[edge], shift, ALIGN_DP))
    fail('no witnessed scroll-only displacement of the same native target');
  return { targetId, required: r.meta?.required === true, beforeHeightDp: h(p.bbox),
    revealedHeightDp: h(r.bbox), revealedWidthDp: w(r.bbox), measuredScrollDp: shift,
    beforePng: a.screenshotSha256, revealPng: b.screenshotSha256, sourceSha: before.sourceSha,
    buildHash: before.buildHash, profile: before.profile, fontScale: b.context.fontScale };
}
function loadBundle(path) {
  const dir = realpathSync(dirname(resolve(path)));
  return { bundle: JSON.parse(readFileSync(path, 'utf8')), readPng(name) {
    const file = join(dir, name);
    if (name !== basename(name) || realpathSync(file) !== file) fail('native PNG must be a direct capture file');
    return readFileSync(file);
  } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const [beforePath, revealPath, checkpoint, targetId, ...witnessIds] = process.argv.slice(2);
    if (!beforePath || !revealPath || !checkpoint || !targetId) fail('usage: <initial bundle> <reveal bundle> <checkpoint> <target ID> <witness ID> <witness ID>');
    const a = loadBundle(beforePath), b = loadBundle(revealPath);
    console.log(JSON.stringify(verifyAndroidWizardReveal({ before: a.bundle, reveal: b.bundle,
      checkpoint, targetId, witnessIds, readBeforePng: a.readPng, readRevealPng: b.readPng })));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
