#!/usr/bin/env node
// AUG-1376 — Maestro capture → device-layout/v1 capture bundle.
//
// The native orchestrators (run-ios-sim.sh / run-android-compact.sh) drive the device-layout
// Maestro flows as DISCRETE checkpoint sub-flows and, after each one, dump the live Maestro view
// hierarchy (`maestro hierarchy`) plus a screenshot. They record one `capture-manifest.json` that
// names every checkpoint and its hierarchy file. This converter turns that capture directory into
// the single bundle `run-geometry.mjs` consumes:
//
//   { sourceSha, buildHash, device, profile, platform, checkpoints:[
//       { flow, checkpoint, screen, deviceId, state, platform, context:{...}, nodes:[ normalized ] } ] }
//
// Geometry comes straight from the capture (never fabricated). Per-profile viewport / safe-area /
// density come from config/device-layout.config.json; per-screen semantics (which resource-id is a
// switch, which row the round chips form, etc.) come from the SnapScore resource map below so the
// deterministic rules get precise context instead of guessing.
//
// Usage:
//   node scripts/bundle-from-maestro.mjs <captureDir|capture-manifest.json> \
//        --platform <ios|android> --profile <profileId> --out <bundle.json>
//
// Covered by lib/bundle-from-maestro.test.mjs (node --test).

import { verifyIOSWizard } from "../lib/ios-wizard-proof.mjs";
import { readFileSync, writeFileSync, existsSync, statSync , realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { normalizeMaestroCapture } from '../lib/normalize-maestro.mjs';
import { finiteRect } from '../lib/geometry-rules.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dir, '../config/device-layout.config.json');

// SnapScore resource-id → engine semantics. Keyed by the real testIDs in scoresnap/app
// (contest/new.tsx, (tabs)/index.tsx, paywall.tsx). `role`/`meta` ride through normalize-maestro
// into the geometry engine. We only assert what the app actually renders — unknown ids fall back
// to attribute-based role inference.
export const SNAPSCORE_META = {
  // New Contest — switches (AUG-1376). The native `*-slot` wrapper View is the real tap target
  // (sized >=48dp/44pt, rule 5); the Switch inside it is the state indicator (rule 7 legibility),
  // marked non-tappable by normalize-maestro so its fixed 47x27 intrinsic size never scores rule 5.
  'tournament-toggle-slot': { role: 'control', meta: { switchSlot: true, tappable: true, control: 'multi-day' } },
  'team-mode-slot': { role: 'control', meta: { switchSlot: true, tappable: true, control: 'team-mode' } },
  'tournament-toggle': { role: 'control', meta: { isSwitch: true, tappable: true, control: 'multi-day' } },
  'team-mode': { role: 'control', meta: { isSwitch: true, tappable: true, control: 'team-mode' } },
  // The New Contest scroll container (AUG-1376). Maestro reports every descendant's frame in raw
  // screen coordinates without applying this ScrollView's clipping, so a row scrolled above/below
  // the viewport is reported at an off-frame position it is NOT painted at (it is masked by the
  // ScrollView). Tagging the container lets normalize clip descendant rects to the real visible
  // viewport so rule 1 stops reporting scrolled content as overlapping the fixed header / footer.
  'contest-scroll': { role: 'container', meta: { scrollClip: true } },
  // Round-count segmented chips — a horizontal row (rule 6 vertical-center alignment + rule 5 size)
  'rounds-2': { role: 'control', meta: { tappable: true, rowGroup: 'rounds' } },
  'rounds-3': { role: 'control', meta: { tappable: true, rowGroup: 'rounds' } },
  'rounds-4': { role: 'control', meta: { tappable: true, rowGroup: 'rounds' } },
  // Nav / primary actions
  'home-new-contest': { role: 'control', meta: { tappable: true } },
  'new-contest-back': { role: 'control', meta: { tappable: true } },
  'add-group': { role: 'control', meta: { tappable: true } },
  // The sticky bottom-bar primary CTA (scoresnap/app/contest/new.tsx:1271). Its top anchors the
  // sticky-footer region, so rule 2 can flag any player row / required control that runs behind it
  // ("last player above footer" owner defect). Also a rule-5 tap target.
  'contest-continue': { role: 'control', meta: { tappable: true, footerAnchor: true, cta: true } },
  'contest-start': { role: 'control', meta: { tappable: true, footerAnchor: true, cta: true } },
  // If the app ever exposes an explicit footer container, prefer its measured bounds.
  'new-contest-footer': { role: 'container', meta: { footer: true } },
  'contest-footer': { role: 'container', meta: { footer: true } },
};

// A resource-id prefix map for the per-player dynamic testIDs (`player-handicap-<name>` etc).
const PREFIX_META = [
  { re: /^wizard-player-name-\d+$/, meta: { role: 'control', meta: { tappable: true } } },
  { re: /^wizard-player-row-\d+$/, meta: { role: 'container', meta: {} } },
  { re: /^player-handicap-/, meta: { role: 'control', meta: { tappable: true, control: 'handicap' } } },
  { re: /^player-group-/, meta: { role: 'control', meta: { tappable: true } } },
  { re: /^player-team-/, meta: { role: 'control', meta: { tappable: true } } },
  { re: /^remove-player-/, meta: { role: 'control', meta: { tappable: true } } },
  { re: /^game-mode-/, meta: { role: 'control', meta: { tappable: true } } },
  { re: /^skins-(mode|scope)-/, meta: { role: 'control', meta: { tappable: true } } },
];

export function resourceMetaFor(resourceId) {
  if (!resourceId) return null;
  if (SNAPSCORE_META[resourceId]) return SNAPSCORE_META[resourceId];
  for (const p of PREFIX_META) if (p.re.test(resourceId)) return p.meta;
  return null;
}

// Build the resourceMeta map normalize-maestro expects (keyed by resource-id). We pass the full
// SnapScore map plus a synthetic lookup for the prefix ids that actually appear in this capture.
function buildResourceMeta(rawRoot) {
  const map = { ...SNAPSCORE_META };
  (function walk(n) {
    const rid = n?.attributes?.['resource-id'];
    if (rid && !map[rid]) {
      const m = resourceMetaFor(rid);
      if (m) map[rid] = m;
    }
    for (const c of n?.children || []) walk(c);
  })(rawRoot);
  return map;
}

export function profileById(config, profileId) {
  const p = (config.profiles || []).find((x) => x.id === profileId);
  if (!p) throw new Error(`unknown profile "${profileId}" (not in device-layout.config.json)`);
  return p;
}

// The captured app WINDOW for a normalized checkpoint tree: the top-level survivor (parentId null)
// with the largest painted area. On both iOS and Android the OS window spans the full screen, so
// this node's width/height ARE the captured device's logical viewport. Returns null for an empty
// tree (other validation handles empty captures).
export function captureWindow(nodes) {
  let best = null;
  let bestArea = -1;
  for (const n of nodes) {
    if (n.parentId != null) continue; // only top-level survivors are OS windows
    const b = n.bbox;
    if (!b) continue;
    const area = (b.right - b.left) * (b.bottom - b.top);
    if (area > bestArea) { bestArea = area; best = n; }
  }
  if (!best) return null;
  return {
    id: best.id,
    width: Math.round(best.bbox.right - best.bbox.left),
    height: Math.round(best.bbox.bottom - best.bbox.top),
  };
}

// AUG-1376 (round 7): assert a checkpoint's captured window matches its PROFILE's viewport, so a
// hierarchy dumped from the WRONG simulator can never be scored against this profile's rules. On the
// Mac mini both iOS legs (iphone-16-pro 402x874, iphone-se-3 375x667) boot concurrently and Maestro's
// shared iOS driver can return the OTHER leg's hierarchy for a checkpoint (observed at 433f1f8a: the
// SE-3 "empty wizard" tree was 402x874, the 16-pro "join" tree was 375x667). Every profile in the
// gate has a DISTINCT width, and the OS window is full-bleed horizontally, so a width mismatch is an
// unambiguous cross; a window TALLER than the profile cannot be this device either. A window merely
// SHORTER than the profile (Android status/nav bars inset the content window) is legitimate and not
// flagged. Returns a human-readable mismatch string (profile + root + expected) or null.
export function windowViewportMismatch(nodes, profile) {
  const win = captureWindow(nodes);
  if (!win) return null;
  const [pw, ph] = profile.logicalSize;
  const WIDTH_TOL = 2;    // full-bleed width should equal the viewport within rounding
  const HEIGHT_OVER = 2;  // a window taller than the screen is impossible → cross
  const tooWide = Math.abs(win.width - pw) > WIDTH_TOL;
  const tooTall = win.height > ph + HEIGHT_OVER;
  if (!tooWide && !tooTall) return null;
  return `captured window ${win.width}x${win.height} (node "${win.id}") does not match profile ` +
    `"${profile.id}" viewport ${pw}x${ph}`;
}

// Logical density for normalize-maestro: iOS Maestro bounds are already in points (1); Android
// bounds are in pixels → density = dpi / 160.
export function densityFor(profile) {
  if (profile.platform === 'android') return (profile.dpi || 160) / 160;
  return 1;
}

// Derive the sticky-footer rect from the capture. Prefer an explicit footer container
// (meta.footer); otherwise synthesize the bar from the primary CTA (meta.footerAnchor) spanning
// full width from the CTA's top down to at least the viewport bottom. Returns null when neither
// is present (and null for a degenerate explicit container so the gate never aborts on bad geometry).
//
// AUG-1376: the span must stay well-formed. On a short device a checkpoint captured mid-transition
// can report the CTA's top at/below the viewport bottom (iPhone SE-3 empty-wizard reported the
// Continue bar at top=762 on a 667pt screen — a stale pre-settle frame; every settled checkpoint
// on that device reads 589). Spanning [762, 667] would be a negative-area rect that fails
// validateBundle and aborts the WHOLE profile. We instead take the bottom as max(viewport bottom,
// CTA bottom) so the bar always covers the CTA and is never inverted. Rule 2 still flags any
// in-viewport content that runs behind footer.top, so genuine footer clips are not hidden.
export function deriveFooter(nodes, viewport) {
  const explicit = nodes.find((n) => n.meta?.footer);
  if (explicit) {
    const b = explicit.bbox;
    const rect = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    return finiteRect(rect) ? rect : null;
  }
  const anchor = nodes.find((n) => n.meta?.footerAnchor);
  if (anchor && viewport) {
    const b = anchor.bbox;
    const rect = { left: 0, top: b.top, right: viewport.width, bottom: Math.max(viewport.height, b.bottom) };
    return finiteRect(rect) ? rect : null;
  }
  return null;
}

// Take the per-edge maximum of the declared profile safe area and the insets measured from the
// capture's system chrome (status bar / nav taskbar). The declared value is a floor; a real bar
// that is taller (e.g. the compact AVD's 45dp status bar / 48dp gesture taskbar vs the profile's
// 24dp) widens the unsafe band so rules 2/5 judge against the true usable viewport.
export function mergeSafeArea(declared, measured) {
  const base = declared || { top: 0, bottom: 0, left: 0, right: 0 };
  if (!measured) return base;
  const pick = (k) => Math.max(Number(base[k]) || 0, Number(measured[k]) || 0);
  return { top: pick('top'), bottom: pick('bottom'), left: pick('left'), right: pick('right') };
}

/** True when the config lists this checkpoint under its flow's `scrollEnd`: the flow has scrolled
 * to the end there, so anything still cut off or hidden at the bottom cannot be scrolled clear. */
export function isScrollEndCheckpoint(config, flowId, checkpoint) {
  const flow = (config?.flows || []).find((f) => f.id === flowId);
  const list = flow?.scrollEnd;
  if (list === undefined) return false;
  if (!Array.isArray(list) || list.some((c) => typeof c !== 'string' || !flow.checkpoints.includes(c))) {
    throw new Error(`device-layout config: flow "${flowId}" scrollEnd must list checkpoints of that flow`);
  }
  return list.includes(checkpoint);
}

export function contextForCheckpoint(profile, checkpoint, nodes, overrides = {}) {
  const [w, h] = profile.logicalSize;
  // The emulator/simulator may not be exactly the profile's nominal size; prefer a measured
  // viewport (in logical units) when the orchestrator supplies one (Android `wm size`/`wm density`).
  const viewport = overrides.viewport || { width: w, height: h };
  const ctx = {
    platform: profile.platform,
    viewport,
    safeArea: mergeSafeArea(profile.safeArea, overrides.measuredSafeArea),
    fontScale: checkpoint.fontScale ?? profile.fontScale ?? 1.0,
  };
  const footer = deriveFooter(nodes, ctx.viewport);
  if (footer) ctx.footer = footer;
  // Allow the orchestrator to supply a measured context override (e.g. a known modalOrigin).
  if (checkpoint.context && typeof checkpoint.context === 'object') Object.assign(ctx, checkpoint.context);
  return ctx;
}

// Resolve the capture manifest (accepts a directory or a manifest file path).
export function loadCaptureManifest(input) {
  let manifestPath = input;
  let dir = input;
  if (existsSync(input) && statSync(input).isDirectory()) {
    manifestPath = join(input, 'capture-manifest.json');
    dir = input;
  } else {
    dir = dirname(input);
  }
  if (!existsSync(manifestPath)) {
    throw new Error(`capture manifest not found: ${manifestPath} — did the Maestro capture run produce it?`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return { manifest, dir };
}

export function buildBundle({ manifest, dir }, { platform, profileId, config, sourceSha, configSha256 = null, now = new Date() }) {
  const profile = profileById(config, profileId || manifest.profile);
  if (platform && profile.platform !== platform) {
    throw new Error(`profile "${profile.id}" is ${profile.platform}, but --platform ${platform} was requested`);
  }
  // Candidate SHA: an explicit --source-sha (checked-out HEAD) wins over the captured manifest's,
  // so the bundle is always bound to the SHA the orchestrator is gating.
  const resolvedSourceSha = sourceSha || manifest.sourceSha || null;
  // Prefer a measured device density (Android `wm density`/160); else the profile's nominal density.
  const density = manifest.density != null ? manifest.density : densityFor(profile);
  const viewportOverride = manifest.viewport && typeof manifest.viewport === 'object' ? manifest.viewport : null;
  const checkpoints = [];
  for (const cp of manifest.checkpoints || []) {
    const hierPath = resolve(dir, cp.hierarchy);
    if (!existsSync(hierPath)) {
      throw new Error(`checkpoint "${cp.checkpoint}" references missing hierarchy file ${cp.hierarchy}`);
    }
    const rawRoot = JSON.parse(readFileSync(hierPath, 'utf8'));
    const resourceMeta = buildResourceMeta(rawRoot);
    // The logical viewport lets the normalizer separate the app window from OS status/nav chrome.
    const vp = viewportOverride || { width: profile.logicalSize[0], height: profile.logicalSize[1] };
    const { nodes, safeArea: measuredSafeArea, keyboardInset } = normalizeMaestroCapture(rawRoot, {
      density,
      resourceMeta,
      scrollState: cp.scrollState ?? null,
      viewport: vp,
    });
    // Fail CLOSED on a crossed-leg capture: a hierarchy dumped from the wrong simulator is a hard
    // harness error (named profile + root + expected), never a bogus product finding (AUG-1376 r7).
    const mismatch = windowViewportMismatch(nodes, profile);
    if (mismatch) {
      throw new Error(`device-layout harness error: checkpoint "${cp.flow || manifest.flow}/${cp.checkpoint}" ` +
        `${mismatch} — hierarchy dump not tied to the profile's simulator (crossed iOS leg / wrong-sim capture). ` +
        `Fix the capture, do not score this tree.`);
    }
    const context = contextForCheckpoint(profile, cp, nodes, { viewport: viewportOverride, measuredSafeArea });
    if (platform === 'ios') context.measuredKeyboardInset = keyboardInset;
    // Scroll-to-end checkpoints come from the config, per flow (`scrollEnd`). Set last, so neither the
    // capture manifest nor a checkpoint's own context can claim or deny it (AUG-1601, rule 2).
    context.scrollEnd = isScrollEndCheckpoint(config, cp.flow || manifest.flow, cp.checkpoint);
    // Bind the checkpoint to its screenshot by sha256 (the vision-candidate job rejects a stale or
    // swapped artifact). The path stays relative to the bundle dir so the reviewer resolves it.
    let screenshot = cp.screenshot || null;
    let screenshotSha256 = null;
    if (screenshot) {
      const shotPath = resolve(dir, screenshot);
      if (existsSync(shotPath)) screenshotSha256 = createHash('sha256').update(readFileSync(shotPath)).digest('hex');
      else screenshot = null; // never reference a screenshot that is not on disk
    }
    checkpoints.push({
      flow: cp.flow || manifest.flow,
      checkpoint: cp.checkpoint,
      screen: cp.screen || cp.checkpoint,
      deviceId: profile.id,
      state: cp.state || 'default',
      platform: profile.platform,
      screenshot,
      screenshotSha256,
      context,
      nodes,
    });
  }
  return {
    schema: 'device-layout/v1',
    product: config.product,
    sourceSha: resolvedSourceSha,
    buildHash: manifest.buildHash || null,
    device: profile.name,
    profile: profile.id,
    platform: profile.platform,
    fontScale: manifest.fontScale ?? profile.fontScale ?? 1.0,
    // Binds this evidence to the exact gate config (run-geometry validateBundle, AUG-1392).
    configSha256,
    generatedAt: now.toISOString(),
    checkpoints,
  };
}

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help')) {
    console.error('usage: node bundle-from-maestro.mjs <captureDir|capture-manifest.json> --platform <ios|android> --profile <id> --source-sha <sha> --out <bundle.json>');
    process.exit(2);
  }
  const input = args[0];
  const platform = flag(args, '--platform');
  const profileId = flag(args, '--profile');
  const sourceSha = flag(args, '--source-sha');
  const outPath = flag(args, '--out');
  const configText = readFileSync(CONFIG_PATH, 'utf8');
  const config = JSON.parse(configText);
  const configSha256 = createHash('sha256').update(configText).digest('hex');
  const cap = loadCaptureManifest(input);
  const bundle = buildBundle(cap, { platform, profileId, sourceSha, config, configSha256 });
  if (bundle.checkpoints.length === 0) {
    console.error('FAIL: capture produced no checkpoints (missing flow evidence)');
    process.exit(1);
  }
  const json = JSON.stringify(bundle, null, 2);
  if (outPath) writeFileSync(outPath, json);
  else process.stdout.write(json + '\n');
  if (args.includes('--require-ios-wizard')) {
    const buildHash = flag(args, '--expect-build');
    if (cap.manifest.sourceSha !== sourceSha || cap.manifest.profile !== profileId || cap.manifest.platform !== 'ios')
      throw new Error('iOS wizard capture: manifest does not match capture source/profile/platform');
    verifyIOSWizard(bundle, { sourceSha, profileId, buildHash });
  }
  console.error(`bundle: ${bundle.checkpoints.length} checkpoint(s) from ${bundle.profile} (${bundle.platform})`);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main();
