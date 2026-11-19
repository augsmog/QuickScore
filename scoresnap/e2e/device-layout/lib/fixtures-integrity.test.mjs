import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const NEG_DIR = resolve(__dir, '../fixtures/negative');
const manifest = JSON.parse(readFileSync(join(NEG_DIR, 'fixtures.json'), 'utf8'));

// The owner negative fixtures are immutable: their committed sha256 must match the bytes,
// so the gate always exercises exactly the owner-reported broken screens.
test('negative fixtures match their committed sha256 (immutability)', () => {
  for (const fx of manifest.fixtures) {
    const bytes = readFileSync(join(NEG_DIR, fx.file));
    const sha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha, fx.sha256, `${fx.file} sha256 drift`);
  }
});

test('each negative fixture requires the run-1 misses: rule 2 (own group) and the rule-4/6 alignment family', () => {
  for (const fx of manifest.fixtures) {
    const groups = fx.requiredRuleGroups;
    assert.ok(Array.isArray(groups) && groups.length >= 1, `${fx.file} needs requiredRuleGroups`);
    // Rule 2 (footer clipping) must be its own required group on every fixture.
    assert.ok(groups.some((g) => g.length === 1 && g[0] === 2), `${fx.file} must require rule 2 (footer clipping) as its own group`);
    // The alignment family (rule 4 and/or 6, incl. HCP/badge imbalance) must be required.
    assert.ok(groups.some((g) => g.includes(4) || g.includes(6)), `${fx.file} must require the rule-4/6 alignment family`);
  }
});
