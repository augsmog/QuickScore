import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

// Deliberately conservative: count language belongs nowhere in this listing.
const number = String.raw`(?:\d[\d,.]*(?:\s*\+)?|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen)`;
const subject = String.raw`(?:games?|modes?|formats?|ways?\s+to\s+play)`;
const gap = String.raw`(?:[\s\p{P}\p{S}]|\b[\p{L}]+\b){0,35}`;
const count = new RegExp(String.raw`\b${number}\b${gap}\b${subject}\b|\b${subject}\b[\s:–—=()\-]*(?:(?:available|included|total|count|of)\s*[:=]?\s*)?\b${number}\b|\b\d[\d,.]*\s*\+`, 'iu');
const permanent = /life[\s-]*time|life\s+long|forever|permanent|perpetual|buy\s+(?:it\s+)?once|pay\s+(?:only\s+)?once|one[ -]time\s+(?:purchase|payment|fee)|non[ -]?consumable/iu;

export function checkCopy(value, path = '$') {
  const errors = [];
  if (typeof value === 'string') {
    const text = value.normalize('NFKC').replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ');
    if (count.test(text)) errors.push(`${path}: count wording is blocked`);
    if (permanent.test(text)) errors.push(`${path}: permanent-purchase wording is blocked`);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) errors.push(...checkCopy(child, `${path}.${key}`));
  }
  return errors;
}

if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  // Importing the guard has no CLI side effects.
} else if (process.argv.includes('--self-test')) {
  // Adversarial fixtures, never product copy.
  for (const bad of ['50+','50 games','games: 50','7 game modes','three formats','twenty ways to play','modes — 12','12 different golf games','50-plus games','５０ games','50 <b>games</b>','lifetime access','no lifetime option','buy once','pay once','one-time purchase','permanent unlock','non-consumable']) {
    assert.ok(checkCopy({nested: [bad]}).length, `Missed fixture: ${bad}`);
  }
  for (const good of ['a deep library of game modes','Free includes basic modes and 3 scans a month.','$24.99/yr','7-day trial','One trial per Apple ID across Pro and Tournament Director.']) {
    assert.equal(checkCopy(good).length, 0, `Rejected fixture: ${good}`);
  }
  console.log('PASS: adversarial copy guard fixtures');
} else {
  const file = process.argv[2] || fileURLToPath(new URL('../docs/appstore/1.0/listing.json', import.meta.url));
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const errors = checkCopy(data);
    for (const [key, limit] of Object.entries({name:30,subtitle:30,promotionalText:170,keywords:100,whatsNew:4000})) {
      if (typeof data[key] !== 'string' || [...data[key]].length > limit) errors.push(`${key}: missing or over field limit`);
    }
    if (!Array.isArray(data.description) || data.description.join('\n\n').length > 4000) errors.push('description: missing or over field limit');
    if (data.status !== 'copy pending Copy Chief') errors.push('status: review stamp required');
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
    else console.log('PASS: listing copy guard and field lengths');
  } catch (error) { console.error(`Copy check failed: ${error.message}`); process.exitCode = 1; }
}
