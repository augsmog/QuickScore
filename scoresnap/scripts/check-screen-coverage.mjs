#!/usr/bin/env node
// AUG-1373: release-bound route/state coverage gate for SnapScore screens.
//
// Every route file under scoresnap/app/** must be registered in
// e2e/screen-coverage/coverage-manifest.json, classified as a visual `screen`
// (covered or pending native visual acceptance) or as a non-visual
// layout/special/dev file with a stated reason. A screen added or removed
// without updating the manifest fails this gate, so native visual acceptance
// coverage can never silently regress ("missing coverage fails acceptance").
//
// This gate validates the manifest's completeness and internal consistency.
// It does NOT itself run a simulator; the native screenshot/assertion receipts
// that satisfy `covered` screens are produced by the native CI gate and
// reviewed independently (see the manifest's releaseGate.nativeReceiptTicket).
//
// Usage: node scripts/check-screen-coverage.mjs [--manifest <path>] [--app-dir <path>] [--json]
// Exit 0 = gate green; exit 1 = coverage gap/inconsistency; exit 2 = bad invocation.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_APP_ROOT = resolve(__dirname, '..'); // scoresnap/

const VALID_KINDS = new Set(['screen', 'layout', 'special', 'dev']);
const VALID_COVERAGE = new Set(['covered', 'pending']);

// .maestro lives at the repo root, one level above scoresnap/.
export const DEFAULT_APP_DIR = resolve(REPO_APP_ROOT, 'app');
export const DEFAULT_MANIFEST = resolve(REPO_APP_ROOT, 'e2e/screen-coverage/coverage-manifest.json');
export const DEFAULT_MAESTRO_CONFIG = resolve(REPO_APP_ROOT, '../.maestro/e2e.config.json');

function parseArgs(argv) {
  const opts = {
    manifest: DEFAULT_MANIFEST,
    appDir: DEFAULT_APP_DIR,
    maestroConfig: DEFAULT_MAESTRO_CONFIG,
    json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--manifest') opts.manifest = resolve(argv[++i]);
    else if (a === '--app-dir') opts.appDir = resolve(argv[++i]);
    else if (a === '--maestro-config') opts.maestroConfig = resolve(argv[++i]);
    else if (a === '--json') opts.json = true;
    else return { error: `unknown argument: ${a}` };
  }
  return { opts };
}

// Discover every route file under the Expo Router app directory.
function discoverRouteFiles(appDir, baseForRel) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (name.endsWith('.tsx')) out.push(relative(baseForRel, full));
    }
  };
  walk(appDir);
  return out;
}

export function loadFlowIds(maestroConfigPath) {
  if (!existsSync(maestroConfigPath)) return null; // treat as unknown, don't hard-fail flow refs
  try {
    const cfg = JSON.parse(readFileSync(maestroConfigPath, 'utf8'));
    return new Set((cfg.flows || []).map((f) => f.id));
  } catch {
    return null;
  }
}

export function validateCoverage({ manifest, routeFiles, flowIds, requiredDeviceIds }) {
  const errors = [];
  const warnings = [];

  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, errors: ['manifest is not an object'], warnings, summary: {} };
  }
  const screens = Array.isArray(manifest.screens) ? manifest.screens : null;
  if (!screens) {
    return { ok: false, errors: ['manifest.screens must be an array'], warnings, summary: {} };
  }

  const releaseDeviceIds = new Set(
    ((manifest.releaseGate && manifest.releaseGate.devices) || []).map((d) => d.id)
  );
  const assertionClasses = new Set(
    (manifest.releaseGate && manifest.releaseGate.assertionClasses) || []
  );
  for (const id of requiredDeviceIds) {
    if (!releaseDeviceIds.has(id)) {
      errors.push(`releaseGate.devices is missing required device id "${id}"`);
    }
  }

  const onDisk = new Set(routeFiles);
  const inManifest = new Set();
  const seen = new Set();

  for (const entry of screens) {
    const file = entry && entry.file;
    if (!file || typeof file !== 'string') {
      errors.push(`manifest entry missing string "file": ${JSON.stringify(entry)}`);
      continue;
    }
    if (seen.has(file)) errors.push(`duplicate manifest entry for file "${file}"`);
    seen.add(file);
    inManifest.add(file);

    if (!onDisk.has(file)) {
      errors.push(`stale manifest entry: "${file}" no longer exists under app/`);
      continue;
    }
    if (!VALID_KINDS.has(entry.kind)) {
      errors.push(`"${file}": kind must be one of ${[...VALID_KINDS].join('|')} (got ${JSON.stringify(entry.kind)})`);
      continue;
    }

    if (entry.kind !== 'screen') {
      // Non-visual files (layout/special/dev) must justify exemption.
      if (!entry.reason || typeof entry.reason !== 'string' || !entry.reason.trim()) {
        errors.push(`"${file}": ${entry.kind} entries must give a non-empty "reason"`);
      }
      continue;
    }

    // kind === 'screen'
    if (!entry.name || typeof entry.name !== 'string' || !entry.name.trim()) {
      errors.push(`"${file}": screen entries must give a non-empty "name"`);
    }
    if (!VALID_COVERAGE.has(entry.coverage)) {
      errors.push(`"${file}": coverage must be one of ${[...VALID_COVERAGE].join('|')} (got ${JSON.stringify(entry.coverage)})`);
      continue;
    }

    if (entry.coverage === 'pending') {
      if (!entry.trackedBy || !String(entry.trackedBy).trim()) {
        errors.push(`"${file}": pending screens must name a "trackedBy" ticket for native coverage`);
      }
      continue;
    }

    // coverage === 'covered': must have real native evidence wiring.
    const flows = Array.isArray(entry.flows) ? entry.flows : [];
    if (flows.length === 0) {
      errors.push(`"${file}": covered screens must list at least one maestro "flows" id`);
    } else if (flowIds) {
      for (const fid of flows) {
        if (!flowIds.has(fid)) {
          errors.push(`"${file}": flow id "${fid}" is not defined in .maestro/e2e.config.json`);
        }
      }
    }
    const shots = Array.isArray(entry.screenshots) ? entry.screenshots : [];
    if (shots.length === 0) {
      errors.push(`"${file}": covered screens must list at least one "screenshots" id`);
    }
    const devices = Array.isArray(entry.devices) ? entry.devices : [];
    for (const id of requiredDeviceIds) {
      if (!devices.includes(id)) {
        errors.push(`"${file}": covered screens must capture required device "${id}"`);
      }
    }
    const asserts = Array.isArray(entry.assertions) ? entry.assertions : [];
    if (asserts.length === 0) {
      errors.push(`"${file}": covered screens must list at least one "assertions" class`);
    }
    for (const a of asserts) {
      if (assertionClasses.size && !assertionClasses.has(a)) {
        errors.push(`"${file}": assertion class "${a}" is not declared in releaseGate.assertionClasses`);
      }
    }
  }

  // Every route file on disk must be registered.
  for (const file of onDisk) {
    if (!inManifest.has(file)) {
      errors.push(`unregistered route file "${file}" — add it to coverage-manifest.json (screen or layout/special/dev with a reason)`);
    }
  }

  const summary = { total: onDisk.size, covered: 0, pending: 0, exempt: 0 };
  const pendingScreens = [];
  for (const entry of screens) {
    if (!entry || !onDisk.has(entry.file)) continue;
    if (entry.kind === 'screen') {
      if (entry.coverage === 'covered') summary.covered++;
      else if (entry.coverage === 'pending') {
        summary.pending++;
        pendingScreens.push(entry.file);
      }
    } else summary.exempt++;
  }

  return { ok: errors.length === 0, errors, warnings, summary, pendingScreens };
}

function main() {
  const { opts, error } = parseArgs(process.argv.slice(2));
  if (error) {
    console.error(`check-screen-coverage: ${error}`);
    process.exit(2);
  }
  if (!existsSync(opts.manifest)) {
    console.error(`check-screen-coverage: manifest not found: ${opts.manifest}`);
    process.exit(2);
  }
  if (!existsSync(opts.appDir)) {
    console.error(`check-screen-coverage: app dir not found: ${opts.appDir}`);
    process.exit(2);
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(opts.manifest, 'utf8'));
  } catch (e) {
    console.error(`check-screen-coverage: manifest is not valid JSON: ${e.message}`);
    process.exit(2);
  }

  const baseForRel = resolve(opts.appDir, '..'); // scoresnap/, so files read as app/...
  const routeFiles = discoverRouteFiles(opts.appDir, baseForRel);
  const flowIds = loadFlowIds(opts.maestroConfig);
  const requiredDeviceIds = (
    (manifest.releaseGate && manifest.releaseGate.requiredDeviceIds) || ['iphone-15-pro', 'iphone-16-pro']
  );

  const result = validateCoverage({ manifest, routeFiles, flowIds, requiredDeviceIds });

  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const s = result.summary;
    console.log(`SnapScore screen coverage: ${s.total} route files — ${s.covered} covered, ${s.pending} pending native coverage, ${s.exempt} exempt (non-visual).`);
    if (result.pendingScreens && result.pendingScreens.length) {
      console.log('Pending native coverage (tracked, not yet captured):');
      for (const f of result.pendingScreens) console.log(`  - ${f}`);
    }
    if (result.errors.length) {
      console.error('\nCOVERAGE GATE FAILED:');
      for (const e of result.errors) console.error(`  ✗ ${e}`);
    } else {
      console.log('\nCoverage gate GREEN: every route file is registered and consistent.');
    }
  }
  process.exit(result.ok ? 0 : 1);
}

// Only run main() when invoked directly, not when imported by tests.
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
