import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parseBounds, normalizeMaestroHierarchy } from './normalize-maestro.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));

test('parseBounds parses [l,t][r,b]', () => {
  assert.deepEqual(parseBounds('[0,0][393,852]'), { left: 0, top: 0, right: 393, bottom: 852 });
  assert.deepEqual(parseBounds('[-393,-852][786,1704]'), { left: -393, top: -852, right: 786, bottom: 1704 });
  assert.equal(parseBounds(''), null);
  assert.equal(parseBounds('garbage'), null);
});

test('normalizer flattens tree, scales Android px by density, infers roles', () => {
  const raw = {
    attributes: { bounds: '[0,0][720,1600]' },
    children: [
      { attributes: { bounds: '[0,0][720,120]', text: 'Multi-Day Tournament' }, children: [] },
      { attributes: { bounds: '[600,20][700,100]', 'resource-id': 'switch:multiDay', checked: 'true' }, children: [] },
    ],
  };
  // Android xhdpi density = 480/160 = 3 → logical 240x~.
  const nodes = normalizeMaestroHierarchy(raw, { density: 3 });
  assert.equal(nodes.length, 3);
  const sw = nodes.find((n) => n.id === 'switch:multiDay');
  assert.equal(sw.role, 'control');
  assert.deepEqual(sw.bbox, { left: 200, top: 20 / 3, right: 700 / 3, bottom: 100 / 3 });
  const label = nodes.find((n) => n.text === 'Multi-Day Tournament');
  assert.equal(label.role, 'text');
});

test('resourceMeta override supplies precise semantics', () => {
  const raw = { attributes: { bounds: '[0,0][100,44]', 'resource-id': 'btn:rounds-2', text: '2' }, children: [] };
  const nodes = normalizeMaestroHierarchy(raw, {
    resourceMeta: { 'btn:rounds-2': { role: 'control', meta: { sectionGrid: 0, tappable: true } } },
  });
  assert.equal(nodes[0].role, 'control');
  assert.equal(nodes[0].meta.sectionGrid, 0);
});

test('normalizer handles the real retained Maestro fixture without crashing', () => {
  const fx = resolve(__dir, '../../../../.maestro/fixtures/retained-20261114/aug637-safe-area-33ac8ba5-hierarchy.json');
  if (!existsSync(fx)) return; // fixture only present in full checkout
  const raw = JSON.parse(readFileSync(fx, 'utf8'));
  const nodes = normalizeMaestroHierarchy(raw, { density: 1 });
  assert.ok(nodes.length > 0);
  // Root is a container; at least one node carries parsed bounds.
  assert.ok(nodes.some((n) => n.bbox.right > 0));
  // The "SnapScore" accessibility label becomes a text/control node.
  assert.ok(nodes.some((n) => n.text === 'SnapScore'));
});
