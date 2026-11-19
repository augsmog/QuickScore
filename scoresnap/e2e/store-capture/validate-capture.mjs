// Static validation of the eight-frame x two-target store capture config + output manifest (AUG-1279). No device, network or ASC access.
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = { 'iphone-6.9': [1320, 2868], 'ipad-13': [2064, 2752] };
const here = p => new URL(p, import.meta.url);
export const loadConfig = () => JSON.parse(readFileSync(here('./capture-config.json'), 'utf8'));
export const loadListing = () => readFileSync(here('../../docs/APP_STORE_LISTING.md'), 'utf8');

// Each frame id must bind to a real testID already shipping in the screen it captures -- this is
// what makes the sequence "wired" to the app instead of an arbitrary list of strings. Renaming a
// frame id (e.g. to "unrelated-screen-1") drops it out of this registry and fails validateConfig;
// verifyScreenAnchorsExist additionally greps the live source file to catch the registry itself
// drifting from the real screen (anchor renamed/removed in the app without updating this map).
export const SCREEN_ANCHORS = {
  'setup-round': { testID: 'contest-step-setup', file: '../../app/contest/new.tsx' },
  'add-group': { testID: 'add-group', file: '../../app/contest/new.tsx' },
  'game-modes': { testID: 'contest-step-gamemodes', file: '../../app/contest/new.tsx' },
  'score-hole': { testID: 'score-prev-hole', file: '../../app/contest/[id]/index.tsx' },
  'leaderboard': { testID: 'leaderboard-round-columns', file: '../../src/components/LeaderboardResultsList.tsx' },
  'side-games': { testID: 'settlement-skins-mode', file: '../../app/contest/[id]/settlement.tsx' },
  'settle-up': { testID: 'settlement-session-total', file: '../../app/contest/[id]/settlement.tsx' },
  'scan-card': { testID: 'parse-scorecard-button', file: '../../app/scan/index.tsx' },
};

export function verifyScreenAnchorsExist(anchors = SCREEN_ANCHORS) {
  const errs = [];
  for (const [id, a] of Object.entries(anchors)) {
    let src;
    try { src = readFileSync(here(a.file), 'utf8'); } catch { errs.push(`${id}: anchor file ${a.file} not found`); continue; }
    if (!src.includes(`"${a.testID}"`) && !src.includes(`'${a.testID}'`) && !src.includes(`\`${a.testID}\``))
      errs.push(`${id}: testID "${a.testID}" not found in ${a.file}`);
  }
  return errs;
}

export function listingFrames(md) {
  const sec = md.split(/^## Screenshot order and captions$/m)[1]?.split(/^## /m)[0] ?? '';
  return [...sec.matchAll(/^(\d+)\. (.+?) \/ /gm)].map(m => ({ n: +m[1], caption: m[2] }));
}

// Baseline the manifest contract must meet no matter what the config declares, so emptying
// capture-config.json's requiredProvenance/requiredEntryFields can't weaken acceptance.
export const MIN_REQUIRED_PROVENANCE = ['buildId', 'sourceSha', 'configSha256', 'simulatorRuntime', 'capturedAt'];
export const MIN_REQUIRED_ENTRY_FIELDS = ['target', 'frame', 'file', 'width', 'height', 'sha256'];

export function validateConfig(c, listingMd = loadListing()) {
  const errs = [];
  if (c?.schema !== 'snapscore-store-capture/1') errs.push('schema');
  const ex = c?.execution ?? {};
  for (const k of ['deviceExecution', 'newBuild', 'ascUpload', 'assetGeneration', 'copyChanges'])
    if (ex[k] !== false) errs.push(`execution.${k} must be false`);
  if (ex.target !== 'existing-accepted-release-mapped-simulator-app') errs.push('target must be accepted-release-mapped simulator app');
  if (c?.overlays?.provider !== 'DotBot' || c?.overlays?.mode !== 'reuse-staged-unchanged') errs.push('overlays must reuse staged DotBot unchanged');
  const ts = c?.targets ?? [];
  if (ts.length !== 2) errs.push('exactly two targets');
  for (const [id, [w, h]] of Object.entries(TARGETS)) {
    const t = ts.find(x => x.id === id);
    if (!t) errs.push(`target ${id} missing`);
    else if (t.width !== w || t.height !== h) errs.push(`target ${id} dimensions must be ${w}x${h}`);
  }
  const fs = c?.frames ?? [];
  if (fs.length !== 8) errs.push('exactly eight frames');
  if (!fs.every((f, i) => f.n === i + 1)) errs.push('frames must be numbered 1..8 in order');
  if (new Set(fs.map(f => f.id)).size !== fs.length) errs.push('frame ids unique');
  fs.forEach(f => { if (!SCREEN_ANCHORS[f.id]) errs.push(`frame ${f.n} id "${f.id}" is not a known screen anchor`); });
  const approved = listingFrames(listingMd);
  if (approved.length !== 8) errs.push('listing must define eight frames');
  fs.forEach((f, i) => { if (approved[i] && approved[i].caption !== f.caption) errs.push(`frame ${f.n} caption differs from approved listing`); });
  const reqProv = c?.manifest?.requiredProvenance ?? [];
  for (const k of MIN_REQUIRED_PROVENANCE) if (!reqProv.includes(k)) errs.push(`manifest.requiredProvenance must include ${k}`);
  const reqEntry = c?.manifest?.requiredEntryFields ?? [];
  for (const k of MIN_REQUIRED_ENTRY_FIELDS) if (!reqEntry.includes(k)) errs.push(`manifest.requiredEntryFields must include ${k}`);
  return errs;
}

export function validateManifest(m, c = loadConfig()) {
  const errs = [];
  const reqProv = new Set([...MIN_REQUIRED_PROVENANCE, ...(c.manifest.requiredProvenance ?? [])]);
  for (const k of reqProv) if (!m?.provenance?.[k]) errs.push(`provenance.${k} missing`);
  if (m?.provenance?.sourceSha && !/^[a-f0-9]{40}$/.test(m.provenance.sourceSha)) errs.push('provenance.sourceSha invalid');
  if (m?.provenance?.configSha256 && !/^[a-f0-9]{64}$/.test(m.provenance.configSha256)) errs.push('provenance.configSha256 invalid');
  if (m?.provenance?.simulatorRuntime && !/^iOS \d+(\.\d+)?$/.test(m.provenance.simulatorRuntime)) errs.push('provenance.simulatorRuntime invalid');
  if (m?.provenance?.capturedAt && Number.isNaN(Date.parse(m.provenance.capturedAt))) errs.push('provenance.capturedAt invalid');
  const configBytes = (() => { try { return readFileSync(here('./capture-config.json')); } catch { return null; } })();
  if (configBytes && m?.provenance?.configSha256) {
    const actual = createHash('sha256').update(configBytes).digest('hex');
    if (actual !== m.provenance.configSha256) errs.push('provenance.configSha256 does not match capture-config.json on disk');
  }
  const reqEntry = new Set([...MIN_REQUIRED_ENTRY_FIELDS, ...(c.manifest.requiredEntryFields ?? [])]);
  const es = m?.entries ?? [];
  if (es.length !== c.targets.length * c.frames.length) errs.push(`expected ${c.targets.length * c.frames.length} entries`);
  const seen = new Set();
  for (const e of es) {
    for (const k of reqEntry) if (e[k] === undefined || e[k] === '') errs.push(`entry ${e.target}/${e.frame}: ${k} missing`);
    const t = c.targets.find(x => x.id === e.target);
    if (!t) { errs.push(`entry unknown target ${e.target}`); continue; }
    if (!c.frames.some(f => f.n === e.frame)) errs.push(`entry unknown frame ${e.frame}`);
    if (e.width !== t.width || e.height !== t.height) errs.push(`entry ${e.target}/${e.frame}: dimensions ${e.width}x${e.height}`);
    if (!/^[a-f0-9]{64}$/.test(e.sha256 ?? '')) errs.push(`entry ${e.target}/${e.frame}: sha256 invalid`);
    const key = `${e.target}/${e.frame}`;
    if (seen.has(key)) errs.push(`duplicate ${key}`);
    seen.add(key);
  }
  for (const t of c.targets) for (const f of c.frames) if (!seen.has(`${t.id}/${f.n}`)) errs.push(`missing ${t.id}/${f.n}`);
  return errs;
}

// Byte-level binding for the real output manifest the E2E harness produces once a captured frame
// actually exists on disk: every declared file must exist under baseDir and its sha256 must match
// what's on disk, not just look hash-shaped. No device/asset work happens here -- this only proves
// the check rejects a manifest claiming files that don't exist or don't match, same class of gap
// the checker named ("entries pointing to /nonexistent/identical.png with arbitrary hashes").
export function validateManifestFiles(m, baseDir) {
  const errs = [];
  for (const e of m?.entries ?? []) {
    const p = join(baseDir, e.file);
    if (!existsSync(p)) { errs.push(`entry ${e.target}/${e.frame}: file not found at ${p}`); continue; }
    const actual = createHash('sha256').update(readFileSync(p)).digest('hex');
    if (actual !== e.sha256) errs.push(`entry ${e.target}/${e.frame}: sha256 mismatch (declared ${e.sha256}, actual ${actual})`);
  }
  return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errs = [...validateConfig(loadConfig()), ...verifyScreenAnchorsExist()];
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log('store capture config valid');
}
