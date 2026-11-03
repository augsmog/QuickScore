const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, test } = require("node:test");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "metro-shared-modules-"));
after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));

test("nightly Metro canonicalizes the shared node_modules symlink", () => {
  const realNodeModules = path.join(tempRoot, "tree", "node_modules");
  const aliasNodeModules = path.join(tempRoot, "current", "node_modules");
  fs.mkdirSync(realNodeModules, { recursive: true });
  fs.mkdirSync(path.dirname(aliasNodeModules), { recursive: true });
  fs.symlinkSync(realNodeModules, aliasNodeModules, "dir");

  process.env.SNAPSCORE_NIGHTLY_NODE_MODULES = aliasNodeModules;
  const configPath = path.resolve(__dirname, "../../../metro.config.js");
  delete require.cache[require.resolve(configPath)];
  const config = require(configPath);
  delete process.env.SNAPSCORE_NIGHTLY_NODE_MODULES;

  const canonicalNodeModules = fs.realpathSync(aliasNodeModules);
  assert.ok(config.watchFolders.includes(canonicalNodeModules));
  assert.ok(!config.watchFolders.includes(aliasNodeModules));
  assert.equal(config.resolver.nodeModulesPaths[0], canonicalNodeModules);
  assert.equal(
    config.resolver.extraNodeModules.react,
    path.join(canonicalNodeModules, "react"),
  );
});
