import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_WEB_JOBS = ['build-standard', 'browser-flows', 'browser-matrix'];
export function assertWebGate(needs) {
  if (!needs || typeof needs !== 'object' || Array.isArray(needs)) throw new Error('Missing required job results');
  if (Object.keys(needs).sort().join(',') !== [...REQUIRED_WEB_JOBS].sort().join(',')) throw new Error('Required job inventory changed');
  for (const job of REQUIRED_WEB_JOBS) {
    if (needs[job]?.result !== 'success') throw new Error(`${job}: ${needs[job]?.result ?? 'missing'}`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertWebGate(JSON.parse(process.env.NEEDS_JSON ?? 'null'));
  console.log('All required Web smoke jobs passed');
}
