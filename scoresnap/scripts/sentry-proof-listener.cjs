#!/usr/bin/env node
// Telemetry privacy proof (M6 "token privacy gate"). Runs on the Mac next to the simulator.
//
//   node scripts/sentry-proof-listener.cjs listen <folder> [port]     store everything Sentry sends
//   node scripts/sentry-proof-listener.cjs check  <folder> <secret>…  search what was stored
//
// It talks to nothing but this machine and writes only into <folder>.
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const SESSION_TOKEN = /eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}/g;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Every named secret (any letter case), any session token, any email address found in text. */
function scanText(text, secrets) {
  const findings = [];
  const lower = text.toLowerCase();
  for (const secret of secrets) if (secret && lower.includes(secret.toLowerCase())) findings.push({ kind: 'named secret', match: secret });
  for (const match of text.match(SESSION_TOKEN) ?? []) findings.push({ kind: 'session token', match: `${match.slice(0, 12)}…` });
  for (const match of text.match(EMAIL) ?? []) findings.push({ kind: 'email', match });
  return findings;
}

function decode(buffer, encoding) {
  try {
    if (encoding === 'gzip' || (buffer[0] === 0x1f && buffer[1] === 0x8b)) return zlib.gunzipSync(buffer);
    if (encoding === 'deflate') return zlib.inflateSync(buffer);
    if (encoding === 'br') return zlib.brotliDecompressSync(buffer);
  } catch { /* keep the raw bytes: a file that cannot be read is still evidence */ }
  return buffer;
}

function startListener({ dir, port = 9000 }) {
  fs.mkdirSync(dir, { recursive: true });
  let count = 0;
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        if (req.method === 'POST') {
          count += 1;
          const body = decode(Buffer.concat(chunks), req.headers['content-encoding']);
          const name = `${String(count).padStart(4, '0')}-${Date.now()}.txt`;
          fs.writeFileSync(path.join(dir, name), `${req.method} ${req.url}\n${JSON.stringify(req.headers)}\n\n${body.toString('utf8')}`);
          if (require.main === module) console.log(`stored ${name} (${body.length} bytes) ${req.url}`);
        }
        res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' });
        res.end('{}');
      });
    }).listen(port, '127.0.0.1', () => resolve(server));
  });
}

function checkDirectory(dir, secrets) {
  const files = fs.readdirSync(dir).filter((name) => name.endsWith('.txt')).sort();
  const findings = [];
  for (const file of files) for (const finding of scanText(fs.readFileSync(path.join(dir, file), 'utf8'), secrets)) findings.push({ ...finding, file });
  return { files: files.length, findings };
}

function verdict(result) {
  if (result.files === 0) return 'NO PROOF: nothing was received. The app did not send to this listener.';
  if (result.findings.length > 0) return `FAIL: ${result.findings.length} leak(s) in ${result.files} stored request(s).`;
  return `PASS: ${result.files} stored request(s), none contains a named secret, a session token or an email.`;
}

module.exports = { scanText, startListener, checkDirectory, verdict };

if (require.main === module) {
  const [mode, dir, ...rest] = process.argv.slice(2);
  if (mode === 'listen' && dir) {
    const port = Number(rest[0] ?? 9000);
    startListener({ dir, port }).then(() => console.log(`listening on http://127.0.0.1:${port}, storing into ${dir}\nEXPO_PUBLIC_SENTRY_PROOF_DSN=http://proof@127.0.0.1:${port}/1`));
  } else if (mode === 'check' && dir && rest.length > 0) {
    const result = checkDirectory(dir, rest);
    for (const finding of result.findings) console.log(`LEAK ${finding.kind}: ${finding.match} in ${finding.file}`);
    console.log(verdict(result));
    process.exit(result.files > 0 && result.findings.length === 0 ? 0 : 1);
  } else {
    console.error('usage: sentry-proof-listener.cjs listen <folder> [port] | check <folder> <secret> [<secret>…]');
    process.exit(2);
  }
}
