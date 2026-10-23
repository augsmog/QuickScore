const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

// Load the pure TS helper in-process (also works where child processes are restricted).
const source = fs.readFileSync(require.resolve('../src/services/local-join-limitation.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const context = { exports: {} };
vm.runInNewContext(compiled.outputText, context);
const { getLocalJoinLimitation } = context.exports;

test('notice explains local scope while keeping guest joins available', () => {
  const notice = getLocalJoinLimitation();
  expect(notice.title).toBe('Same browser only');
  expect(notice.message).toContain('this device/browser, not another phone');
  expect(notice.message).toContain('Live cross-device sharing is coming');
  expect(notice.sameBrowserOnly).toBe(true);
  expect(notice.crossDeviceSharing).toBe(false);
  expect(notice.canJoin).toBe(true);
  expect(notice.dismissible).toBe(false);
  expect(getLocalJoinLimitation()).toEqual(notice);
});
