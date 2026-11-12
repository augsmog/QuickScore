#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const FLAG_KEYS = [
  'EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING',
  'EXPO_PUBLIC_OFFLINE_MODE',
  'EXPO_PUBLIC_DEMO_MODE',
  'EXPO_PUBLIC_PRO_ENABLED',
];
const AUTH_KEYS = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
const scoresnapRoot = path.resolve(__dirname, '..');

function isOn(value) {
  return value === 'true';
}

function committedValue(env, key) {
  return Object.prototype.hasOwnProperty.call(env || {}, key) ? String(env[key]) : 'not committed';
}

function profileRow(name, profile) {
  const env = profile.env || {};
  const offline = isOn(env.EXPO_PUBLIC_OFFLINE_MODE);
  const authPresence = Object.fromEntries(AUTH_KEYS.map((key) => [key, Object.prototype.hasOwnProperty.call(env, key)]));
  const bothAuthKeys = AUTH_KEYS.every((key) => authPresence[key]);
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  let realAuth = offline ? 'false'
    : bothAuthKeys ? Boolean(url && anonKey && !String(url).includes('your-project'))
      : profile.environment ? 'REMOTE/UNKNOWN' : false;
  return {
    name,
    values: Object.fromEntries(FLAG_KEYS.map((key) => [key, committedValue(env, key)])),
    authPresence,
    crossDeviceEnabled: isOn(env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING),
    offlineMode: offline,
    realAuthConfigured: String(realAuth),
  };
}

function profileRows(build = {}) {
  return Object.entries(build).sort(([a], [b]) => a.localeCompare(b)).map(([name, profile]) => profileRow(name, profile));
}

function guardViolations(build = {}) {
  return Object.entries(build).flatMap(([name, profile]) => {
    const env = profile.env || {};
    const protectedProfile = name === 'production' || profile.distribution === 'store';
    if (!protectedProfile) return [];
    return ['EXPO_PUBLIC_OFFLINE_MODE', 'EXPO_PUBLIC_DEMO_MODE']
      .filter((key) => isOn(env[key]))
      .map((key) => `${name} must not commit ${key}=true`);
  });
}

function renderReport(sha, rows) {
  const columns = ['Profile', ...FLAG_KEYS, 'URL committed', 'Anon key committed', 'CROSS_DEVICE_SHARING_ENABLED', 'OFFLINE_MODE', 'REAL_AUTH_CONFIGURED'];
  const escape = (value) => String(value).replaceAll('|', '\\|').replace(/[\r\n]/g, ' ');
  const cells = rows.map((row) => [row.name, ...FLAG_KEYS.map((key) => row.values[key]), row.authPresence[AUTH_KEYS[0]], row.authPresence[AUTH_KEYS[1]], row.crossDeviceEnabled, row.offlineMode, row.realAuthConfigured]);
  return [
    `# Release profile gates`,
    '',
    `Source commit: \`${sha}\``,
    '',
    '| ' + columns.join(' | ') + ' |',
    '| ' + columns.map(() => '---').join(' | ') + ' |',
    ...cells.map((row) => '| ' + row.map(escape).join(' | ') + ' |'),
    '',
    'EAS remote environment values were not read. A committed value of `not committed` is supplied by EAS or the application default.',
    '',
  ].join('\n');
}

function main(args) {
  if (args.length !== 1 || args[0] !== '--report') {
    process.stderr.write('Usage: node scripts/release-profile-gates.cjs --report\n');
    process.exitCode = 2;
    return;
  }
  const eas = JSON.parse(fs.readFileSync(path.join(scoresnapRoot, 'eas.json'), 'utf8'));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(scoresnapRoot, '..'), encoding: 'utf8' }).trim();
  const content = renderReport(sha, profileRows(eas.build || {}));
  const destination = path.join(scoresnapRoot, 'reports', 'release-profile-gates', `${sha}.md`);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content, 'utf8');
  process.stdout.write(`${destination}\n`);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { FLAG_KEYS, AUTH_KEYS, profileRows, guardViolations, renderReport };
