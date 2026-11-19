#!/usr/bin/env node
// AUG-1376 — assemble a capture-manifest.json from a capture directory.
//
// The native orchestrators drop, per checkpoint, two sibling files in the capture dir:
//   <order>-<flow>-<slug>.hierarchy.json   (raw `maestro hierarchy` dump)
//   <order>-<flow>-<slug>.ctx.json         ({ flow, checkpoint, screen, state, fontScale? })
// This scans the ctx sidecars in sorted (checkpoint order) and writes capture-manifest.json that
// bundle-from-maestro.mjs consumes. Keeping the bash orchestrator out of JSON assembly makes the
// capture → bundle seam unit-testable (lib/make-capture-manifest.test.mjs).
//
// Usage:
//   node scripts/make-capture-manifest.mjs <captureDir> \
//     --profile <id> --platform <ios|android> --source-sha <sha> [--build-hash <h>] [--font-scale <n>]

import { readFileSync, writeFileSync, readdirSync, existsSync , realpathSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function assembleManifest(dir, opts = {}) {
  const ctxFiles = readdirSync(dir)
    .filter((f) => f.endsWith('.ctx.json'))
    .sort(); // numeric <order> prefix keeps checkpoint order
  const checkpoints = [];
  for (const cf of ctxFiles) {
    const ctx = JSON.parse(readFileSync(join(dir, cf), 'utf8'));
    const base = cf.replace(/\.ctx\.json$/, '');
    const hierarchy = `${base}.hierarchy.json`;
    if (!existsSync(join(dir, hierarchy))) {
      throw new Error(`capture ctx ${cf} has no sibling hierarchy ${hierarchy}`);
    }
    checkpoints.push({
      flow: ctx.flow,
      checkpoint: ctx.checkpoint,
      screen: ctx.screen || ctx.checkpoint,
      state: ctx.state || 'default',
      ...(ctx.fontScale != null ? { fontScale: ctx.fontScale } : {}),
      hierarchy,
      screenshot: existsSync(join(dir, `${base}.png`)) ? `${base}.png` : null,
    });
  }
  return {
    schema: 'device-layout-capture/v1',
    profile: opts.profile || null,
    platform: opts.platform || null,
    sourceSha: opts.sourceSha || null,
    buildHash: opts.buildHash || null,
    ...(opts.density != null ? { density: opts.density } : {}),
    ...(opts.viewport ? { viewport: opts.viewport } : {}),
    ...(opts.fontScale != null ? { fontScale: opts.fontScale } : {}),
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
    console.error('usage: node make-capture-manifest.mjs <captureDir> --profile <id> --platform <ios|android> --source-sha <sha> [--build-hash <h>] [--font-scale <n>]');
    process.exit(2);
  }
  const dir = args[0];
  const fs = flag(args, '--font-scale');
  const dens = flag(args, '--density');
  const vw = flag(args, '--viewport-w');
  const vh = flag(args, '--viewport-h');
  const manifest = assembleManifest(dir, {
    profile: flag(args, '--profile'),
    platform: flag(args, '--platform'),
    sourceSha: flag(args, '--source-sha'),
    buildHash: flag(args, '--build-hash'),
    density: dens != null ? Number(dens) : undefined,
    viewport: vw != null && vh != null ? { width: Number(vw), height: Number(vh) } : undefined,
    fontScale: fs != null ? Number(fs) : undefined,
  });
  const out = join(dir, 'capture-manifest.json');
  writeFileSync(out, JSON.stringify(manifest, null, 2));
  console.error(`capture-manifest: ${manifest.checkpoints.length} checkpoint(s) → ${out}`);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main();
