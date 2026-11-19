// AUG-1373: unit tests for the screen-coverage gate logic.
// Run: node --test scripts/check-screen-coverage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateCoverage } from './check-screen-coverage.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'check-screen-coverage.mjs');

const REQUIRED = ['iphone-15-pro', 'iphone-16-plus'];
const FLOWS = new Set(['aug-270-home-subhead', 'aug-271-paywall']);

function baseGate() {
  return {
    releaseGate: {
      requiredDeviceIds: REQUIRED,
      devices: [
        { id: 'iphone-15-pro', logicalSize: [393, 852] },
        { id: 'iphone-16-plus', logicalSize: [402, 874] },
      ],
      assertionClasses: ['target-size', 'collision', 'clipping', 'occlusion', 'reachability'],
    },
  };
}

function run(screens, routeFiles, opts = {}) {
  const manifest = { ...baseGate(), screens };
  if (opts.releaseGate) manifest.releaseGate = opts.releaseGate;
  return validateCoverage({
    manifest,
    routeFiles,
    flowIds: opts.flowIds === undefined ? FLOWS : opts.flowIds,
    requiredDeviceIds: REQUIRED,
  });
}

const coveredScreen = (file) => ({
  file,
  name: 'X',
  kind: 'screen',
  coverage: 'covered',
  flows: ['aug-270-home-subhead'],
  screenshots: ['x-01'],
  devices: ['iphone-15-pro', 'iphone-16-plus'],
  assertions: ['target-size', 'collision'],
});

test('clean manifest with matching files passes', () => {
  const screens = [
    { file: 'app/a.tsx', name: 'A', kind: 'screen', coverage: 'pending', trackedBy: 'AUG-1376' },
    { file: 'app/_layout.tsx', kind: 'layout', reason: 'layout' },
  ];
  const r = run(screens, ['app/a.tsx', 'app/_layout.tsx']);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.summary.total, 2);
  assert.equal(r.summary.pending, 1);
  assert.equal(r.summary.exempt, 1);
});

test('unregistered route file on disk fails', () => {
  const screens = [{ file: 'app/a.tsx', name: 'A', kind: 'screen', coverage: 'pending', trackedBy: 'AUG-1' }];
  const r = run(screens, ['app/a.tsx', 'app/new.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('unregistered route file "app/new.tsx"')));
});

test('stale manifest entry fails', () => {
  const screens = [{ file: 'app/gone.tsx', name: 'G', kind: 'screen', coverage: 'pending', trackedBy: 'AUG-1' }];
  const r = run(screens, []);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('stale manifest entry')));
});

test('invalid kind fails', () => {
  const screens = [{ file: 'app/a.tsx', kind: 'widget' }];
  const r = run(screens, ['app/a.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('kind must be one of')));
});

test('layout/dev entry without reason fails', () => {
  const r = run([{ file: 'app/_layout.tsx', kind: 'layout' }], ['app/_layout.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('must give a non-empty "reason"')));
});

test('pending screen without trackedBy fails', () => {
  const r = run([{ file: 'app/a.tsx', name: 'A', kind: 'screen', coverage: 'pending' }], ['app/a.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('must name a "trackedBy"')));
});

test('fully valid covered screen passes', () => {
  const r = run([coveredScreen('app/a.tsx')], ['app/a.tsx']);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.equal(r.summary.covered, 1);
});

test('covered screen missing flows fails', () => {
  const s = coveredScreen('app/a.tsx');
  s.flows = [];
  const r = run([s], ['app/a.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('at least one maestro "flows" id')));
});

test('covered screen with unknown flow id fails', () => {
  const s = coveredScreen('app/a.tsx');
  s.flows = ['does-not-exist'];
  const r = run([s], ['app/a.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('not defined in .maestro/e2e.config.json')));
});

test('covered screen missing a required device fails', () => {
  const s = coveredScreen('app/a.tsx');
  s.devices = ['iphone-15-pro'];
  const r = run([s], ['app/a.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('must capture required device "iphone-16-plus"')));
});

test('covered screen missing assertions fails', () => {
  const s = coveredScreen('app/a.tsx');
  s.assertions = [];
  const r = run([s], ['app/a.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('at least one "assertions" class')));
});

test('covered screen with undeclared assertion class fails', () => {
  const s = coveredScreen('app/a.tsx');
  s.assertions = ['made-up'];
  const r = run([s], ['app/a.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('not declared in releaseGate.assertionClasses')));
});

test('duplicate file entry fails', () => {
  const screens = [coveredScreen('app/a.tsx'), coveredScreen('app/a.tsx')];
  const r = run(screens, ['app/a.tsx']);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('duplicate manifest entry')));
});

test('missing required release device fails', () => {
  const gate = baseGate().releaseGate;
  gate.devices = [{ id: 'iphone-15-pro', logicalSize: [393, 852] }];
  const r = run([{ file: 'app/_layout.tsx', kind: 'layout', reason: 'x' }], ['app/_layout.tsx'], { releaseGate: gate });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('missing required device id "iphone-16-plus"')));
});

test('flow ids unknown (no maestro config) skips flow-ref check but still requires flows array', () => {
  const r = run([coveredScreen('app/a.tsx')], ['app/a.tsx'], { flowIds: null });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

// CLI regression: the default --maestro-config path must resolve to the real repo-root
// .maestro/e2e.config.json so a 'covered' claim with a bogus flow id is rejected, not
// silently skipped. (Caught by Codex astra verify of PR #333.)
test('CLI default maestro-config path validates flow ids against the real config', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cov-cli-'));
  try {
    mkdirSync(join(dir, 'app'));
    writeFileSync(join(dir, 'app', 'x.tsx'), '');
    const manifest = {
      releaseGate: {
        requiredDeviceIds: ['iphone-15-pro', 'iphone-16-plus'],
        devices: [{ id: 'iphone-15-pro' }, { id: 'iphone-16-plus' }],
        assertionClasses: ['target-size'],
      },
      screens: [
        {
          file: 'app/x.tsx', name: 'X', kind: 'screen', coverage: 'covered',
          flows: ['definitely-not-a-real-flow'], screenshots: ['x-01'],
          devices: ['iphone-15-pro', 'iphone-16-plus'], assertions: ['target-size'],
        },
      ],
    };
    const mPath = join(dir, 'm.json');
    writeFileSync(mPath, JSON.stringify(manifest));
    let exit = 0;
    let out = '';
    try {
      // No --maestro-config: forces use of the default (repo-root) path.
      out = execFileSync('node', [SCRIPT, '--manifest', mPath, '--app-dir', join(dir, 'app')],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      exit = e.status;
      out = `${e.stdout || ''}${e.stderr || ''}`;
    }
    assert.equal(exit, 1, `expected exit 1, got ${exit}:\n${out}`);
    assert.match(out, /not defined in \.maestro\/e2e\.config\.json/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
