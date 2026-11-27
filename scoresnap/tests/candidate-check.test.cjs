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

const RELEASE_ENV = { EXPO_PUBLIC_FEATURE_COURSE_SEARCH: 'true', EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING: 'true', EXPO_PUBLIC_PRO_ENABLED: 'false', EXPO_PUBLIC_FEATURE_LEAGUES: 'false', EXPO_PUBLIC_FEATURE_NATIVE_LINKS: 'false' };
const SERVICES = { EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-not-real', EXPO_PUBLIC_REVENUECAT_APPLE_KEY: 'appl_not_real' };
function fixture({ version = '1.0.1', appVersionSource = 'remote' } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'candidate-check-test-'));
  dirs.push(repo);
  const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const write = (file, text) => { fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true }); fs.writeFileSync(path.join(repo, file), text); };
  const commit = (message) => { git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', message); return git('rev-parse', 'HEAD'); };
  git('init', '-q', '-b', 'main');
  write('scoresnap/app.json', JSON.stringify({ expo: { version, ios: { buildNumber: '1' } } }));
  write('scoresnap/eas.json', JSON.stringify({ cli: { appVersionSource }, build: { preview: {}, testflight: { env: RELEASE_ENV }, production: { env: { ...RELEASE_ENV } } } }));
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
  // DotBot's negative (AUG-1602 706aa05d): the replacement is a REAL commit that IS an ancestor of
  // the SHA, but is not the fix. The base, and the other fix, both qualify.
  withReceipt((r) => { r.fixes[0].as = f.base; }, /fix mapping is not the real one/);
  withReceipt((r) => { r.fixes[0].as = r.fixes[1].as; }, /fix mapping is not the real one/);
  withReceipt((r) => { [r.fixes[0].as, r.fixes[1].as] = [r.fixes[1].as, r.fixes[0].as]; }, /fix mapping is not the real one/);
  withReceipt((r) => { r.fixes[0].how = r.fixes[0].how === 'ancestor' ? 'identical-patch' : 'ancestor'; }, /fix mapping is not the real one/);
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
  assert.equal(doc.fixes.length, 5);
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
    const about = (pattern) => warnings.filter((l) => pattern.test(l)).length;
    assert.equal(about(/WARNING: --source uses an existing checkout .*Git-ignored paths .* are NOT checked/), 1);
    assert.equal(runOnCandidate([...freshArgs(), '--', ...record], { ...opts, warn: (l) => warnings.push(l) }), 0);
    assert.equal(about(/--source uses an existing checkout/), 1);
    refused(() => runOnCandidate([...freshArgs('--source', '.'), '--', 'true'], opts), /not both/);
  });

  test('a fresh checkout left by a dead wrapper is reported with its removal command and never deleted', () => {
    const { f, tmpRoot, record, freshArgs, opts } = freshSetup();
    const { spawnSync } = require('node:child_process');
    const deadPid = spawnSync('node', ['-e', '0']).pid;
    const leave = (name, owner, asWorktree) => {
      const holder = path.join(tmpRoot, name);
      fs.mkdirSync(holder);
      if (asWorktree) f.git('worktree', 'add', '-q', '--detach', path.join(holder, 'checkout'), f.both);
      else fs.mkdirSync(path.join(holder, 'checkout'));
      if (owner) fs.writeFileSync(path.join(holder, 'owner.json'), JSON.stringify(owner));
      fs.writeFileSync(path.join(holder, 'checkout', 'archive-output.txt'), 'must survive\n');
      return holder;
    };
    const all = [
      leave('snapscore-candidate-dead', { tool: 'run-on-candidate', pid: deadPid, startedAt: 'earlier' }, true),
      leave('snapscore-candidate-kept', { tool: 'run-on-candidate', pid: deadPid, startedAt: 'earlier', kept: true }, true),
      leave('snapscore-candidate-live', { tool: 'run-on-candidate', pid: process.pid, startedAt: 'now' }),
      leave('snapscore-candidate-noowner', null),
      leave('some-other-directory', { tool: 'run-on-candidate', pid: deadPid }),
    ];
    const lines = [];
    assert.equal(runOnCandidate([...freshArgs(), '--', ...record], { ...opts, log: (l) => lines.push(l) }), 0);
    for (const holder of all) assert.equal(fs.readFileSync(path.join(holder, 'checkout', 'archive-output.txt'), 'utf8'), 'must survive\n', holder);
    assert.equal(f.git('worktree', 'list').split('\n').length, 3);
    const out = lines.join('\n');
    assert.match(out, new RegExp(`LEFT BEHIND: .*snapscore-candidate-dead/checkout \\(its wrapper, pid ${deadPid}.*NOT removed.*worktree remove --force`));
    assert.match(out, /KEPT EARLIER: .*snapscore-candidate-kept\/checkout .*Not touched/);
    assert.doesNotMatch(out, /snapscore-candidate-(live|noowner)|some-other-directory/);
    assert.doesNotMatch(out, /REMOVED/);
  });

  test('two real runs: what the first keeps with --keep is still there, with its output, after the second', () => {
    const { f, tmpRoot } = freshSetup();
    const { spawnSync } = require('node:child_process');
    const cli = path.join(__dirname, '..', 'scripts', 'release', 'run-on-candidate.cjs');
    let extra = {};
    const real = (...rest) => spawnSync('node', [cli, '--repo', f.repo, '--receipt', f.receiptPath, '--fixes', f.fixesFile, ...rest], { encoding: 'utf8', env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(EXPO_PUBLIC_|APP_VARIANT)/.test(k))), TMPDIR: tmpRoot, ...extra } });
    // The command writes an .xcarchive, so it is an archive: without a profile it is refused outright.
    const bare = real('--keep', '--', 'node', '-e', "require('fs').writeFileSync('SnapScore.xcarchive','archive bytes')");
    assert.equal(bare.status, 1);
    assert.match(bare.stderr, /REFUSED: an archive or an upload must name its release profile/);
    // With a profile but no service configuration in the shell, the real CLI still refuses.
    const noServices = real('--keep', '--profile', 'testflight', '--', 'node', '-e', "require('fs').writeFileSync('SnapScore.xcarchive','x')");
    assert.equal(noServices.status, 1);
    assert.match(noServices.stderr, /REFUSED: service configuration is missing from this environment/);
    // Refused before its command started: nothing to keep, so no checkout is left behind even with --keep.
    assert.equal(fs.readdirSync(tmpRoot).filter((n) => n.startsWith('snapscore-candidate-')).length, 0);
    assert.equal(f.git('worktree', 'list').split('\n').length, 1);
    extra = SERVICES;
    const one = real('--keep', '--profile', 'testflight', '--', 'node', '-e', "require('fs').writeFileSync('SnapScore.xcarchive','archive bytes')");
    assert.equal(one.status, 0, one.stderr);
    const kept = one.stdout.match(/KEPT: the fresh checkout is at (\S+?)\. /)[1];
    const archive = path.join(kept, 'scoresnap', 'SnapScore.xcarchive');
    assert.equal(fs.readFileSync(archive, 'utf8'), 'archive bytes');
    // The first wrapper process has exited. A second and a third real run must not remove what it kept.
    for (const flags of [[], ['--keep']]) {
      const next = real(...flags, '--', 'node', '-e', '0');
      assert.equal(next.status, 0, next.stderr);
      assert.doesNotMatch(next.stdout + next.stderr, /REMOVED/);
      assert.match(next.stdout, /KEPT EARLIER: /);
      assert.equal(fs.readFileSync(archive, 'utf8'), 'archive bytes');
      assert.equal(f.git('-C', kept, 'rev-parse', 'HEAD'), f.both);
    }
    assert.equal(fs.readdirSync(tmpRoot).filter((n) => n.startsWith('snapscore-candidate-')).length, 2);
  });

  test('each admitted run leaves a build record beside the receipt, outside the checkout', () => {
    const { f, seen, probe, freshArgs, opts } = freshSetup();
    const records = () => fs.readdirSync(path.dirname(f.receiptPath)).filter((n) => n.startsWith(`${path.basename(f.receiptPath)}.build-`)).sort();
    const lines = [];
    assert.equal(runOnCandidate([...freshArgs(), '--', ...probe], { ...opts, log: (l) => lines.push(l) }), 0);
    assert.equal(records().length, 1);
    const file = path.join(path.dirname(f.receiptPath), records()[0]);
    const r = JSON.parse(fs.readFileSync(file, 'utf8'));
    const got = JSON.parse(fs.readFileSync(seen, 'utf8'));
    assert.equal(r.schema, 'snapscore-build-record/1');
    assert.equal(r.sha, f.both);
    assert.equal(r.tree, f.git('rev-parse', `${f.both}^{tree}`));
    assert.equal(r.mode, 'fresh-checkout');
    assert.equal(r.checkout, got.checkout);
    assert.equal(file.startsWith(r.checkout), false);
    assert.equal(r.exitCode, 0);
    assert.equal(r.command[0], 'node');
    assert.equal(r.environment.node, process.version);
    assert.equal(r.environment.platform, process.platform);
    if (process.platform !== 'darwin') { assert.equal(r.environment.xcode, null); assert.equal(r.environment.macOS, null); }
    assert.equal(Date.parse(r.startedAt) <= Date.parse(r.endedAt), true);
    for (const key of ['freeGbBefore', 'freeGbAfterCommand', 'freeGbAfterCleanup', 'usedGbByCommand']) assert.equal(typeof r[key], 'number', key);
    assert.match(r.toolSha256, /^[0-9a-f]{64}$/);
    assert.match(lines.join('\n'), /BUILD RECORD: .* \(exit 0, free GB /);
    // A failing command is recorded with its exit code; a refusal leaves no record.
    assert.equal(runOnCandidate([...freshArgs(), '--', 'node', '-e', 'process.exit(7)'], opts), 7);
    assert.equal(records().length, 2);
    const codes = records().map((n) => JSON.parse(fs.readFileSync(path.join(path.dirname(f.receiptPath), n), 'utf8')).exitCode).sort();
    assert.equal(codes.join(','), '0,7');
    fs.rmSync(`${f.receiptPath}.tests.txt`);
    refused(() => runOnCandidate([...freshArgs(), '--', 'node', '-e', '0'], opts), /test list .* is missing/);
    assert.equal(records().length, 2);
  });

  test('the build record carries Xcode and macOS versions on a Mac and nulls elsewhere', () => {
    const { buildEnvironment } = require('../scripts/release/run-on-candidate.cjs');
    const answers = { 'sw_vers -productVersion': '15.6', 'sw_vers -buildVersion': '24G84', 'xcodebuild -version': 'Xcode 16.4\nBuild version 16F6', 'xcode-select -p': '/Applications/Xcode.app/Contents/Developer', 'npm --version': '10.9.0' };
    const run = (cmd, a) => { const k = `${cmd} ${a.join(' ')}`; if (!(k in answers)) throw new Error('missing'); return answers[k]; };
    const mac = buildEnvironment({ platform: 'darwin', run });
    assert.equal(mac.macOS, '15.6');
    assert.equal(mac.xcode, 'Xcode 16.4 / Build version 16F6');
    assert.equal(mac.npm, '10.9.0');
    const linux = buildEnvironment({ platform: 'linux', run });
    assert.equal(linux.xcode, null);
    assert.equal(linux.macOS, null);
    assert.equal(linux.xcodePath, null);
    // A Mac where Xcode is not installed records null, it does not throw.
    assert.equal(buildEnvironment({ platform: 'darwin', run: () => { throw new Error('not found'); } }).xcode, null);
  });

  // --profile: the release flags the command runs with are the named eas.json profile's, or nothing runs.
  const flagSetup = () => {
    const s = freshSetup();
    const seenEnv = path.join(path.dirname(s.f.receiptPath), 'env.json');
    const dump = ['node', '-e', `require('fs').writeFileSync(${JSON.stringify(seenEnv)}, JSON.stringify(Object.fromEntries(Object.entries(process.env).filter(([k]) => /^(EXPO_PUBLIC_|APP_VARIANT)/.test(k)))))`];
    const bare = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(EXPO_PUBLIC_|APP_VARIANT)/.test(k)));
    // A release shell: no flags, but the service configuration a hand build needs.
    const clean = { ...bare, ...SERVICES };
    const go = (env, ...flags) => runOnCandidate([...s.freshArgs(...flags), '--', ...dump], { ...s.opts, env: { ...clean, ...env } });
    const records = () => fs.readdirSync(path.dirname(s.f.receiptPath)).filter((n) => n.includes('.build-')).sort().map((n) => JSON.parse(fs.readFileSync(path.join(path.dirname(s.f.receiptPath), n), 'utf8')));
    return { ...s, seenEnv, go, records, clean, bare };
  };

  test('--profile starts the command with exactly the profile flags and records them', () => {
    const { seenEnv, go, records } = flagSetup();
    // Nothing set by the caller: the wrapper supplies every flag.
    assert.equal(go({}, '--profile', 'testflight'), 0);
    assert.equal(JSON.stringify(Object.entries(JSON.parse(fs.readFileSync(seenEnv, 'utf8'))).sort()), JSON.stringify(Object.entries({ ...RELEASE_ENV, ...SERVICES }).sort()));
    // The caller already exported the same values: still admitted.
    assert.equal(go({ ...RELEASE_ENV }, '--profile', 'production'), 0);
    const [first, second] = records();
    assert.equal(first.releaseFlags.checked, true);
    assert.equal(first.releaseFlags.profile, 'testflight');
    assert.equal(JSON.stringify(first.releaseFlags.values), JSON.stringify(Object.fromEntries(Object.entries(RELEASE_ENV).sort())));
    assert.equal(first.releaseFlags.setByWrapper.length, 5);
    assert.match(first.releaseFlags.easJsonSha256, /^[0-9a-f]{64}$/);
    // Flags are recorded by value; service configuration by fingerprint only, never by value.
    for (const [name, value] of Object.entries(RELEASE_ENV)) assert.equal(first.buildVariables[name], value);
    for (const [name, value] of Object.entries(SERVICES)) {
      assert.match(first.buildVariables[name], /^sha256:[0-9a-f]{12}$/);
      assert.equal(JSON.stringify(first).includes(value), false, name);
    }
    assert.deepEqual(Object.keys(first.releaseFlags.services.set), Object.keys(SERVICES).sort());
    assert.equal(first.releaseFlags.services.suppliedBy, 'this environment');
    assert.ok(first.releaseFlags.services.notSet.includes('EXPO_PUBLIC_GOOGLE_CLIENT_ID'));
    assert.equal(second.releaseFlags.profile, 'production');
    assert.equal(second.releaseFlags.alreadySet.length, 5);
  });

  test('--profile refuses, and runs nothing, when a flag differs or a stray build variable is set', () => {
    const { f, seenEnv, go, records, tmpRoot } = flagSetup();
    // PRO switched on in the shell: the paywall would be live in a build that was tested with it off.
    refused(() => go({ EXPO_PUBLIC_PRO_ENABLED: 'true' }, '--profile', 'testflight'), /EXPO_PUBLIC_PRO_ENABLED is "true" here but "false" in the testflight profile/);
    refused(() => go({ EXPO_PUBLIC_FEATURE_LEAGUES: '' }, '--profile', 'testflight'), /EXPO_PUBLIC_FEATURE_LEAGUES is "" here/);
    // A variable the profile does not have at all (left over from a simulator build).
    refused(() => go({ EXPO_PUBLIC_OFFLINE_MODE: 'true' }, '--profile', 'production'), /EXPO_PUBLIC_OFFLINE_MODE is set here \("true"\); it makes a test or simulator build and is never allowed in a release build/);
    refused(() => go({ APP_VARIANT: 'development' }, '--profile', 'production'), /APP_VARIANT is set here/);
    // A profile that is not a release profile, or has no env block.
    refused(() => go({}, '--profile', 'preview'), /--profile must be one of: testflight, production/);
    assert.equal(fs.existsSync(seenEnv), false);
    assert.equal(records().length, 0);
    assert.equal(fs.readdirSync(tmpRoot).length, 0);
    assert.equal(f.git('worktree', 'list').split('\n').length, 1);
  });

  test('the flags are read from the eas.json of the SHA being built, not the caller checkout', () => {
    const { f, seenEnv, go } = flagSetup();
    // The caller's checkout has an edited eas.json that turns PRO on. The receipt SHA does not.
    f.write('scoresnap/eas.json', JSON.stringify({ cli: {}, build: { testflight: { env: { ...RELEASE_ENV, EXPO_PUBLIC_PRO_ENABLED: 'true' } } } }));
    assert.equal(go({}, '--profile', 'testflight'), 0);
    assert.equal(JSON.parse(fs.readFileSync(seenEnv, 'utf8')).EXPO_PUBLIC_PRO_ENABLED, 'false');
  });

  test('without --profile nothing is checked, it warns, and the record says so and lists what was set', () => {
    const { seenEnv, go, records, opts, freshArgs, clean } = flagSetup();
    const warnings = [];
    assert.equal(runOnCandidate([...freshArgs(), '--', 'node', '-e', '0'], { ...opts, env: { ...clean, EXPO_PUBLIC_PRO_ENABLED: 'true' }, warn: (l) => warnings.push(l) }), 0);
    assert.match(warnings.join('\n'), /WARNING: no --profile given \(allowed only for tests and simulator builds\)\. The release feature flags are NOT checked/);
    const [record] = records();
    assert.equal(record.releaseFlags.checked, false);
    assert.equal(record.buildVariables.EXPO_PUBLIC_PRO_ENABLED, 'true');
    assert.match(record.buildVariables.EXPO_PUBLIC_SUPABASE_URL, /^sha256:/);
    assert.equal(fs.existsSync(seenEnv), false);
    assert.equal(go({ EXPO_PUBLIC_PRO_ENABLED: 'true' }), 0);
    assert.equal(JSON.parse(fs.readFileSync(seenEnv, 'utf8')).EXPO_PUBLIC_PRO_ENABLED, 'true');
  });

  test('an archive or an upload is refused without --profile; tests and simulator builds are not', () => {
    const { f, seenEnv, freshArgs, opts, clean, records, tmpRoot } = flagSetup();
    const attempt = (flags, ...command) => runOnCandidate([...freshArgs(...flags), '--', ...command], { ...opts, env: clean });
    const ok = ['node', '-e', '0'];
    // Stated by the caller.
    refused(() => attempt(['--purpose', 'archive'], ...ok), /an archive or an upload must name its release profile/);
    refused(() => attempt(['--purpose', 'upload'], ...ok), /must name its release profile/);
    refused(() => attempt(['--purpose', 'release'], ...ok), /--purpose must be one of/);
    // Not stated: read from the command's own words.
    for (const command of [
      ['xcodebuild', '-workspace', 'SnapScore.xcworkspace', '-scheme', 'SnapScore', 'archive', '-archivePath', '/out/SnapScore.xcarchive'],
      ['sh', '-c', 'npm ci && npx expo prebuild --platform ios && xcodebuild -scheme SnapScore archive'],
      ['xcodebuild', '-exportArchive', '-archivePath', 'a', '-exportPath', 'b'],
      ['xcrun', 'altool', '--upload-app', '-f', 'SnapScore.ipa'],
      ['npx', 'eas', 'build', '--platform', 'ios', '--local'],
      ['npx', 'eas', 'build', '--platform', 'ios', '--profile', 'testflight'],
      ['npx', 'eas', 'submit', '--platform', 'ios'],
      ['bash', 'eas_run.sh', 'upload'],
    ]) refused(() => attempt([], ...command), /must name its release profile .*the command contains "/);
    // Saying "simulator" does not get an archive command through.
    refused(() => attempt(['--purpose', 'simulator'], 'xcodebuild', '-scheme', 'SnapScore', 'archive'), /--purpose simulator was given, but the command contains "archive"/);
    refused(() => attempt(['--purpose', 'test'], 'xcrun', 'altool', '--upload-app'), /--purpose test was given, but the command contains/);
    assert.equal(records().length, 0);
    assert.equal(fs.readdirSync(tmpRoot).length, 0);
    assert.equal(f.git('worktree', 'list').split('\n').length, 1);
    // Allowed without a profile: a test run, a simulator build, an eas simulator build (not started here, only parsed).
    assert.equal(attempt(['--purpose', 'simulator'], ...ok), 0);
    assert.equal(attempt(['--purpose', 'test'], ...ok), 0);
    assert.equal(attempt([], ...ok), 0);
    const { looksLikeStoreCommand } = require('../scripts/release/run-on-candidate.cjs');
    assert.equal(looksLikeStoreCommand(['npx', 'eas', 'build', '--profile', 'simulator', '--platform', 'ios']), null);
    assert.equal(looksLikeStoreCommand(['xcodebuild', '-scheme', 'SnapScore', '-destination', 'generic/platform=iOS Simulator', 'build']), null);
    assert.equal(looksLikeStoreCommand(['npx', 'jest']), null);
    assert.equal(records().map((r) => r.purpose).join(','), 'simulator,test,not stated');
    // With the profile, the archive purpose is admitted and recorded.
    assert.equal(attempt(['--purpose', 'archive', '--profile', 'production'], ...ok), 0);
    const last = records().at(-1);
    assert.equal(last.purpose, 'archive');
    assert.equal(last.releaseFlags.profile, 'production');
    assert.equal(fs.existsSync(seenEnv), false);
  });

  test('--profile refuses a release profile that does not define all five release flags', () => {
    const { f, freshArgs, opts, clean } = flagSetup();
    const { REQUIRED_RELEASE_FLAGS, releaseFlags } = require('../scripts/release/run-on-candidate.cjs');
    assert.equal(REQUIRED_RELEASE_FLAGS.length, 5);
    // The shape main has today: only course search and PRO in the profile.
    const app = path.join(path.dirname(f.receiptPath), 'two-flags');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'eas.json'), JSON.stringify({ build: { testflight: { env: { EXPO_PUBLIC_FEATURE_COURSE_SEARCH: 'true', EXPO_PUBLIC_PRO_ENABLED: 'false' } } } }));
    refused(() => releaseFlags({ app, profile: 'testflight', env: {} }), /does not define every release flag; missing: EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING, EXPO_PUBLIC_FEATURE_LEAGUES, EXPO_PUBLIC_FEATURE_NATIVE_LINKS\. Do not build from it/);
    for (const name of REQUIRED_RELEASE_FLAGS) {
      const env = { ...RELEASE_ENV }; delete env[name];
      fs.writeFileSync(path.join(app, 'eas.json'), JSON.stringify({ build: { production: { env } } }));
      refused(() => releaseFlags({ app, profile: 'production', env: {} }), new RegExp(`missing: ${name}\\.`));
    }
    assert.equal(runOnCandidate([...freshArgs('--profile', 'testflight'), '--', 'node', '-e', '0'], { ...opts, env: clean }), 0);
  });

  test('a hand-made release build without the service configuration is refused; eas build is not', () => {
    const { f, seenEnv, freshArgs, opts, bare, clean, records, tmpRoot } = flagSetup();
    const { SERVICE_REQUIRED } = require('../scripts/release/run-on-candidate.cjs');
    assert.deepEqual(SERVICE_REQUIRED, ['EXPO_PUBLIC_REVENUECAT_APPLE_KEY', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_URL']);
    const attempt = (env, ...command) => runOnCandidate([...freshArgs('--purpose', 'archive', '--profile', 'testflight'), '--', ...command], { ...opts, env });
    const ok = ['node', '-e', '0'];
    // Nothing exported: the app would build with no sign-in and no purchases.
    refused(() => attempt(bare, ...ok), /service configuration is missing from this environment: EXPO_PUBLIC_REVENUECAT_APPLE_KEY, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SUPABASE_URL\. A build made without it has no sign-in and no purchases/);
    // Each one missing, or empty, by itself.
    for (const name of SERVICE_REQUIRED) {
      const env = { ...clean }; delete env[name];
      refused(() => attempt(env, ...ok), new RegExp(`is missing from this environment: ${name}\\.`));
      refused(() => attempt({ ...clean, [name]: '' }, ...ok), new RegExp(`is missing from this environment: ${name}\\.`));
    }
    assert.equal(records().length, 0);
    assert.equal(fs.readdirSync(tmpRoot).length, 0);
    assert.equal(f.git('worktree', 'list').split('\n').length, 1);
    // With them: admitted. Optional service configuration is allowed and recorded by fingerprint.
    assert.equal(attempt({ ...clean, EXPO_PUBLIC_GOOGLE_CLIENT_ID: 'client-id-not-real', EXPO_PUBLIC_POSTHOG_HOST: 'https://eu.posthog.example' }, ...ok), 0);
    const hand = records().at(-1);
    assert.deepEqual(Object.keys(hand.releaseFlags.services.set), ['EXPO_PUBLIC_GOOGLE_CLIENT_ID', 'EXPO_PUBLIC_POSTHOG_HOST', ...SERVICE_REQUIRED].sort());
    assert.equal(JSON.stringify(hand).includes('client-id-not-real'), false);
    // The test-only switches are still refused in a release build, by name and with the reason.
    for (const name of ['EXPO_PUBLIC_SIMULATOR_NO_MLKIT', 'EXPO_PUBLIC_OFFLINE_MODE', 'EXPO_PUBLIC_DEMO_MODE', 'EXPO_PUBLIC_E2E_COURSE_FIXTURE'])
      refused(() => attempt({ ...clean, [name]: '1' }, ...ok), new RegExp(`${name} is set here \\("1"\\); it makes a test or simulator build and is never allowed in a release build`));
    refused(() => attempt({ ...clean, EXPO_PUBLIC_SOMETHING_NEW: 'x' }, ...ok), /EXPO_PUBLIC_SOMETHING_NEW is set here \("x"\) but is not in the testflight profile and is not known service configuration/);
    // `eas build` takes the service configuration from the EAS environment, so its absence here is
    // not a refusal. (The command is only parsed; `eas` is not installed, so it is not started.)
    const { releaseFlags } = require('../scripts/release/run-on-candidate.cjs');
    const app = path.join(path.dirname(f.receiptPath), 'eas-app');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'eas.json'), JSON.stringify({ build: { testflight: { environment: 'production', env: RELEASE_ENV } } }));
    const viaEas = releaseFlags({ app, profile: 'testflight', env: {}, command: ['npx', 'eas', 'build', '--platform', 'ios', '--profile', 'testflight', '--local'] });
    assert.equal(viaEas.services.suppliedBy, 'eas (environment production)');
    refused(() => releaseFlags({ app, profile: 'testflight', env: {}, command: ['xcodebuild', 'archive'] }), /takes it from the EAS environment "production"; a build made by hand must export the same values/);
    assert.equal(fs.existsSync(seenEnv), false);
  });

  test('a service setting that is blank, padded or a placeholder is refused, and its value is never printed', () => {
    const { f, freshArgs, opts, clean, records, tmpRoot } = flagSetup();
    const { SERVICE_REQUIRED, SERVICE_OPTIONAL, releaseFlags } = require('../scripts/release/run-on-candidate.cjs');
    const attempt = (env, ...command) => runOnCandidate([...freshArgs('--purpose', 'archive', '--profile', 'testflight'), '--', ...command], { ...opts, env });
    const ok = ['node', '-e', '0'];
    // Whitespace only: it is "set", and the app would treat it as configured.
    for (const name of SERVICE_REQUIRED)
      for (const blank of [' ', '   ', '\t', '\n', ' \t\r\n ', ' ', '​', '﻿'])
        refused(() => attempt({ ...clean, [name]: blank }, ...ok), new RegExp(`service configuration is not usable: ${name} is blank \\(only spaces or invisible characters\\)`));
    // Placeholders: the app's own fallbacks, template text, and the words a tool prints for "nothing".
    for (const name of SERVICE_REQUIRED)
      for (const fake of ['https://your-project.supabase.co', 'your-anon-key', 'YOUR_API_KEY', 'undefined', 'null', 'None', 'changeme', 'CHANGE_ME', 'placeholder', 'TODO', 'xxx', 'XXXXXXXX', '...', '<key>', '${SUPABASE_URL}', '$EXPO_PUBLIC_SUPABASE_URL', '""', "''", 'false', '0', 'REPLACE_ME', 'dummy', 'test', 'example'])
        refused(() => attempt({ ...clean, [name]: fake }, ...ok), new RegExp(`service configuration is not usable: ${name} is a placeholder, not a real value`));
    // A real-looking value with a space or newline stuck to it: the app does not trim, so it would fail at run time.
    for (const name of SERVICE_REQUIRED)
      for (const padded of [' appl_realLookingValue1234', 'appl_realLookingValue1234 ', 'appl_realLookingValue1234\n', '"appl_realLookingValue1234"', 'appl_real Looking'])
        refused(() => attempt({ ...clean, [name]: padded }, ...ok), new RegExp(`service configuration is not usable: ${name} has (spaces|quotes) `));
    // An optional setting may be absent or empty, but if it is given it must be usable too:
    // a blank Google client id shows "Continue with Google" and the button fails.
    for (const name of SERVICE_OPTIONAL) {
      refused(() => attempt({ ...clean, [name]: '  ' }, ...ok), new RegExp(`service configuration is not usable: ${name} is blank`));
      refused(() => attempt({ ...clean, [name]: 'undefined' }, ...ok), new RegExp(`service configuration is not usable: ${name} is a placeholder`));
    }
    // Several at once are all named, and no value is echoed back.
    try { attempt({ ...clean, EXPO_PUBLIC_SUPABASE_URL: ' ', EXPO_PUBLIC_REVENUECAT_APPLE_KEY: 'appl_secretLookingValue9 ', EXPO_PUBLIC_GOOGLE_CLIENT_ID: 'changeme' }, ...ok); assert.fail('not refused'); }
    catch (e) {
      assert.match(e.message, /EXPO_PUBLIC_GOOGLE_CLIENT_ID is a placeholder.*EXPO_PUBLIC_REVENUECAT_APPLE_KEY has spaces.*EXPO_PUBLIC_SUPABASE_URL is blank/s);
      assert.equal(e.message.includes('appl_secretLookingValue9'), false);
    }
    // Nothing ran, nothing was recorded, nothing was left.
    assert.equal(records().length, 0);
    assert.equal(fs.readdirSync(tmpRoot).length, 0);
    assert.equal(f.git('worktree', 'list').split('\n').length, 1);
    // An `eas build` does not need them locally, but an unusable one in the shell is still refused.
    const app = path.join(path.dirname(f.receiptPath), 'eas-app-2');
    fs.mkdirSync(app);
    fs.writeFileSync(path.join(app, 'eas.json'), JSON.stringify({ build: { testflight: { environment: 'production', env: RELEASE_ENV } } }));
    const easBuild = ['npx', 'eas', 'build', '--platform', 'ios', '--profile', 'testflight'];
    refused(() => releaseFlags({ app, profile: 'testflight', env: { EXPO_PUBLIC_GOOGLE_CLIENT_ID: ' ' }, command: easBuild }), /EXPO_PUBLIC_GOOGLE_CLIENT_ID is blank/);
    // An empty optional setting counts as not set, as before.
    const fine = releaseFlags({ app, profile: 'testflight', env: { ...SERVICES, EXPO_PUBLIC_GOOGLE_CLIENT_ID: '' }, command: ['xcodebuild', 'archive'] });
    assert.ok(fine.services.notSet.includes('EXPO_PUBLIC_GOOGLE_CLIENT_ID'));
    // Real-shaped values pass: a URL, a JWT-shaped key, a RevenueCat-shaped key, a Google client id.
    const real = { EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJl', EXPO_PUBLIC_REVENUECAT_APPLE_KEY: 'appl_AbCdEfGhIjKlMnOpQrStUvWxYz', EXPO_PUBLIC_GOOGLE_CLIENT_ID: '123456789012-abcdefghijklmnop.apps.googleusercontent.com' };
    assert.deepEqual(Object.keys(releaseFlags({ app, profile: 'testflight', env: real, command: ['xcodebuild', 'archive'] }).services.set), Object.keys(real).sort());
  });

  test('every EXPO_PUBLIC variable the app reads is sorted into a release flag, service configuration or a test-only switch', () => {
    const { REQUIRED_RELEASE_FLAGS, SERVICE_REQUIRED, SERVICE_OPTIONAL, TEST_ONLY } = require('../scripts/release/run-on-candidate.cjs');
    const known = new Set([...REQUIRED_RELEASE_FLAGS, ...SERVICE_REQUIRED, ...SERVICE_OPTIONAL, ...TEST_ONLY]);
    assert.equal(known.size, REQUIRED_RELEASE_FLAGS.length + SERVICE_REQUIRED.length + SERVICE_OPTIONAL.length + TEST_ONLY.length);
    const root = path.join(__dirname, '..');
    const found = new Set();
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js)$/.test(entry.name) && !/\.test\./.test(entry.name)) for (const m of fs.readFileSync(full, 'utf8').matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) found.add(m[0]);
      }
    };
    walk(path.join(root, 'app')); walk(path.join(root, 'src'));
    for (const file of ['app.config.js', 'react-native.config.js']) if (fs.existsSync(path.join(root, file))) for (const m of fs.readFileSync(path.join(root, file), 'utf8').matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) found.add(m[0]);
    assert.ok(found.size >= 10, `expected the app's variables, found ${found.size}`);
    assert.deepEqual([...found].filter((name) => !known.has(name)).sort(), []);
  });
});
