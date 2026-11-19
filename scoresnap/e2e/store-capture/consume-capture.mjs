// Capture-harness consumer (AUG-1301 / AUG-1279 round 2): reads a capture output dir, builds a manifest
// bound to the config hash + source SHA, and validates it. No device, network or ASC access.
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig, validateConfig, validateManifest } from './validate-capture.mjs';

export const sha256 = buf => createHash('sha256').update(buf).digest('hex');
export const configSha256 = () => sha256(readFileSync(new URL('./capture-config.json', import.meta.url)));

export function pngSize(buf) {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47 || buf.toString('ascii', 12, 16) !== 'IHDR') throw new Error('not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Expected file name: <targetId>-<n>.png (e.g. iphone-6.9-1.png)
export function buildManifest(dir, provenance, c = loadConfig()) {
  const entries = [];
  const problems = [];
  for (const t of c.targets) for (const f of c.frames) {
    const file = `${t.id}-${f.n}.png`;
    const p = join(dir, file);
    if (!existsSync(p)) { problems.push(`missing file ${file}`); continue; }
    try {
      const buf = readFileSync(p);
      entries.push({ target: t.id, frame: f.n, file, ...pngSize(buf), sha256: sha256(buf) });
    } catch (e) { problems.push(`${file}: ${e.message}`); }
  }
  const known = new Set(c.targets.flatMap(t => c.frames.map(f => `${t.id}-${f.n}.png`)));
  for (const f of readdirSync(dir)) if (f.endsWith('.png') && !known.has(f)) problems.push(`unexpected file ${f}`);
  return { manifest: { provenance, entries }, problems };
}

// Binds the manifest to the shipped config: provenance.configSha256 must equal the live config hash.
export function consume(dir, provenance, c = loadConfig()) {
  const errs = validateConfig(c);
  const { manifest, problems } = buildManifest(dir, { ...provenance, configSha256: configSha256() }, c);
  errs.push(...problems, ...validateManifest(manifest, c));
  return { manifest, errs };
}

export function verifyManifest(m, c = loadConfig()) {
  const errs = validateManifest(m, c);
  if (m?.provenance?.configSha256 !== configSha256()) errs.push('provenance.configSha256 does not match capture-config.json');
  return errs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, buildId, sourceSha, simulatorRuntime] = process.argv.slice(2);
  if (!dir || !buildId || !sourceSha || !simulatorRuntime) { console.error('usage: consume-capture.mjs <dir> <buildId> <sourceSha> <simulatorRuntime>'); process.exit(2); }
  const { manifest, errs } = consume(dir, { buildId, sourceSha, simulatorRuntime, capturedAt: new Date().toISOString() });
  if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
  writeFileSync(join(dir, loadConfig().manifest.outputFile), JSON.stringify(manifest, null, 2));
  console.log(`manifest written: ${manifest.entries.length} entries`);
}
