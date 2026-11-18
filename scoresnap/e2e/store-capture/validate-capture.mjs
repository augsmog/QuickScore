// Static validation of the eight-frame x two-target store capture config + output manifest (AUG-1279). No device, network or ASC access.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TARGETS = { 'iphone-6.9': [1320, 2868], 'ipad-13': [2064, 2752] };
const here = p => new URL(p, import.meta.url);
export const loadConfig = () => JSON.parse(readFileSync(here('./capture-config.json'), 'utf8'));
export const loadListing = () => readFileSync(here('../../docs/APP_STORE_LISTING.md'), 'utf8');

export function listingFrames(md) {
  const sec = md.split(/^## Screenshot order and captions$/m)[1]?.split(/^## /m)[0] ?? '';
  return [...sec.matchAll(/^(\d+)\. (.+?) \/ /gm)].map(m => ({ n: +m[1], caption: m[2] }));
}

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
  const approved = listingFrames(listingMd);
  if (approved.length !== 8) errs.push('listing must define eight frames');
  fs.forEach((f, i) => { if (approved[i] && approved[i].caption !== f.caption) errs.push(`frame ${f.n} caption differs from approved listing`); });
  return errs;
}

export function validateManifest(m, c = loadConfig()) {
  const errs = [];
  for (const k of c.manifest.requiredProvenance) if (!m?.provenance?.[k]) errs.push(`provenance.${k} missing`);
  if (m?.provenance?.sourceSha && !/^[a-f0-9]{40}$/.test(m.provenance.sourceSha)) errs.push('provenance.sourceSha invalid');
  if (m?.provenance?.configSha256 && !/^[a-f0-9]{64}$/.test(m.provenance.configSha256)) errs.push('provenance.configSha256 invalid');
  const es = m?.entries ?? [];
  if (es.length !== c.targets.length * c.frames.length) errs.push(`expected ${c.targets.length * c.frames.length} entries`);
  const seen = new Set();
  for (const e of es) {
    for (const k of c.manifest.requiredEntryFields) if (e[k] === undefined || e[k] === '') errs.push(`entry ${e.target}/${e.frame}: ${k} missing`);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errs = validateConfig(loadConfig());
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  console.log('store capture config valid');
}
