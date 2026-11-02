#!/usr/bin/env node
// Socket-free runtime check of the real Metro web PDF import graph, not browser/native acceptance.
// Usage: node e2e/pdf-web-import-smoke.cjs dist-web [output.pdf]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadPdfModule(source) {
  // Only the emitted terminal app-entry calls are removed; no module or dependency is stubbed.
  const boot = source.match(/(?:\n__r\(\d+\);)+\s*$/);
  if (!boot) throw new Error('Expected terminal Metro entry calls');
  const definitions = source.slice(0, boot.index);
  if (/^__r\(/m.test(definitions)) throw new Error('Unexpected nonterminal Metro entry call');
  const candidates = definitions.split('\n').filter(line => line.startsWith('__d(') &&
    line.includes('Unsupported scorecard font glyph') && line.includes('UnsupportedScorecardCharactersError') &&
    line.includes('buildScorecardPdf'));
  if (candidates.length !== 1) throw new Error('Expected exactly one semantic PDF module');
  const identity = candidates[0].match(/},(\d+),\[[^\n]*\]\);$/);
  if (!identity) throw new Error('Unrecognized PDF module registration');
  const context = { console, setTimeout, clearTimeout, setInterval, clearInterval, TextEncoder, TextDecoder,
    URL, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array, Float64Array,
    ArrayBuffer, DataView };
  vm.createContext(context);
  vm.runInContext(definitions, context, { filename: 'actual-exported-web-bundle.js', timeout: 10000 });
  if (typeof context.__r !== 'function') throw new Error('Metro runtime missing');
  const module = context.__r(Number(identity[1]));
  if (typeof module.buildScorecardPdf !== 'function' || typeof module.UnsupportedScorecardCharactersError !== 'function') {
    throw new Error('PDF module exports missing');
  }
  return module;
}

async function verifyExport(exportDir, outputPdf) {
  const directory = path.join(exportDir, '_expo/static/js/web');
  const entries = fs.readdirSync(directory).filter(name => /^entry-.*\.js$/.test(name));
  if (entries.length !== 1) throw new Error('Expected exactly one exported web entry');
  const module = loadPdfModule(fs.readFileSync(path.join(directory, entries[0]), 'utf8'));
  const font = new Uint8Array(fs.readFileSync(path.resolve(__dirname, '../assets/fonts/SourceSans3_400Regular.ttf')));
  const bytes = await module.buildScorecardPdf(['Synthetic PDF bootstrap check', 'José — Алексей — Δημήτρης'], font);
  if (!(bytes instanceof Uint8Array) || Buffer.from(bytes.subarray(0, 5)).toString() !== '%PDF-' ||
      !Buffer.from(bytes).subarray(-32).toString().includes('%%EOF')) throw new Error('Invalid PDF binary output');
  // Reopen actual exported-builder output separately; this is not a rendered-page acceptance claim.
  const { PDFDocument } = require('pdf-lib/cjs');
  const document = await PDFDocument.load(bytes);
  if (document.getPageCount() !== 1) throw new Error('Unexpected synthetic PDF page count');
  let rejected = false;
  try { await module.buildScorecardPdf(['東京 😀'], font); }
  catch (error) {
    if (!(error instanceof module.UnsupportedScorecardCharactersError)) throw error;
    rejected = true;
  }
  if (!rejected) throw new Error('Unsupported glyphs were not rejected by the exported builder');
  if (outputPdf) fs.writeFileSync(outputPdf, bytes);
  return { status: 'PASS', bytes: bytes.length, pages: document.getPageCount(), typedUnsupportedGlyphRejection: true,
    scope: 'Actual exported PDF module/builder; no browser, native share or recipient acceptance' };
}
module.exports = { loadPdfModule, verifyExport };
if (require.main === module) {
  if (!process.argv[2]) { console.error('Usage: node e2e/pdf-web-import-smoke.cjs dist-web [output.pdf]'); process.exitCode = 1; }
  else verifyExport(path.resolve(process.argv[2]), process.argv[3]).then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.stack); process.exitCode = 1; });
}
