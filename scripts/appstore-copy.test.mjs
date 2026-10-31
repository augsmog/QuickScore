import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkCopy} from './check-appstore-copy.mjs';

const listing = JSON.parse(readFileSync(new URL('../docs/appstore/1.0/listing.json', import.meta.url), 'utf8'));
test('source passes and prohibited copy fails inside nested notes', () => {
  assert.deepEqual(checkCopy(listing), []);
  for (const claim of ['50+ games','three game modes','formats: 10','lifetime purchase','buy once']) {
    const errors = checkCopy({...listing, reviewNotes:{nested:[claim]}});
    assert.ok(errors.length);
    assert.match(errors.join('\n'), /\$\.reviewNotes\.nested\.0/);
  }
});
test('purchase rows preserve supplied plan prices and annual trials', () => {
  assert.deepEqual(listing.inAppPurchases.map(p=>[p.price,p.trial]), [
    ['$24.99/yr','7-day trial'],['$3.99/mo','No trial'],
    ['$79.99/yr','7-day trial'],['$12.99/mo','No trial'],
  ]);
  assert.match(listing.subscriptionTerms,/One trial per Apple ID across Pro and Tournament Director/);
  assert.equal(listing.free,'Free includes basic modes and 3 scans a month.');
});
