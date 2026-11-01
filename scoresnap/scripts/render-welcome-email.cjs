// Offline renderer: transpiles only the pure payload module; never loads the handler.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../supabase/functions/on-user-signup/lib.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const email = context.exports.buildWelcomeEmail('sample@example.test', 'SAMPLE', context.exports.emailSettings({}));
if (require.main === module) fs.writeFileSync(process.argv[2], email.html);
module.exports = context.exports;
