// AUG-1602: the candidate check must refuse, not advise. Each case builds a small throwaway git
// repository so the real git logic (ancestry, identical-patch detection, tree) is exercised; only
// the unit-suite runner is replaced, because running Jest inside Jest is not the thing under test.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { candidateCheck, verifyReceipt, Refusal } = require('../scripts/release/candidate-check.cjs');

const GREEN = () => ({ suites: 3, suitesFailed: 0, suitesErrored: 0, tests: 10, passed: 10, failed: 0, skipped: [] });
const dirs = [];
afterAll(() => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); });

function fixture({ version = '1.0.1', appVersionSource = 'remote' } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-check-test-'));
  dirs.push(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
  const commit = (message) => { git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
  git('init', '-q', '-b', 'main');
  write('scoresnap/app.json', JSON.stringify({ expo: { version, ios: { buildNumber: '1' } } }));
  write('scoresnap/eas.json', JSON.stringify({ cli: { appVersionSource } }));
  write('scoresnap/a.txt', 'a0\n'); write('scoresnap/b.txt', 'b0\n');
  const base = commit('base');
  // Two fixes made on side branches, the way release fixes are made.
  git('checkout', '-q', '-b', 'fix-a', base); write('scoresnap/a.txt', 'a1\n'); const fixA = commit('fix a');
  git('checkout', '-q', '-b', 'fix-b', base); write('scoresnap/b.txt', 'b1\n'); const fixB = commit('fix b');
  // Combined by cherry-pick: new commit SHAs, identical patches.
  // An unrelated commit first, so both cherry-picks get new SHAs.
  git('checkout', '-q', '-b', 'combined', base); write('scoresnap/c.txt', 'c\n'); commit('unrelated');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'cherry-pick', fixA); const onlyA = git('rev-parse', 'HEAD');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'cherry-pick', fixB); const both = git('rev-parse', 'HEAD');
  // Kept outside the repository so fixture commits never pick them up.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-check-out-'));
  dirs.push(out);
  const fixesFile = path.join(out, 'required-fixes.json');
  const writeFixes = (overrides = {}) => fs.writeFileSync(fixesFile, JSON.stringify({
    schema: 'snapscore-required-fixes/1', release: { version: '1.0.1', ticket: 'AUG-TEST' }, base,
    fixes: [{ ticket: 'AUG-A', what: 'fix a', commit: fixA }, { ticket: 'AUG-B', what: 'fix b', commit: fixB }],
    allowedSkips: [], ...overrides,
  }));
  writeFixes();
  return { repo, git, write, commit, base, fixA, fixB, onlyA, both, fixesFile, writeFixes, receiptPath: path.join(out, 'candidate-receipt.json') };
}
const run = (f, overrides = {}) => candidateCheck({ repo: f.repo, sha: f.both, fixesFile: f.fixesFile, receiptPath: f.receiptPath, runSuite: GREEN, ...overrides });
const refused = (fn, pattern) => assert.throws(fn, (error) => error instanceof Refusal && pattern.test(error.message));

test('green case writes a receipt bound to the exact SHA and tree, with every fix marked present', () => {
  const f = fixture();
  const receipt = run(f, { now: () => new Date('2026-11-27T03:00:00Z') });
  assert.deepEqual(JSON.parse(fs.readFileSync(f.receiptPath, 'utf8')), receipt);
  assert.equal(receipt.sha, f.both);
  assert.equal(receipt.tree, f.git('rev-parse', `${f.both}^{tree}`));
  assert.deepEqual(receipt.suite, { suites: 3, tests: 10, passed: 10, failed: 0, skipped: [] });
  assert.deepEqual(receipt.fixes.map((fix) => [fix.ticket, fix.present, fix.how]), [['AUG-A', 'yes', 'identical-patch'], ['AUG-B', 'yes', 'identical-patch']]);
  assert.equal(receipt.release.version, '1.0.1');
  assert.match(receipt.release.buildNumber, /assigned at build time/);
  assert.equal(receipt.checkedAt, '2026-11-27T03:00:00.000Z');
  assert.equal(verifyReceipt({ repo: f.repo, sha: f.both, receiptPath: f.receiptPath }).sha, f.both);
});

test('a fix that is a plain ancestor is accepted as an ancestor', () => {
  const f = fixture();
  f.writeFixes({ fixes: [{ ticket: 'AUG-A', what: 'fix a', commit: f.fixA }] });
  assert.equal(candidateCheck({ repo: f.repo, sha: f.fixA, fixesFile: f.fixesFile, receiptPath: f.receiptPath, runSuite: GREEN }).fixes[0].how, 'ancestor');
});

test('missing fix is refused, the suite is never run, and no receipt is left behind', () => {
  const f = fixture();
  run(f); // a receipt from an earlier good run exists
  let suiteRan = false;
  refused(() => run(f, { sha: f.onlyA, runSuite: () => { suiteRan = true; return GREEN(); } }), /required fix missing: AUG-B/);
  assert.equal(suiteRan, false);
  assert.equal(fs.existsSync(f.receiptPath), false);
});

test('a fix altered while being combined is refused', () => {
  const f = fixture();
  f.git('checkout', '-q', '-b', 'altered', f.base);
  f.write('scoresnap/a.txt', 'a1\n'); f.commit('fix a, retyped identically');
  f.write('scoresnap/b.txt', 'b1 but different\n'); const altered = f.commit('fix b, edited');
  refused(() => run(f, { sha: altered }), /required fix missing: AUG-B/);
});

test('red test is refused and writes no receipt', () => {
  const f = fixture();
  refused(() => run(f, { runSuite: () => ({ ...GREEN(), passed: 9, failed: 1, suitesFailed: 1 }) }), /unit suite is red: 1 test\(s\) failed/);
  assert.equal(fs.existsSync(f.receiptPath), false);
  refused(() => run(f, { runSuite: () => ({ ...GREEN(), suitesErrored: 1 }) }), /could not run/);
  refused(() => run(f, { runSuite: () => ({ ...GREEN(), tests: 0, passed: 0, suites: 0 }) }), /zero tests/);
});

test('a skipped test is refused unless it is named on the allow-list', () => {
  const f = fixture();
  const withSkip = () => ({ ...GREEN(), passed: 9, skipped: ['suite quarantined case'] });
  refused(() => run(f, { runSuite: withSkip }), /skipped test\(s\) not on the allow-list: suite quarantined case/);
  f.writeFixes({ allowedSkips: ['suite quarantined case'] });
  assert.deepEqual(run(f, { runSuite: withSkip }).suite.skipped, ['suite quarantined case']);
});

test('wrong version is refused', () => {
  const f = fixture({ version: '1.0.0' });
  refused(() => run(f), /version mismatch: source says 1\.0\.0, release AUG-TEST says 1\.0\.1/);
  assert.equal(fs.existsSync(f.receiptPath), false);
});

test('when the build number lives in source it must match the release', () => {
  const f = fixture({ appVersionSource: 'local' });
  refused(() => run(f), /release\.buildNumber is missing/);
  f.writeFixes({ release: { version: '1.0.1', ticket: 'AUG-TEST', buildNumber: '33' } });
  refused(() => run(f), /build number mismatch: source says 1, release says 33/);
});

test('an abbreviated or unknown SHA and a malformed fix list are refused', () => {
  const f = fixture();
  refused(() => run(f, { sha: f.both.slice(0, 12) }), /full 40-character/);
  refused(() => run(f, { sha: 'f'.repeat(40) }), /not a commit in this repository/);
  f.writeFixes({ fixes: [] });
  refused(() => run(f), /non-empty list/);
  f.writeFixes({ fixes: [{ ticket: 'AUG-A', what: 'fix a', commit: f.fixA.slice(0, 7) }] });
  refused(() => run(f), /full 40-character SHA/);
});

test('verify refuses a missing receipt, a receipt for another SHA, and an edited receipt', () => {
  const f = fixture();
  refused(() => verifyReceipt({ repo: f.repo, sha: f.both, receiptPath: f.receiptPath }), /is not a candidate/);
  run(f);
  refused(() => verifyReceipt({ repo: f.repo, sha: f.onlyA, receiptPath: f.receiptPath }), /receipt is for .* not /);
  const receipt = JSON.parse(fs.readFileSync(f.receiptPath, 'utf8'));
  for (const edit of [(r) => { r.suite.failed = 1; }, (r) => { r.fixes[0].present = 'no'; }, (r) => { r.tree = '0'.repeat(40); }, (r) => { r.checkSha256 = 'x'; }]) {
    const copy = structuredClone(receipt); edit(copy);
    fs.writeFileSync(f.receiptPath, JSON.stringify(copy));
    assert.throws(() => verifyReceipt({ repo: f.repo, sha: f.both, receiptPath: f.receiptPath }), Refusal);
  }
});

test('the shipped 1.0.1 fix list is well formed', () => {
  const { validateFixes } = require('../scripts/release/candidate-check.cjs');
  const doc = validateFixes(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'release', 'required-fixes.json'), 'utf8')));
  assert.equal(doc.release.version, '1.0.1');
  assert.equal(doc.fixes.length, 4);
  assert.deepEqual(doc.allowedSkips, []);
});
