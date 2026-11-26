#!/usr/bin/env node
// Android compact offline paywall capture only. This cannot return a release decision.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectFromArgs, runBundle } from './run-geometry.mjs';
import { isAncestor, indexTree, paintedRect } from './lib/geometry-rules.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const PROFILE = 'android-compact';
const STEM = '00-paywall-tier-td';
const LABELS = ['Free', 'Tournament Director', '$79.99/year'];
const requireOk = (ok, message) => { if (!ok) throw new Error(message); };
const within = (r, outer) => r.left >= outer.left && r.top >= outer.top &&
  r.right <= outer.right && r.bottom <= outer.bottom;

function evaluateFrame(bundlePath, { sourceSha, apkSha256, fontScale }) {
  requireOk(/^[a-f0-9]{40}$/.test(sourceSha || '') && /^[a-f0-9]{64}$/.test(apkSha256 || '') &&
    [1, 1.3].includes(fontScale), 'Expected exact source, APK hash and font scale');
  const bundle = JSON.parse(readFileSync(bundlePath, 'utf8'));
  const manifest = JSON.parse(readFileSync(join(dirname(bundlePath), 'capture-manifest.json'), 'utf8'));
  const checkpoint = bundle.checkpoints?.[0];
  const row = manifest.checkpoints?.[0];
  requireOk(bundle.platform === 'android' && bundle.profile === PROFILE &&
    Array.isArray(bundle.checkpoints) && bundle.checkpoints.length === 1 &&
    checkpoint?.flow === 'paywall' && checkpoint.checkpoint === 'tier td' && checkpoint.screen === 'paywall' &&
    checkpoint.state === 'default' && checkpoint.context?.fontScale === fontScale &&
    checkpoint.context?.viewport?.width === 360 && checkpoint.context?.viewport?.height === 800 &&
    checkpoint.screenshot === STEM + '.png', 'Wrong paywall capture scope, viewport, or font scale');
  requireOk(manifest.schema === 'device-layout-capture/v1' && manifest.sourceSha === sourceSha &&
    manifest.buildHash === apkSha256 && manifest.profile === PROFILE && manifest.platform === 'android' &&
    manifest.viewport?.width === 360 && manifest.viewport?.height === 800 && manifest.density === 3 &&
    manifest.fontScale === fontScale && Array.isArray(manifest.checkpoints) && manifest.checkpoints.length === 1 &&
    row?.flow === 'paywall' && row.checkpoint === 'tier td' && row.screen === 'paywall' &&
    row.state === 'default' && row.fontScale === fontScale && row.screenshot === STEM + '.png' &&
    row.hierarchy === STEM + '.hierarchy.json', 'Missing or mismatched original Android capture manifest');
  const image = readFileSync(join(dirname(bundlePath), row.screenshot));
  requireOk(image.length >= 24 && image.length <= 8 * 1024 ** 2 &&
    image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    image.toString('ascii', 12, 16) === 'IHDR' && image.readUInt32BE(16) === 1080 &&
    image.readUInt32BE(20) === 2400 && sha256(image) === checkpoint.screenshotSha256,
  'Missing or mismatched candidate screenshot');
  const expect = expectFromArgs(['--expect-sha', sourceSha, '--profile', PROFILE, '--expect-build', apkSha256]);
  const geometry = runBundle(bundle, { waivers: [] }, new Date(), {
    ...expect, flows: [{ id: 'paywall', checkpoints: ['tier td'] }],
  });
  requireOk(geometry.ok, geometry.error || 'Paywall-only geometry findings');
  const tree = indexTree(checkpoint.nodes);
  requireOk(tree.nodes.length === tree.byId.size, 'Duplicate hierarchy node IDs');
  const viewport = checkpoint.context.viewport;
  const sa = checkpoint.context.safeArea;
  const visible = { left: sa.left, top: sa.top, right: viewport.width - sa.right, bottom: viewport.height - sa.bottom };
  const freeRow = tree.controls.filter(n => n.text?.startsWith('Free,'));
  const tdRow = tree.controls.filter(n => n.checked === true && n.text?.startsWith('Tournament Director,'));
  const visibleNode = n => !n.meta?.clipTop && !n.meta?.clipBottom && !n.meta?.clippedOut &&
    !n.meta?.clipRect && within(paintedRect(n), visible);
  const measured = LABELS.flatMap((label, idx) => {
    const parents = idx === 0 ? freeRow : tdRow;
    if (parents.length !== 1) return [];
    const parent = parents[0];
    const matches = tree.texts.filter(n => n.text === label && isAncestor(tree, parent.id, n.id));
    const n = matches[0];
    return matches.length === 1 && visibleNode(n) && within(paintedRect(n), paintedRect(parent))
      ? [{ label, bboxDp: paintedRect(n) }]
      : [];
  });
  const cta = tree.controls.filter(n => n.text === 'Currently unavailable' && n.enabled === false && visibleNode(n));
  return { screenshotSha256: checkpoint.screenshotSha256, measured, ctaVisible: cta.length === 1 };
}

export function evaluatePaywallCapture(bundlePath, options) {
  const { sourceSha, apkSha256, fontScale, scrolledBundlePath } = options;
  const initial = evaluateFrame(bundlePath, options);
  const scrolled = scrolledBundlePath ? evaluateFrame(scrolledBundlePath, options) : null;
  requireOk(!scrolled || initial.screenshotSha256 !== scrolled.screenshotSha256, 'Scroll evidence must be a distinct frame');
  requireOk(LABELS.slice(0,2).every(label => initial.measured.some(m => m.label === label)),
    'Initial frame must show complete Free and selected Tournament Director bounds');
  const frames = [initial, ...(scrolled ? [scrolled] : [])];
  const measured = LABELS.flatMap(label => {
    const f = frames.find(f => f.measured.some(m => m.label === label));
    return f ? [{ ...f.measured.find(m => m.label === label), screenshotSha256: f.screenshotSha256 }] : [];
  });
  const captureReady = measured.length === LABELS.length && frames.some(f => f.ctaVisible);
  return { scope: 'android-offline-paywall-probe', sourceSha, apkSha256, fontScale, profile: PROFILE,
    screenshotSha256: initial.screenshotSha256, scrollScreenshotSha256: scrolled?.screenshotSha256,
    measured, ctaScreenshots: frames.filter(f => f.ctaVisible).map(f => f.screenshotSha256),
    geometryPassed: true, captureReady, visualStatus: 'required-not-evaluated', scopedVerdict: false,
    fullLayoutGate: false, releaseVerdict: false };
}

// This validates a separately obtained independent visual review, not OCR. A review of AX
// text alone must not be authored as this receipt. The receipt itself is not identity proof;
// collect it from the independent service's review record.
export function evaluateRenderedPair(first, large, review) {
  requireOk(first?.geometryPassed === true && large?.geometryPassed === true &&
    first.captureReady === true && large.captureReady === true &&
    first.fontScale === 1 && large.fontScale === 1.3 &&
    first.sourceSha === large.sourceSha && first.apkSha256 === large.apkSha256 &&
    first.screenshotSha256 !== large.screenshotSha256, 'Missing two distinct, same-APK scale captures');
  requireOk(review?.schema === 'snapscore-android-paywall-rendered-text/v1' &&
    review.sourceSha === first.sourceSha && review.apkSha256 === first.apkSha256 &&
    typeof review.independentReviewRef === 'string' && review.independentReviewRef.length > 0 &&
    Array.isArray(review.scales) && review.scales.length === 2, 'Candidate-bound independent rendered review required');
  for (const probe of [first, large]) {
    const rows = review.scales.filter(r => r?.fontScale === probe.fontScale);
    const row = rows[0];
    requireOk(rows.length === 1 && row.screenshotSha256 === probe.screenshotSha256 &&
      row.method === 'inspected-captured-pixels' &&
      row.rendered?.free === 'Free' && row.rendered?.paidTier === 'Tournament Director' &&
      row.rendered?.yearlyPrice === '$79.99/year' && row.noClippedGlyphs === true &&
      row.noEllipses === true && row.noOverlap === true &&
      probe.measured.every(({label,screenshotSha256})=>row.labelScreenshots?.[label]===screenshotSha256),
      'Rendered labels failed or evidence mismatch: ' + probe.fontScale);
    requireOk(row.ctaVisibleInReviewedFrame === 'Currently unavailable' &&
      probe.ctaScreenshots.includes(row.ctaScreenshotSha256),
    'Missing captured CTA accessibility proof; capture after scroll if below fold');
  }
  return { scopedVerdict: true, fullLayoutGate: false, releaseVerdict: false };
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] === '--review-pair') {
      const [, sourceSha, apkSha256, one, oneScroll, large, largeScroll, reviewPath, output] = process.argv.slice(2);
      requireOk(one && large && reviewPath && output, 'Usage: --review-pair SOURCE_SHA APK_SHA top1 scroll1|- top1.3 scroll1.3|- independent-review.json result.json');
      const probe = (path, scroll, fontScale) => evaluatePaywallCapture(path, {sourceSha, apkSha256, fontScale,
        scrolledBundlePath: scroll === '-' ? undefined : scroll});
      const result = evaluateRenderedPair(probe(one,oneScroll,1), probe(large,largeScroll,1.3),
        JSON.parse(readFileSync(reviewPath,'utf8')));
      writeFileSync(output, JSON.stringify(result,null,2)+'\n');
      console.log('Android compact paywall only: reviewed rendered text passed; not a release verdict.');
    } else {
      const [path, sourceSha, apkSha256, scale, output, scrolledBundlePath] = process.argv.slice(2);
      requireOk(path && output && ['1', '1.3'].includes(scale),
        'Usage: run-paywall-probe.mjs bundle.json SOURCE_SHA APK_SHA 1|1.3 result.json [scrolled-bundle.json]');
      const result = evaluatePaywallCapture(path, { sourceSha, apkSha256, fontScale: Number(scale), scrolledBundlePath });
      writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
      console.log('Paywall-only geometry checked; '+(result.captureReady?'rendered text review required: ':'full frame set incomplete: ')+basename(path));
    }
  } catch (error) {
    console.error('Paywall-only capture blocked: ' + error.message);
    process.exitCode = 1;
  }
}
