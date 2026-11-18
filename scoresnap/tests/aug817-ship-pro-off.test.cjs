// AUG-817: the shipped release builds (testflight + production) must pin Pro OFF explicitly,
// so an inherited/stale EXPO_PUBLIC_PRO_ENABLED in the EAS environment can never turn Pro on.
const fs = require('fs');
const eas = JSON.parse(fs.readFileSync('eas.json', 'utf8'));
const app = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
describe('AUG-817 ship with Pro off', () => {
  test.each(['testflight', 'production'])('%s pins EXPO_PUBLIC_PRO_ENABLED=false', p => {
    expect(eas.build[p].env.EXPO_PUBLIC_PRO_ENABLED).toBe('false');
  });
  test('code default is off when env unset', () => {
    expect(fs.readFileSync('src/config/pro-membership.ts', 'utf8')).toMatch(/EXPO_PUBLIC_PRO_ENABLED \?\? "false"/);
  });
  test('version bumped past 1.0.0', () => {
    expect(app.version).not.toBe('1.0.0');
  });
});
