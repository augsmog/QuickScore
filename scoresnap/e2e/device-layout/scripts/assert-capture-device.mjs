#!/usr/bin/env node
// AUG-1376 (round 7) — verify ONE raw `maestro hierarchy` dump belongs to the expected profile's
// simulator, at CAPTURE time, so a crossed-leg dump can be re-taken while the simulator is still up.
//
// On the Mac mini the two iOS legs boot concurrently and Maestro's shared iOS driver can return the
// OTHER booted simulator's hierarchy for a checkpoint (iphone-16-pro 402x874 vs iphone-se-3 375x667
// crossed at 433f1f8a). run-ios-sim.sh calls this after each `maestro hierarchy`; a non-zero exit 3
// means "wrong device — re-dump". Any other failure (missing file, parse error) exits 2 and is
// treated by the caller as inconclusive (does not force a re-dump loop), so a genuine capture issue
// still surfaces through the downstream hard assertion in bundle-from-maestro.mjs.
//
// Usage: node scripts/assert-capture-device.mjs <hierarchy.json> --profile <id>
//   exit 0 = window matches the profile viewport
//   exit 3 = cross-device mismatch (re-dump)
//   exit 2 = could not evaluate (inconclusive)

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeMaestroCapture } from '../lib/normalize-maestro.mjs';
import { profileById, densityFor, windowViewportMismatch } from './bundle-from-maestro.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dir, '../config/device-layout.config.json');

function flag(args, name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : null;
}

function main() {
  const args = process.argv.slice(2);
  const file = args[0];
  const profileId = flag(args, '--profile');
  if (!file || !profileId) {
    console.error('usage: assert-capture-device.mjs <hierarchy.json> --profile <id>');
    process.exit(2);
  }
  let profile;
  let raw;
  try {
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    profile = profileById(config, profileId);
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`inconclusive: ${e.message}`);
    process.exit(2);
  }
  let nodes;
  try {
    const [w, h] = profile.logicalSize;
    ({ nodes } = normalizeMaestroCapture(raw, { density: densityFor(profile), viewport: { width: w, height: h } }));
  } catch (e) {
    console.error(`inconclusive: normalize failed: ${e.message}`);
    process.exit(2);
  }
  const mismatch = windowViewportMismatch(nodes, profile);
  if (mismatch) {
    console.error(`cross-device hierarchy: ${mismatch}`);
    process.exit(3);
  }
  process.exit(0);
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) main();
