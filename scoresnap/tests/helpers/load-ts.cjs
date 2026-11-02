const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
// Execute production modules with explicit platform/transport boundaries mocked.
module.exports = function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} }; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      if (name in mocks) return mocks[name];
      if (name.startsWith('.')) {
        const target = path.resolve(path.dirname(file), name);
        const source = [target, `${target}.ts`, `${target}.tsx`].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
        if (source) return load(source);
      }
      return require(name);
    }, mod, mod.exports);
    return mod.exports;
  }
  return load;
};
