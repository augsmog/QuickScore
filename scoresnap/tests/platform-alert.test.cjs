const fs = require('node:fs');
const ts = require('typescript');

function loadPlatformAlert(platform, alert) {
  const module = { exports: {} };
  const source = fs.readFileSync('src/services/platform-alert.ts', 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', output)(
    id => {
      if (id === 'react-native') return { Alert: alert, Platform: { OS: platform } };
      throw new Error(`Unexpected dependency ${id}`);
    },
    module,
    module.exports,
  );
  return module.exports.showAlert;
}

test('native platforms forward alert text, actions, and options unchanged', () => {
  const alert = { alert: jest.fn() };
  const showAlert = loadPlatformAlert('ios', alert);
  const buttons = [{ text: 'Cancel', style: 'cancel' }, { text: 'Finalize', onPress: jest.fn() }];
  const options = { cancelable: false };

  showAlert('Finalize Round?', 'This locks scores.', buttons, options);

  expect(alert.alert).toHaveBeenCalledTimes(1);
  expect(alert.alert).toHaveBeenCalledWith('Finalize Round?', 'This locks scores.', buttons, options);
});
