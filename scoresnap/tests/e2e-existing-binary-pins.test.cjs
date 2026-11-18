const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const config = JSON.parse(fs.readFileSync(path.join(root, '.maestro/e2e.config.json')));
const pins = config.flows.filter(f => f.pinnedEasBuildId);
const guard = '.maestro/scripts/validate-existing-binary.py';
function run(flow, extra = []) {
  return spawnSync('python3', [guard, '--config', '.maestro/e2e.config.json', '--build', 'offline', '--flows', flow, ...extra], {cwd: root, encoding: 'utf8'});
}
for (const pin of pins) {
  describe(pin.id, () => {
    const valid = () => ['--app-url', pin.pinnedArtifactUrl, '--build-id', pin.pinnedEasBuildId];
    test('rejects source-build fallback before external work', () => {
      const r = run(pin.id); expect(r.status).toBe(2); expect(r.stderr).toMatch(/^existing-binary:/);
    });
    test('rejects source app path even with matching metadata', () => {
      const r = run(pin.id, [...valid(), '--app-path', '/tmp/fresh.app']);
      expect(r.status).toBe(2); expect(r.stderr).toMatch(/^existing-binary:/);
    });
    test('rejects absent build id', () => {
      const r = run(pin.id, ['--app-url', pin.pinnedArtifactUrl]);
      expect(r.status).toBe(2); expect(r.stderr).toMatch(/^existing-binary:/);
    });
    test('rejects incorrect build id', () => {
      const r = run(pin.id, ['--app-url', pin.pinnedArtifactUrl, '--build-id', 'wrong']);
      expect(r.status).toBe(2); expect(r.stderr).toMatch(/^existing-binary:/);
    });
    test('rejects another artifact despite claimed correct id', () => {
      const r = run(pin.id, ['--app-url', 'https://expo.dev/artifacts/eas/other.tar.gz', '--build-id', pin.pinnedEasBuildId]);
      expect(r.status).toBe(2); expect(r.stderr).toMatch(/^existing-binary:/);
    });
    test('accepts retained exact artifact and returns its hash', () => {
      const r = run(pin.id, valid()); expect(r.status).toBe(0);
      expect(r.stdout.trim()).toBe(pin.pinnedArtifactSha256);
    });
    test('pins equal retained Nov14 evidence, not caller supplied identity', () => {
      expect(pin.pinnedArtifactUrl).toMatch(/^https:\/\/expo.dev\/artifacts\/eas\//);
      expect(pin.pinnedArtifactSha256).toMatch(/^[a-f0-9]{64}$/);
    });
  });
}
test('rejects incompatible selected pins', () => {
  const r = run(pins.map(f => f.id).join(',')); expect(r.status).toBe(2); expect(r.stderr).toMatch(/conflicting/);
});
test('all still allows source builds because opt-in pins are excluded', () => {
  const r = run('all'); expect(r.status).toBe(0); expect(r.stdout.trim()).toBe('');
});
test('unknown explicit selections cannot silently disappear', () => {
  const r = run('missing-flow'); expect(r.status).toBe(2); expect(r.stderr).toMatch(/unknown/);
});
test('entry points validate before download, build, or simulator work', () => {
  const shell = fs.readFileSync(path.join(root, '.maestro/scripts/run-ios-sim.sh'), 'utf8');
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/e2e-ios-sim.yml'), 'utf8');
  expect(shell.indexOf('validate-existing-binary.py')).toBeGreaterThan(0);
  expect(shell.indexOf('validate-existing-binary.py')).toBeLessThan(shell.indexOf('curl -fsSL'));
  expect(workflow.indexOf('validate-existing-binary.py')).toBeGreaterThan(0);
  expect(workflow.indexOf('validate-existing-binary.py')).toBeLessThan(workflow.indexOf('Install app dependencies'));
  expect(shell).toMatch(/EXPECTED_SHA.*!=.*SHA/s);
});

test.each([false, true])('runner rejects before extraction/simulator (valid metadata=%s)', validMetadata => {
  const os = require('os');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pin-guard-'));
  const bin = path.join(temp, 'bin'); fs.mkdirSync(bin);
  const trace = path.join(temp, 'trace');
  for (const name of ['curl', 'tar', 'xcrun']) {
    const body = name === 'curl' ? 'printf "wrong archive" > "$3"\n' : '';
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\necho ${name} >> "${trace}"\n${body}exit 0\n`, {mode: 0o755});
  }
  const pin = pins[0];
  try {
    const r = spawnSync('bash', ['.maestro/scripts/run-ios-sim.sh', '--build', 'offline', '--flows', pin.id,
      '--app-url', validMetadata ? pin.pinnedArtifactUrl : 'https://expo.dev/artifacts/eas/wrong.tar.gz',
      '--build-id', pin.pinnedEasBuildId, '--out', path.join(temp, 'out')],
      {cwd: root, encoding: 'utf8', env: {...process.env, TMPDIR: temp, PATH: `${bin}:${process.env.PATH}`}});
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(validMetadata ? /SHA256 mismatch/ : /exact retained/);
    expect(fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8') : '').toBe(validMetadata ? 'curl\n' : '');
  } finally { fs.rmSync(temp, {recursive: true, force: true}); }
});
