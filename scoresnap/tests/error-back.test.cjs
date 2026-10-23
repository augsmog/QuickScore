const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

// Execute actual button handlers without loading native screen dependencies.
function handlersFor(file, label, router) {
  const source = ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const handlers = [];
  function visit(node) {
    if (ts.isJsxElement(node) && ['Pressable', 'AnimatedPressable'].includes(node.openingElement.tagName.getText(source))) {
      if (node.children.map(child => child.getText(source)).join(' ').includes(label)) {
        const prop = node.openingElement.attributes.properties.find(p => p.name?.getText(source) === 'onPress');
        handlers.push(vm.runInNewContext(`(${prop.initializer.expression.getText(source)})`, { router }));
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
  ['app/scan/index.tsx', 'Enter scores manually instead', 2],
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
