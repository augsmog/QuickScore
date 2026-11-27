// What the layout gate (device-layout-gate) looks at. AUG-1601: Augie asked that layout be watched;
// these tests keep the gate looking at the app that ships and at the screens people use.
// They check the gate's wiring. They do not run a simulator: only a gate run shows the flows work.
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const root = path.join(__dirname, '..', '..');
const read = (...p) => fs.readFileSync(path.join(root, ...p), 'utf8');
const flow = (...p) => yaml.loadAll(read('.maestro', 'flows', 'device-layout', ...p))[1];
const workflow = yaml.load(read('.github', 'workflows', 'device-layout-gate.yml'));
const config = JSON.parse(read('scoresnap', 'e2e', 'device-layout', 'config', 'device-layout.config.json'));
const eas = JSON.parse(read('scoresnap', 'eas.json'));

describe('join by code: the gate builds what the release ships', () => {
  test('the release profiles ship join by code on', () => {
    for (const profile of ['testflight', 'production']) expect(eas.build[profile].env.EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING).toBe('true');
  });

  test('both native jobs of the gate turn the flag on, and the build scripts pass it to the app', () => {
    const ios = workflow.jobs['ios-sim'].steps.find((s) => /run-ios-sim\.sh/.test(s.run ?? ''));
    expect(ios.env.DEVICE_LAYOUT_JOIN_FLAG).toBe('on');
    const android = workflow.jobs['android-compact'].steps.find((s) => /run-android-compact\.sh/.test(s.with?.script ?? ''));
    // One command line: the variable must come before the script it is for.
    expect(android.with.script).toMatch(/DEVICE_LAYOUT_JOIN_FLAG=on\s+bash scoresnap\/e2e\/device-layout\/scripts\/run-android-compact\.sh/);
    for (const script of ['build-ios-sim.sh', 'build-android.sh'])
      expect(read('scoresnap', 'e2e', 'device-layout', 'scripts', script)).toContain('export EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING="${DEVICE_LAYOUT_JOIN_FLAG:+true}"');
  });

  test('the Home checkpoint asserts the join entry is present, by the id the app gives it', () => {
    const steps = flow('join', '00-entry.yaml');
    expect(steps).toContainEqual({ assertVisible: { id: 'home-join-code' } });
    expect(steps.some((s) => s.assertNotVisible)).toBe(false);
    const order = steps.map((s) => Object.keys(s)[0]);
    expect(order.lastIndexOf('assertVisible')).toBeLessThan(order.indexOf('takeScreenshot'));
    expect(read('scoresnap', 'app', '(tabs)', 'index.tsx')).toMatch(/\{CROSS_DEVICE_SHARING_ENABLED && \(\s*<AnimatedPressable\s+testID="home-join-code"/);
  });
});

module.exports = { read, flow, workflow, config, eas };
