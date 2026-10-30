const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

// Execute actual button handlers without loading native screen dependencies.
function handlersFor(file, label, router, setPhase) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = [];
  function visit(node) {
    if (ts.isJsxElement(node) && ['Pressable', 'AnimatedPressable'].includes(node.openingElement.tagName.getText(source))) {
      if (node.children.map(child => child.getText(source)).join(' ').includes(label)) {
        const prop = node.openingElement.attributes.properties.find(p => p.name?.getText(source) === 'onPress');
        handlers.push(vm.runInNewContext(`(${prop.initializer.expression.getText(source)})`, { router, setPhase }));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  // The first scan Go Back belongs to the ordinary text-entry screen.
  return file === 'app/scan/index.tsx' && label === 'Go Back' ? handlers.slice(1) : handlers;
}

for (const [file, label, count] of [
  ['app/scan/review.tsx', 'Go Back', 1],
  ['app/contest/[id]/_layout.tsx', 'Go Back', 1],
  ['app/scan/index.tsx', 'Go Back', 1],
]) {
  for (const hasHistory of [false, true]) {
    test(`${file}: ${label} ${hasHistory ? 'uses history' : 'falls back to home'}`, () => {
      const router = { canGoBack: jest.fn(() => hasHistory), back: jest.fn(), replace: jest.fn() };
      const handlers = handlersFor(file, label, router);
      expect(handlers).toHaveLength(count);
      for (const handler of handlers) {
        router.back.mockClear();
        router.replace.mockClear();
        handler();
        if (hasHistory) {
          expect(router.back).toHaveBeenCalledTimes(1);
          expect(router.replace).not.toHaveBeenCalled();
        } else {
          expect(router.replace).toHaveBeenCalledWith('/');
          expect(router.back).not.toHaveBeenCalled();
        }
      }
    });
  }
}

// The join screen is shared by Expo iOS and web. It must always leave the flow,
// including a cold-start deep link where there is no navigation history.
for (const hasHistory of [false, true]) {
  test(`native join dismiss returns home with history=${hasHistory}`, () => {
    const router = { canGoBack: jest.fn(() => hasHistory), back: jest.fn(), replace: jest.fn() };
    const handlers = handlersFor('app/join/[code].tsx', 'Back to home', router);
    expect(handlers).toHaveLength(1);
    handlers[0]();
    expect(router.replace).toHaveBeenCalledWith('/');
    expect(router.back).not.toHaveBeenCalled();
  });
}

// Manual entry is available inside the scan screen even on cold-start links or after decline.
test('scan error and exhausted allowance both open manual entry without navigation', () => {
  const router = {back:jest.fn(),replace:jest.fn()};
  const setPhase = jest.fn();
  const handlers = handlersFor('app/scan/index.tsx', 'Enter scores manually instead', router, setPhase);
  expect(handlers).toHaveLength(2);
  for (const handler of handlers) handler();
  expect(setPhase.mock.calls).toEqual([['text-entry'], ['text-entry']]);
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).not.toHaveBeenCalled();
});
