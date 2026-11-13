#!/usr/bin/env node
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { validateReceipt } = require('./receipt-validation.cjs');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node check-receipt.mjs <report.md>...');
  process.exit(2);
}

let failed = false;
for (const file of files) {
  let content;
  try {
    content = fs.readFileSync(file, 'utf8');
  } catch {
    console.error(`${file}: missing or unreadable file`);
    failed = true;
    continue;
  }
  const problems = validateReceipt(content);
  if (problems.length) {
    console.error(`${file}: ${problems.join('; ')}`);
    failed = true;
  }
}
if (failed) process.exit(1);
for (const file of files) console.log(`Validated ${file}`);
