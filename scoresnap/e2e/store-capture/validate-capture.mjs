// Static validation of the eight-frame store capture config + output manifest (AUG-1279). No device, network or ASC access.
// Launch is iPhone only (owner decision Nov 27 2026): the single target is iPhone 6.9"; an iPad target is rejected.
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import zlib from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = { 'iphone-6.9': [1320, 2868] };
const here = p => new URL(p, import.meta.url);
export const loadConfig = () => JSON.parse(readFileSync(here('./capture-config.json'), 'utf8'));
export const loadListing = () => readFileSync(here('../../docs/APP_STORE_LISTING.md'), 'utf8');

// Each frame id must bind to a real testID already shipping in the screen it captures -- this is
// what makes the sequence "wired" to the app instead of an arbitrary list of strings. Renaming a
// frame id (e.g. to "unrelated-screen-1") drops it out of this registry and fails validateConfig;
// verifyScreenAnchorsExist additionally greps the live source file to catch the registry itself
// drifting from the real screen (anchor renamed/removed in the app without updating this map).
// `caption` is the canonical caption for this id, independent of list position -- this is what
// catches two ids being swapped in capture-config.json while their captions stay in place (the
// positional listing check alone can't see that; see validateConfig's anchor-caption check below).
export const SCREEN_ANCHORS = {
  'setup-round': { testID: 'contest-step-setup', file: '../../app/contest/new.tsx', caption: 'Set up your round' },
  'add-group': { testID: 'add-group', file: '../../app/contest/new.tsx', caption: 'Add your group' },
  'game-modes': { testID: 'contest-step-gamemodes', file: '../../app/contest/new.tsx', caption: '50+ game modes' },
  'score-hole': { testID: 'score-prev-hole', file: '../../app/contest/[id]/index.tsx', caption: 'Score hole by hole' },
  'leaderboard': { testID: 'leaderboard-round-columns', file: '../../src/components/LeaderboardResultsList.tsx', caption: "See who's leading" },
  'side-games': { testID: 'settlement-skins-mode', file: '../../app/contest/[id]/settlement.tsx', caption: 'Your side games, tracked' },
  'settle-up': { testID: 'settlement-session-total', file: '../../app/contest/[id]/settlement.tsx', caption: 'See who owes what' },
  'scan-card': { testID: 'parse-scorecard-button', file: '../../app/scan/index.tsx', caption: 'Got a paper card?' },
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
  if (ts.length !== Object.keys(TARGETS).length) errs.push('exactly one target (iPhone 6.9")');
  for (const t of ts) if (t?.family !== 'iPhone') errs.push(`target ${t?.id} family must be iPhone (launch is iPhone only)`);
  for (const [id, [w, h]] of Object.entries(TARGETS)) {
    const t = ts.find(x => x.id === id);
    if (!t) errs.push(`target ${id} missing`);
    else if (t.width !== w || t.height !== h) errs.push(`target ${id} dimensions must be ${w}x${h}`);
  }
  const fs = c?.frames ?? [];
  if (fs.length !== 8) errs.push('exactly eight frames');
  if (!fs.every((f, i) => f.n === i + 1)) errs.push('frames must be numbered 1..8 in order');
  if (new Set(fs.map(f => f.id)).size !== fs.length) errs.push('frame ids unique');
  fs.forEach(f => {
    const anchor = SCREEN_ANCHORS[f.id];
    if (!anchor) { errs.push(`frame ${f.n} id "${f.id}" is not a known screen anchor`); return; }
    if (anchor.caption !== f.caption) errs.push(`frame ${f.n} caption "${f.caption}" does not match the canonical caption for id "${f.id}" ("${anchor.caption}")`);
  });
  const approved = listingFrames(listingMd);
  if (approved.length !== 8) errs.push('listing must define eight frames');
  fs.forEach((f, i) => { if (approved[i] && approved[i].caption !== f.caption) errs.push(`frame ${f.n} caption differs from approved listing`); });
  const reqProv = c?.manifest?.requiredProvenance ?? [];
  for (const k of MIN_REQUIRED_PROVENANCE) if (!reqProv.includes(k)) errs.push(`manifest.requiredProvenance must include ${k}`);
  const reqEntry = c?.manifest?.requiredEntryFields ?? [];
  for (const k of MIN_REQUIRED_ENTRY_FIELDS) if (!reqEntry.includes(k)) errs.push(`manifest.requiredEntryFields must include ${k}`);
  return errs;
}

// The record of which build/source this harness is currently accepted to capture against.
// Nobody has accepted a capture build yet (AUG-399: "no accepted capture build mapping is
// currently recorded"), so this file does not exist in the repo and loadAcceptedRelease()
// returns null -- validateManifest then fails closed instead of silently passing a manifest
// whose buildId/sourceSha only *look* right (format-valid but unbound, e.g. an invented buildId
// or an all-zero sourceSha, both of which are valid-looking 40-hex-char strings). Whoever accepts
// a capture build (the AUG-399 device-evidence owner) stages this file; this ticket only wires
// the binding and tests it with fixtures.
export const loadAcceptedRelease = () => {
  const p = here('./accepted-release.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
};

// An accepted-release record that is present but incomplete (e.g. `{}`, or missing the runtime
// the frames were actually captured under) is not a real binding -- it just looks truthy. Require
// all three fields so a half-staged record can't make runtime binding optional downstream.
export function validateAcceptedRelease(accepted) {
  if (!accepted) return ['no accepted-release record staged; provenance cannot be bound to a real accepted build'];
  const errs = [];
  if (!accepted.buildId) errs.push('accepted-release record missing buildId');
  if (!accepted.sourceSha || !/^[a-f0-9]{40}$/.test(accepted.sourceSha)) errs.push('accepted-release record missing or invalid sourceSha');
  if (!accepted.simulatorRuntime) errs.push('accepted-release record missing simulatorRuntime');
  return errs;
}

export function validateAcceptedReleaseBinding(m, accepted) {
  const baseErrs = validateAcceptedRelease(accepted);
  if (baseErrs.length) return baseErrs;
  const errs = [];
  if (m?.provenance?.buildId !== accepted.buildId) errs.push(`provenance.buildId does not match the accepted release build (${accepted.buildId})`);
  if (m?.provenance?.sourceSha !== accepted.sourceSha) errs.push(`provenance.sourceSha does not match the accepted release source (${accepted.sourceSha})`);
  if (m?.provenance?.simulatorRuntime !== accepted.simulatorRuntime) errs.push(`provenance.simulatorRuntime does not match the accepted release runtime (${accepted.simulatorRuntime})`);
  return errs;
}

// The record of where DotBot already staged each frame's overlay (path + sha256), so the harness
// can bind to the real staged files instead of just declaring provider/mode strings. DotBot's
// overlays are not staged in this repo yet (AUG-399: "use the already-prepared DotBot overlays
// as provided; do not create or rewrite creative assets" -- this ticket creates no creative
// asset), so this file does not exist and loadOverlayManifest() returns null. validateOverlayBinding
// then fails closed by name instead of silently passing an unstaged overlay set.
export const loadOverlayManifest = () => {
  const p = here('./overlays-manifest.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
};

export function validateOverlayBinding(c, overlayManifest, overlaysBaseDir) {
  if (c?.overlays?.provider !== 'DotBot' || c?.overlays?.mode !== 'reuse-staged-unchanged') return ['overlays must reuse staged DotBot unchanged'];
  if (!overlayManifest) return ['no overlay manifest staged; provider/mode cannot be bound to real staged paths/digests'];
  const errs = [];
  for (const f of c?.frames ?? []) {
    const entry = overlayManifest?.[f.id];
    if (!entry?.path || !entry?.sha256) { errs.push(`overlay for frame ${f.n} ("${f.id}") missing staged path/digest`); continue; }
    const p = join(overlaysBaseDir, entry.path);
    if (!existsSync(p)) { errs.push(`overlay for frame ${f.n} ("${f.id}"): staged file not found at ${p}`); continue; }
    const actual = createHash('sha256').update(readFileSync(p)).digest('hex');
    if (actual !== entry.sha256) errs.push(`overlay for frame ${f.n} ("${f.id}"): sha256 mismatch (declared ${entry.sha256}, actual ${actual})`);
  }
  return errs;
}

export function validateManifest(m, c = loadConfig(), accepted = loadAcceptedRelease()) {
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
  errs.push(...validateAcceptedReleaseBinding(m, accepted));
  const reqEntry = new Set([...MIN_REQUIRED_ENTRY_FIELDS, ...(c.manifest.requiredEntryFields ?? [])]);
  const es = m?.entries ?? [];
  if (es.length !== c.targets.length * c.frames.length) errs.push(`expected ${c.targets.length * c.frames.length} entries`);
  const seen = new Set();
  const seenContent = new Set();
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
    // Each frame captures a visually distinct screen -- identical bytes across different
    // frames means at least one of them is not a real, distinct per-frame capture.
    if (e.sha256) {
      if (seenContent.has(e.sha256)) errs.push(`entry ${e.target}/${e.frame}: identical file content (sha256) reused from another entry`);
      seenContent.add(e.sha256);
    }
  }
  for (const t of c.targets) for (const f of c.frames) if (!seen.has(`${t.id}/${f.n}`)) errs.push(`missing ${t.id}/${f.n}`);
  return errs;
}

// Capture PNGs support non-interlaced 8-bit RGB/RGBA only. Other modes fail closed
// rather than claiming dimensions without establishing that the pixels are decodable.
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_PNG_BYTES = 64 * 1024 * 1024;
const MAX_PIXEL_BYTES = 128 * 1024 * 1024;
const MAX_DIMENSION = 8192;
export function decodePngDimensions(buf) {
  if (buf.length < 8 || buf.length > MAX_PNG_BYTES || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let offset = 8;
  let ihdr = null;
  let stride = 0;
  let expectedBytes = 0;
  const idat = [];
  let dataEnded = false;
  let sawPalette = false;
  let chunks = 0;
  while (offset < buf.length) {
    if (++chunks > 4096 || offset + 12 > buf.length) return null;
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    if (!/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) return null;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (crcEnd > buf.length) return null;
    if (zlib.crc32(buf.subarray(offset + 4, dataEnd)) !== buf.readUInt32BE(dataEnd)) return null;
    if (!ihdr && type !== 'IHDR') return null;
    if (type === 'IHDR') {
      if (ihdr || length !== 13) return null;
      const width = buf.readUInt32BE(dataStart), height = buf.readUInt32BE(dataStart + 4);
      const depth = buf[dataStart + 8], color = buf[dataStart + 9];
      if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION) return null;
      if (depth !== 8 || ![2, 6].includes(color) || buf[dataStart + 10] !== 0 ||
          buf[dataStart + 11] !== 0 || buf[dataStart + 12] !== 0) return null;
      stride = width * (color === 6 ? 4 : 3) + 1;
      expectedBytes = stride * height;
      if (expectedBytes > MAX_PIXEL_BYTES) return null;
      ihdr = { width, height };
    } else if (type === 'PLTE') {
      if (sawPalette || idat.length || !length || length > 768 || length % 3 !== 0) return null;
      sawPalette = true;
    } else if (type === 'IDAT') {
      if (dataEnded) return null;
      idat.push(buf.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      if (!idat.length || length !== 0 || crcEnd !== buf.length) return null;
      try {
        const compressed = Buffer.concat(idat);
        // maxOutputLength bounds allocation even for a hostile compression bomb. info
        // exposes consumed input so extra streams/garbage cannot hide behind valid pixels.
        const decoded = zlib.inflateSync(compressed, { maxOutputLength: expectedBytes, info: true });
        if (decoded.engine.bytesWritten !== compressed.length || decoded.buffer.length !== expectedBytes) return null;
        // For RGB/RGBA every byte value is a valid sample. With complete row lengths
        // and filter types 0..4, inverse filtering is defined for every pixel byte.
        for (let row = 0; row < ihdr.height; row++) if (decoded.buffer[row * stride] > 4) return null;
        return ihdr;
      } catch { return null; }
    } else {
      if (type[0] === type[0].toUpperCase()) return null; // unknown critical chunk
      if (idat.length) dataEnded = true;
    }
    offset = crcEnd;
  }
  return null;
}

// Byte-level binding for the real output manifest the E2E harness produces once a captured frame
// actually exists on disk: every declared file must exist under baseDir, its sha256 must match
// what's on disk (not just look hash-shaped), and its decoded PNG dimensions must match the
// declared width/height. No device/asset work happens here -- this only proves the check rejects
// a manifest claiming files that don't exist, don't match, or aren't even images, same class of
// gap the checker named ("sixteen references to one unrelated text file with declared dimensions
// and a real hash of the text").
export function validateManifestFiles(m, baseDir) {
  const errs = [];
  for (const e of m?.entries ?? []) {
    const p = join(baseDir, e.file);
    if (!existsSync(p)) { errs.push(`entry ${e.target}/${e.frame}: file not found at ${p}`); continue; }
    // Refuse oversized files before loading bytes or hashing/inflating them.
    if (statSync(p).size > MAX_PNG_BYTES) { errs.push(`entry ${e.target}/${e.frame}: PNG exceeds byte limit`); continue; }
    const bytes = readFileSync(p);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== e.sha256) { errs.push(`entry ${e.target}/${e.frame}: sha256 mismatch (declared ${e.sha256}, actual ${actual})`); continue; }
    const dims = decodePngDimensions(bytes);
    if (!dims) { errs.push(`entry ${e.target}/${e.frame}: file at ${p} is not a PNG`); continue; }
    if (dims.width !== e.width || dims.height !== e.height) errs.push(`entry ${e.target}/${e.frame}: decoded PNG is ${dims.width}x${dims.height}, declared ${e.width}x${e.height}`);
  }
  return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const flag = name => { const i = args.indexOf(name); return i === -1 ? undefined : args[i + 1]; };
  const manifestPath = flag('--manifest');
  let errs = [...validateConfig(loadConfig()), ...verifyScreenAnchorsExist()];
  if (manifestPath) {
    const dir = flag('--dir') ?? '.';
    const overlaysDir = flag('--overlays-dir') ?? dir;
    const config = loadConfig();
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    errs = [
      ...errs,
      ...validateManifest(manifest, config),
      ...validateManifestFiles(manifest, dir),
      ...validateOverlayBinding(config, loadOverlayManifest(), overlaysDir),
    ];
  }
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log(manifestPath ? 'store capture config and manifest valid' : 'store capture config valid');
}
