#!/usr/bin/env node
// device-layout check --config <cfg.json> --snapshots <dir|file...> [--adapter snapshot|godot]
//                     [--waivers <w.json>] [--sha <sha>] [--out <receipt.json>]
// Exit 0 = PASS, 1 = FAIL (receipt still written), 2 = usage/config error.
import {readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {resolveConfig, validateConfig} from '../src/config.mjs';
import {runGate, summarize} from '../src/gate.mjs';
import {fromGodotDump} from '../adapters/godot.mjs';

const args = process.argv.slice(2);
const cmd = args.shift();
const opt = (name, multi = false) => {
  const vals = [];
  for (let i = 0; i < args.length; i++) if (args[i] === `--${name}`) {
    i++;
    while (i < args.length && !args[i].startsWith('--')) { vals.push(args[i]); i++; if (!multi) break; }
    i--;
  }
  return multi ? vals : vals[0];
};
const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const expand = paths => paths.flatMap(p => statSync(p).isDirectory() ? readdirSync(p).filter(f => f.endsWith('.json')).sort().map(f => join(p, f)) : [p]);

try {
  if (cmd === 'validate') {
    const {ok, errors} = validateConfig(readJson(opt('config')));
    console.log(ok ? 'config OK' : errors.join('\n'));
    process.exit(ok ? 0 : 2);
  }
  if (cmd !== 'check') throw new Error('usage: device-layout check|validate --config <file> ...');
  const config = readJson(opt('config'));
  const devices = new Map(resolveConfig(config).devices.map(d => [d.id, d]));
  const adapter = opt('adapter') ?? 'snapshot';
  const files = expand(opt('snapshots', true));
  const snapshots = files.map(f => {
    const doc = readJson(f);
    if (adapter === 'snapshot') return doc;
    if (adapter === 'godot') {
      const device = devices.get(doc.device);
      if (!device) throw new Error(`${f}: unknown device "${doc.device}"`);
      return fromGodotDump(doc, device);
    }
    throw new Error(`unknown adapter "${adapter}"`);
  });
  const waivers = opt('waivers') ? readJson(opt('waivers')) : undefined;
  const receipt = runGate({config, snapshots, waivers, sha: opt('sha') ?? null});
  if (opt('out')) writeFileSync(opt('out'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(summarize(receipt));
  process.exit(receipt.verdict === 'PASS' ? 0 : 1);
} catch (e) {
  console.error(`device-layout: ${e.message}`);
  process.exit(2);
}
