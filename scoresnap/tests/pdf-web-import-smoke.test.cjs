const { loadPdfModule } = require('../e2e/pdf-web-import-smoke.cjs');
const marker = "'Unsupported scorecard font glyph'";
const registration = (id = 19, body = '') => `__d(function(g,r,i,a,m,e,d){${marker};e.buildScorecardPdf=()=>{};e.UnsupportedScorecardCharactersError=class extends Error{};${body}},${id},[]);`;
const runtime = 'var modules=new Map();globalThis.__d=(factory,id)=>modules.set(id,factory);globalThis.__r=id=>{const m={exports:{}};modules.get(id)(globalThis,__r,null,null,m,m.exports,[]);return m.exports};';
const bundle = (modules = registration(), boot = '\n__r(99);\n') => runtime + '\n' + modules + boot;
test('loads semantic module without hardcoded ID or app boot, preserving real dependency execution', () => {
  expect(typeof loadPdfModule(bundle(registration(735))).buildScorecardPdf).toBe('function');
});
test('retains import failure rather than accepting emitted markers', () => {
  expect(() => loadPdfModule(bundle(registration(19, "throw new TypeError('actual import failure');")))).toThrow('actual import failure');
});
test('fails closed for missing or ambiguous semantic module', () => {
  expect(() => loadPdfModule(bundle(''))).toThrow('exactly one');
  expect(() => loadPdfModule(bundle(registration(19)+'\n'+registration(20)))).toThrow('exactly one');
});
test('requires actual callable exports rather than source marker presence', () => {
  expect(() => loadPdfModule(bundle(registration(19, 'delete e.buildScorecardPdf;')))).toThrow('exports missing');
});
test('strips only asserted terminal boot calls and rejects unrecognized startup layout', () => {
  expect(() => loadPdfModule(bundle(registration(), ''))).toThrow('terminal Metro');
  expect(() => loadPdfModule(bundle('__r(98);\n'+registration()))).toThrow('nonterminal');
  expect(() => loadPdfModule(bundle(registration(), '\n__r(99);\nconsole.log("extra");'))).toThrow('terminal Metro');
});
