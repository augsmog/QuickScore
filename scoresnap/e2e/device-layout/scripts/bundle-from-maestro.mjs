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

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { normalizeMaestroHierarchy } from '../lib/normalize-maestro.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dir, '../config/device-layout.config.json');

// SnapScore resource-id → engine semantics. Keyed by the real testIDs in scoresnap/app
// (contest/new.tsx, (tabs)/index.tsx, paywall.tsx). `role`/`meta` ride through normalize-maestro
// into the geometry engine. We only assert what the app actually renders — unknown ids fall back
// to attribute-based role inference.
export const SNAPSCORE_META = {
  // New Contest — switches (rule 7 state legibility + rule 5 tap target)
  'tournament-toggle': { role: 'control', meta: { isSwitch: true, tappable: true, control: 'multi-day' } },
  'team-mode': { role: 'control', meta: { isSwitch: true, tappable: true, control: 'team-mode' } },
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

// Logical density for normalize-maestro: iOS Maestro bounds are already in points (1); Android
// bounds are in pixels → density = dpi / 160.
export function densityFor(profile) {
  if (profile.platform === 'android') return (profile.dpi || 160) / 160;
  return 1;
}

// Derive the sticky-footer rect from the capture. Prefer an explicit footer container
// (meta.footer); otherwise synthesize the bar from the primary CTA's top (meta.footerAnchor)
// spanning full width to the viewport bottom. Returns null when neither is present.
export function deriveFooter(nodes, viewport) {
  const explicit = nodes.find((n) => n.meta?.footer);
  if (explicit) {
    const b = explicit.bbox;
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  }
  const anchor = nodes.find((n) => n.meta?.footerAnchor);
  if (anchor && viewport) {
    return { left: 0, top: anchor.bbox.top, right: viewport.width, bottom: viewport.height };
  }
  return null;
}

export function contextForCheckpoint(profile, checkpoint, nodes, overrides = {}) {
  const [w, h] = profile.logicalSize;
  // The emulator/simulator may not be exactly the profile's nominal size; prefer a measured
  // viewport (in logical units) when the orchestrator supplies one (Android `wm size`/`wm density`).
  const viewport = overrides.viewport || { width: w, height: h };
  const ctx = {
    platform: profile.platform,
    viewport,
    safeArea: profile.safeArea || null,
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

export function buildBundle({ manifest, dir }, { platform, profileId, config, now = new Date() }) {
  const profile = profileById(config, profileId || manifest.profile);
  if (platform && profile.platform !== platform) {
    throw new Error(`profile "${profile.id}" is ${profile.platform}, but --platform ${platform} was requested`);
  }
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
    const nodes = normalizeMaestroHierarchy(rawRoot, {
      density,
      resourceMeta,
      scrollState: cp.scrollState ?? null,
    });
    const context = contextForCheckpoint(profile, cp, nodes, { viewport: viewportOverride });
    checkpoints.push({
      flow: cp.flow || manifest.flow,
      checkpoint: cp.checkpoint,
      screen: cp.screen || cp.checkpoint,
      deviceId: profile.id,
      state: cp.state || 'default',
      platform: profile.platform,
      screenshot: cp.screenshot || null,
      context,
      nodes,
    });
  }
  return {
    schema: 'device-layout/v1',
    product: config.product,
    sourceSha: manifest.sourceSha || null,
    buildHash: manifest.buildHash || null,
    device: profile.name,
    profile: profile.id,
    platform: profile.platform,
    fontScale: manifest.fontScale ?? profile.fontScale ?? 1.0,
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
    console.error('usage: node bundle-from-maestro.mjs <captureDir|capture-manifest.json> --platform <ios|android> --profile <id> --out <bundle.json>');
    process.exit(2);
  }
  const input = args[0];
  const platform = flag(args, '--platform');
  const profileId = flag(args, '--profile');
  const outPath = flag(args, '--out');
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  const cap = loadCaptureManifest(input);
  const bundle = buildBundle(cap, { platform, profileId, config });
  if (bundle.checkpoints.length === 0) {
    console.error('FAIL: capture produced no checkpoints (missing flow evidence)');
    process.exit(1);
  }
  const json = JSON.stringify(bundle, null, 2);
  if (outPath) writeFileSync(outPath, json);
  else process.stdout.write(json + '\n');
  console.error(`bundle: ${bundle.checkpoints.length} checkpoint(s) from ${bundle.profile} (${bundle.platform})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
