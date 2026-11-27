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

describe('the gate captures Settings, a round and the scan entry', () => {
  const perPr = Object.fromEntries(config.flows.filter((f) => f.cadence === 'per-pr').map((f) => [f.id, f.checkpoints]));

  test('the per-PR checkpoint list', () => {
    expect(perPr).toEqual({
      'new-contest': ['empty wizard', 'name entry', 'multi day on', 'rounds 3', 'rounds 4 scrolled', 'team mode on', 'four players', 'last player above footer'],
      join: ['entry'],
      paywall: ['tier td'],
      'sign-in': ['options', 'email form'],
      settings: ['top', 'subscription'],
      round: ['score entry', 'hole scored', 'settlement'],
      scan: ['text entry'],
    });
  });

  // Every id a new flow waits for, taps or asserts is an id the app's source gives an element.
  // Ids built from a player name (score-par-Ava) are matched by their prefix.
  test('every id the new flows use exists in the app source', () => {
    const app = ['app/settings.tsx', 'app/scan/index.tsx', 'app/(tabs)/index.tsx'].map((f) => read('scoresnap', f)).join('\n')
      + fs.readdirSync(path.join(root, 'scoresnap', 'app', 'contest', '[id]'), { recursive: true }).filter((f) => /\.tsx$/.test(f)).map((f) => read('scoresnap', 'app', 'contest', '[id]', f)).join('\n')
      + fs.readdirSync(path.join(root, 'scoresnap', 'src', 'ui'), { recursive: true }).filter((f) => /\.tsx$/.test(f)).map((f) => read('scoresnap', 'src', 'ui', f)).join('\n');
    const ids = new Set();
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node && typeof node === 'object') { if (typeof node.id === 'string') ids.add(node.id); Object.values(node).forEach(walk); }
    };
    for (const [dir, files] of Object.entries({ settings: ['00-top.yaml', '01-subscription.yaml'], round: ['00-score-entry.yaml', '01-hole-scored.yaml', '02-settlement.yaml'], scan: ['00-text-entry.yaml'] }))
      for (const file of files) walk(flow(dir, file));
    expect([...ids].sort()).toEqual(['parse-scorecard-button', 'scan-unavailable-simulator', 'score-next-hole', 'score-par-Ava', 'score-par-Ben', 'score-plus-Ava', 'scorecard-text-input', 'settlement-scroll']);
    for (const id of ids) {
      const stem = id.replace(/-(Ava|Ben)$/, '-');
      expect(app.includes(`"${id}"`) || app.includes('`' + stem + '${')).toBe(true);
    }
  });

  test('Settings: both purchase rows are asserted before the Subscription capture', () => {
    const steps = flow('settings', '01-subscription.yaml');
    expect(steps).toContainEqual({ scrollUntilVisible: { element: 'Restore purchases', direction: 'DOWN' } });
    expect(steps).toContainEqual({ assertVisible: 'Tournament Director' });
    expect(steps).toContainEqual({ assertVisible: 'Restore purchases' });
    const settings = read('scoresnap', 'app', 'settings.tsx');
    expect(settings).toContain('>Restore purchases<');
    expect(settings).toContain('<SectionHeader title="Course & Play"');
    expect(read('scoresnap', 'src', 'ui', 'paywall-copy.ts')).toContain('"td": "Tournament Director"');
  });

  test('the first checkpoint of each new flow starts from a clean app; the rest continue the session', () => {
    for (const [dir, files] of Object.entries({ settings: ['00-top.yaml', '01-subscription.yaml'], round: ['00-score-entry.yaml', '01-hole-scored.yaml', '02-settlement.yaml'], scan: ['00-text-entry.yaml'] }))
      files.forEach((file, i) => {
        const steps = flow(dir, file);
        const launch = steps.find((s) => s.launchApp);
        if (i === 0) expect(launch.launchApp.clearState).toBe(true);
        else { expect(launch).toBeUndefined(); expect(Object.keys(steps[0])[0]).toBe('assertVisible'); }
      });
  });

  test('the round is made with the subflow the offline journeys already use', () => {
    const steps = flow('round', '00-score-entry.yaml');
    expect(steps).toContainEqual({ runFlow: '../../../subflows/create-two-player-skins.yaml' });
    expect(fs.existsSync(path.join(root, '.maestro', 'subflows', 'create-two-player-skins.yaml'))).toBe(true);
  });

  test('the scan capture says it is the simulator screen, not the store build', () => {
    const steps = flow('scan', '00-text-entry.yaml');
    expect(steps).toContainEqual({ assertVisible: { id: 'scan-unavailable-simulator' } });
    expect(read('.maestro', 'flows', 'device-layout', 'scan', '00-text-entry.yaml')).toMatch(/NOT the camera screen the store build shows/);
  });
});

module.exports = { read, flow, workflow, config, eas };
