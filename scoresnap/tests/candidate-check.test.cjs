// AUG-1602: the candidate check must refuse, not advise. Each case builds a small throwaway git
// repository so the real git logic (ancestry, identical-patch detection, tree) is exercised; only
// the unit-suite runner is replaced, because running Jest inside Jest is not the thing under test.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { candidateCheck, verifyReceipt, summarizeJestReport, testIdsHash, Refusal } = require('../scripts/release/candidate-check.cjs');
const { runOnCandidate } = require('../scripts/release/run-on-candidate.cjs');

const IDS = Array.from({ length: 10 }, (_, i) => `tests/s${i % 3}.test.cjs::case ${i}::passed`).sort();
const GREEN = () => ({ suites: 3, suitesFailed: 0, suitesErrored: 0, tests: 10, passed: 10, failed: 0, skipped: [], ids: [...IDS], suitesListed: 3, suitesNotPassed: 0, success: true });
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
  assert.deepEqual(receipt.suite, { suites: 3, tests: 10, passed: 10, failed: 0, skipped: [], testIdsSha256: testIdsHash(IDS) });
  assert.equal(fs.readFileSync(`${f.receiptPath}.tests.txt`, 'utf8'), `${IDS.join('\n')}\n`);
  assert.deepEqual(receipt.fixes.map((fix) => [fix.ticket, fix.present, fix.how]), [['AUG-A', 'yes', 'identical-patch'], ['AUG-B', 'yes', 'identical-patch']]);
  assert.equal(receipt.release.version, '1.0.1');
  assert.match(receipt.release.buildNumber, /assigned at build time/);
  assert.equal(receipt.checkedAt, '2026-11-27T03:00:00.000Z');
  assert.equal(verifyReceipt({ repo: f.repo, sha: f.both, receiptPath: f.receiptPath, fixesFile: f.fixesFile }).sha, f.both);
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
  assert.equal(fs.existsSync(`${f.receiptPath}.tests.txt`), false);
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
  const withSkip = () => ({ ...GREEN(), passed: 9, skipped: ['suite quarantined case'], ids: [...IDS.slice(0, 9), 'tests/s0.test.cjs::suite quarantined case::pending'].sort() });
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

test('a non-empty but incomplete report is refused', () => {
  const f = fixture();
  // Totals claim ten tests in three suites; the per-test list backs only part of that.
  refused(() => run(f, { runSuite: () => ({ ...GREEN(), ids: IDS.slice(0, 9) }) }), /incomplete: it lists 9 test\(s\) but claims 10/);
  refused(() => run(f, { runSuite: () => ({ ...GREEN(), suitesListed: 2 }) }), /incomplete: it lists 2 suite\(s\) but claims 3/);
  refused(() => run(f, { runSuite: () => { const s = GREEN(); delete s.ids; return s; } }), /no per-test list/);
  refused(() => run(f, { runSuite: () => ({ ...GREEN(), success: false }) }), /does not say the run succeeded/);
  refused(() => run(f, { runSuite: () => ({ ...GREEN(), suitesNotPassed: 1 }) }), /suite\(s\) that did not pass/);
  refused(() => run(f, { runSuite: () => ({ ...GREEN(), ids: [...IDS.slice(0, 9), 'tests/s0.test.cjs::case x::failed'] }) }), /neither passed nor are counted as skipped/);
  assert.equal(fs.existsSync(f.receiptPath), false);
});

test('a real Jest report is summarized into sorted per-test IDs, independent of run order', () => {
  const file = (name, tests) => ({ name: `/app/${name}`, status: 'passed', assertionResults: tests.map((t) => ({ fullName: t, status: 'passed' })) });
  const report = (results) => ({ success: true, numTotalTestSuites: 2, numFailedTestSuites: 0, numRuntimeErrorTestSuites: 0, numTotalTests: 3, numPassedTests: 3, numFailedTests: 0, testResults: results });
  const one = summarizeJestReport(report([file('tests/b.test.cjs', ['b one']), file('tests/a.test.cjs', ['a two', 'a one'])]), '/app');
  const two = summarizeJestReport(report([file('tests/a.test.cjs', ['a one', 'a two']), file('tests/b.test.cjs', ['b one'])]), '/app');
  assert.deepEqual(one.ids, ['tests/a.test.cjs::a one::passed', 'tests/a.test.cjs::a two::passed', 'tests/b.test.cjs::b one::passed']);
  assert.equal(testIdsHash(one.ids), testIdsHash(two.ids));
  // Same headline count, one different test: the hash differs.
  const other = summarizeJestReport(report([file('tests/a.test.cjs', ['a one', 'a three']), file('tests/b.test.cjs', ['b one'])]), '/app');
  assert.equal(other.tests, one.tests);
  assert.notEqual(testIdsHash(other.ids), testIdsHash(one.ids));
});

test('verify refuses a missing receipt, a receipt for another SHA, and every positive-looking edit', () => {
  const f = fixture();
  const verify = (overrides = {}) => verifyReceipt({ repo: f.repo, sha: f.both, receiptPath: f.receiptPath, fixesFile: f.fixesFile, ...overrides });
  refused(() => verify(), /is not a candidate/);
  run(f);
  assert.equal(verify().sha, f.both);
  refused(() => verify({ sha: f.onlyA }), /receipt is for .* not /);
  const receipt = JSON.parse(fs.readFileSync(f.receiptPath, 'utf8'));
  const list = fs.readFileSync(`${f.receiptPath}.tests.txt`, 'utf8');
  const withReceipt = (edit, pattern) => {
    const copy = structuredClone(receipt); edit(copy);
    fs.writeFileSync(f.receiptPath, JSON.stringify(copy));
    refused(() => verify(), pattern);
    fs.writeFileSync(f.receiptPath, JSON.stringify(receipt));
  };
  withReceipt((r) => { r.suite.failed = 1; }, /does not record a green suite/);
  withReceipt((r) => { r.tree = '0'.repeat(40); }, /tree does not match/);
  withReceipt((r) => { r.checkSha256 = 'x'; }, /different version of candidate-check/);
  // Positive-looking but unbound: still says "present: yes" for everything it lists.
  withReceipt((r) => { r.fixes.pop(); }, /lists 1 fix\(es\) but the manifest requires 2/);
  withReceipt((r) => { r.fixes[1].commit = r.fixes[0].commit; }, /fix 2 is not the manifest's/);
  withReceipt((r) => { r.fixes[0].present = 'no'; }, /does not record AUG-A .* as present/);
  withReceipt((r) => { r.fixes[0].as = f.base.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')); }, /which is not in/);
  withReceipt((r) => { r.requiredFixesSha256 = '0'.repeat(64); }, /different required-fixes manifest/);
  withReceipt((r) => { delete r.suite.testIdsSha256; }, /does not bind the ordered test list/);
  withReceipt((r) => { r.suite.testIdsSha256 = '0'.repeat(64); }, /does not match suite.testIdsSha256/);
  withReceipt((r) => { r.suite.tests = 11; r.suite.passed = 11; }, /test list has 10 line\(s\) but the receipt claims 11/);
  // The manifest changes after the receipt was written.
  f.writeFixes({ fixes: [{ ticket: 'AUG-A', what: 'fix a', commit: f.fixA }] });
  refused(() => verify(), /different required-fixes manifest/);
  f.writeFixes();
  refused(() => verify({ fixesFile: path.join(f.repo, 'nope.json') }), /manifest is missing/);
  // The test list beside the receipt is edited or removed.
  fs.writeFileSync(`${f.receiptPath}.tests.txt`, list.replace('case 0', 'case zero'));
  refused(() => verify(), /does not match suite.testIdsSha256/);
  fs.rmSync(`${f.receiptPath}.tests.txt`);
  refused(() => verify(), /test list .* is missing/);
});

test('the shipped 1.0.1 fix list is well formed', () => {
  const { validateFixes } = require('../scripts/release/candidate-check.cjs');
  const doc = validateFixes(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'release', 'required-fixes.json'), 'utf8')));
  assert.equal(doc.release.version, '1.0.1');
  assert.equal(doc.fixes.length, 4);
  assert.deepEqual(doc.allowedSkips, []);
});

// The entry point for build / archive / upload: verify first, then run, or refuse and run nothing.
describe('run-on-candidate', () => {
  const setup = () => {
    const f = fixture();
    run(f);
    f.git('checkout', '-q', '--detach', f.both);
    const marker = path.join(path.dirname(f.receiptPath), 'ran.txt');
    const args = (...command) => ['--source', f.repo, '--receipt', f.receiptPath, '--fixes', f.fixesFile, '--', ...command];
    const record = ['node', '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, [process.cwd(), process.env.CANDIDATE_SHA, process.env.CANDIDATE_TREE].join('\\n'))`];
    return { f, marker, args, record };
  };
  const quiet = { log: () => {}, warn: () => {} };

  test('with a valid receipt for the exact HEAD it runs the command in scoresnap/ and passes the SHA on', () => {
    const { f, marker, args, record } = setup();
    assert.equal(runOnCandidate(args(...record), quiet), 0);
    assert.deepEqual(fs.readFileSync(marker, 'utf8').split('\n'), [fs.realpathSync(path.join(f.repo, 'scoresnap')), f.both, f.git('rev-parse', `${f.both}^{tree}`)]);
  });

  test('the exit status of the command is returned', () => {
    const { args } = setup();
    assert.equal(runOnCandidate(args('node', '-e', 'process.exit(7)'), quiet), 7);
  });

  test('without a receipt, nothing runs', () => {
    const { f, marker, args, record } = setup();
    fs.rmSync(f.receiptPath);
    refused(() => runOnCandidate(args(...record), quiet), /nothing may be built, archived or uploaded without one/);
    assert.equal(fs.existsSync(marker), false);
  });

  test('a checkout at any other SHA is refused and nothing runs', () => {
    const { f, marker, args, record } = setup();
    f.git('checkout', '-q', '--detach', f.onlyA);
    refused(() => runOnCandidate(args(...record), quiet), /is at .* but the receipt is for /);
    // One commit past the receipted SHA is also another SHA.
    f.git('checkout', '-q', '--detach', f.both); f.write('scoresnap/d.txt', 'd\n'); f.commit('one more');
    refused(() => runOnCandidate(args(...record), quiet), /but the receipt is for /);
    assert.equal(fs.existsSync(marker), false);
  });

  test('a checkout with edited tracked files is refused and nothing runs', () => {
    const { f, marker, args, record } = setup();
    f.write('scoresnap/a.txt', 'hot fix made on the build machine\n');
    refused(() => runOnCandidate(args(...record), quiet), /has changes to tracked files/);
    assert.equal(fs.existsSync(marker), false);
  });

  test('a checkout with an untracked file that is not git-ignored is refused and nothing runs', () => {
    const { f, marker, args, record } = setup();
    f.write('scoresnap/stray.config.js', 'module.exports = {};\n');
    refused(() => runOnCandidate(args(...record), quiet), /untracked files that are not git-ignored[\s\S]*stray\.config\.js/);
    assert.equal(fs.existsSync(marker), false);
    // A new file staged but not committed counts as a change to tracked files.
    f.git('add', 'scoresnap/stray.config.js');
    refused(() => runOnCandidate(args(...record), quiet), /has changes to tracked files/);
    assert.equal(fs.existsSync(marker), false);
  });

  test('git-ignored files in the checkout do not refuse', () => {
    const { f, marker, args, record } = setup();
    fs.mkdirSync(path.join(f.repo, '.git', 'info'), { recursive: true });
    fs.writeFileSync(path.join(f.repo, '.git', 'info', 'exclude'), 'scoresnap/node_modules/\n');
    f.write('scoresnap/node_modules/x/index.js', '1\n');
    assert.equal(runOnCandidate(args(...record), quiet), 0);
    assert.equal(fs.existsSync(marker), true);
  });

  test('a receipt that verify rejects is refused and nothing runs', () => {
    const { f, marker, args, record } = setup();
    fs.rmSync(`${f.receiptPath}.tests.txt`);
    refused(() => runOnCandidate(args(...record), quiet), /test list .* is missing/);
    f.writeFixes({ fixes: [{ ticket: 'AUG-A', what: 'fix a', commit: f.fixA }] });
    refused(() => runOnCandidate(args(...record), quiet), /./);
    assert.equal(fs.existsSync(marker), false);
  });

  test('no command, or missing flags, is refused', () => {
    const { f } = setup();
    refused(() => runOnCandidate(['--source', f.repo, '--receipt', f.receiptPath, '--'], quiet), /no command given/);
    refused(() => runOnCandidate(['--source', f.repo, '--', 'true'], quiet), /--receipt is required/);
    refused(() => runOnCandidate(['--source', f.repo, '--receipt', f.receiptPath, 'true'], quiet), /usage/);
  });

  // Fresh mode (the default): the wrapper makes its own checkout of the receipt SHA and removes it.
  const freshSetup = () => {
    const s = setup();
    const tmpRoot = fs.mkdtempSync(path.join(path.dirname(s.f.receiptPath), 'tmp-'));
    const seen = path.join(path.dirname(s.f.receiptPath), 'seen.json');
    const probe = ['node', '-e', `const fs=require('fs');const g=(a)=>require('child_process').execFileSync('git',a,{encoding:'utf8'}).trim();fs.writeFileSync(${JSON.stringify(seen)},JSON.stringify({cwd:process.cwd(),head:g(['rev-parse','HEAD']),status:g(['status','--porcelain','--ignored']),ios:fs.existsSync('ios'),stray:fs.existsSync('stray.config.js'),a:fs.readFileSync('a.txt','utf8'),checkout:process.env.CANDIDATE_CHECKOUT}))`];
    const freshArgs = (...rest) => ['--repo', s.f.repo, '--receipt', s.f.receiptPath, '--fixes', s.f.fixesFile, ...rest];
    return { ...s, tmpRoot, seen, probe, freshArgs, opts: { ...quiet, tmpRoot } };
  };

  test('fresh mode builds from exactly the receipt SHA, whatever the caller has checked out, and removes the checkout', () => {
    const { f, tmpRoot, seen, probe, freshArgs, opts } = freshSetup();
    // The caller's checkout is on another commit and has a hot fix in a tracked file.
    f.git('checkout', '-q', '--detach', f.onlyA);
    f.write('scoresnap/a.txt', 'hot fix made on the build machine\n');
    assert.equal(runOnCandidate([...freshArgs(), '--', ...probe], opts), 0);
    const got = JSON.parse(fs.readFileSync(seen, 'utf8'));
    assert.equal(got.head, f.both);
    assert.equal(got.status, '');
    assert.equal(got.a.trim(), f.git("show", `${f.both}:scoresnap/a.txt`));
    assert.notEqual(got.a, "hot fix made on the build machine\n");
    assert.equal(got.cwd, path.join(got.checkout, 'scoresnap'));
    assert.equal(got.cwd.startsWith(fs.realpathSync(tmpRoot)), true);
    assert.equal(got.cwd.startsWith(fs.realpathSync(f.repo)), false);
    assert.equal(fs.readdirSync(tmpRoot).length, 0);
    assert.equal(f.git('worktree', 'list').split('\n').length, 1);
    // The caller's checkout was not touched.
    assert.equal(fs.readFileSync(path.join(f.repo, 'scoresnap/a.txt'), 'utf8'), 'hot fix made on the build machine\n');
  });

  test('fresh mode: a leftover ignored ios/ and a stray file in the caller checkout cannot reach the command', () => {
    const { f, seen, probe, freshArgs, opts } = freshSetup();
    fs.mkdirSync(path.join(f.repo, '.git', 'info'), { recursive: true });
    fs.writeFileSync(path.join(f.repo, '.git', 'info', 'exclude'), 'scoresnap/ios/\nscoresnap/node_modules/\n');
    f.write('scoresnap/ios/Stale.xcodeproj/project.pbxproj', 'TARGETED_DEVICE_FAMILY = "1,2";\n');
    f.write('scoresnap/node_modules/x/index.js', '1\n');
    f.write('scoresnap/stray.config.js', 'module.exports = {};\n');
    assert.equal(runOnCandidate([...freshArgs(), '--', ...probe], opts), 0);
    const got = JSON.parse(fs.readFileSync(seen, 'utf8'));
    assert.equal(got.ios, false);
    assert.equal(got.stray, false);
    assert.equal(got.status, '');
    assert.equal(got.head, f.both);
  });

  test('fresh mode removes the checkout when the command fails, and keeps it only with --keep', () => {
    const { f, tmpRoot, freshArgs, opts } = freshSetup();
    assert.equal(runOnCandidate([...freshArgs(), '--', 'node', '-e', 'process.exit(7)'], opts), 7);
    assert.equal(fs.readdirSync(tmpRoot).length, 0);
    const lines = [];
    assert.equal(runOnCandidate([...freshArgs('--keep'), '--', 'node', '-e', '0'], { ...opts, log: (l) => lines.push(l) }), 0);
    const kept = path.join(tmpRoot, fs.readdirSync(tmpRoot)[0], 'checkout');
    assert.equal(f.git('-C', kept, 'rev-parse', 'HEAD'), f.both);
    assert.match(lines.join('\n'), /KEPT: the fresh checkout is at /);
    f.git('worktree', 'remove', '--force', kept);
  });

  test('fresh mode refuses, makes no checkout and runs nothing without a valid receipt or the commit', () => {
    const { f, marker, tmpRoot, record, freshArgs, opts } = freshSetup();
    const original = fs.readFileSync(f.receiptPath, 'utf8');
    fs.writeFileSync(f.receiptPath, JSON.stringify({ ...JSON.parse(original), sha: 'f'.repeat(40) }));
    refused(() => runOnCandidate([...freshArgs(), '--', ...record], opts), /does not have commit f{40}; fetch it first/);
    fs.writeFileSync(f.receiptPath, original);
    fs.rmSync(`${f.receiptPath}.tests.txt`);
    refused(() => runOnCandidate([...freshArgs(), '--', ...record], opts), /test list .* is missing/);
    fs.rmSync(f.receiptPath);
    refused(() => runOnCandidate([...freshArgs(), '--', ...record], opts), /nothing may be built, archived or uploaded without one/);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.readdirSync(tmpRoot).length, 0);
    assert.equal(f.git('worktree', 'list').split('\n').length, 1);
  });

  test('--source warns every time that ignored paths are unchecked; fresh mode does not', () => {
    const { args, record, freshArgs, opts } = freshSetup();
    const warnings = [];
    assert.equal(runOnCandidate(args(...record), { ...opts, warn: (l) => warnings.push(l) }), 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /WARNING: --source uses an existing checkout .*Git-ignored paths .* are NOT checked/);
    assert.equal(runOnCandidate([...freshArgs(), '--', ...record], { ...opts, warn: (l) => warnings.push(l) }), 0);
    assert.equal(warnings.length, 1);
    refused(() => runOnCandidate([...freshArgs('--source', '.'), '--', 'true'], opts), /not both/);
  });
});
