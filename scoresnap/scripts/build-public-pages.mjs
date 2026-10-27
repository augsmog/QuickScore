import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function load(rel) {
  const filename = path.join(root, rel);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require(name) {
      if (!name.startsWith(".")) throw new Error(`Unexpected import ${name}`);
      const resolved = path.resolve(path.dirname(filename), name);
      return load(path.relative(root, resolved).replace(/\\/g, "/") + ".ts");
    },
  }, { filename });
  return exports;
}

const pages = load("src/web/public-pages.ts");
const privacyMarkdown = fs.readFileSync(path.join(root, "docs/privacy-policy.md"), "utf8");
const site = path.join(root, "site");

function write(rel, body) {
  const file = path.join(site, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body.endsWith("\n") ? body : `${body}\n`);
}

write("index.html", pages.renderHomePage());
write("support/index.html", pages.renderSupportPage());
write("privacy/index.html", pages.renderPrivacyPage(privacyMarkdown));
