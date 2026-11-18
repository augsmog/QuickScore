/** AUG-1273: static contract for the M9 league four-identity harness.
 * Runs in plain Node, no Supabase/docker/device involved; the live run only
 * happens on the disposable CI stack (see .github/workflows/xdevice-stack.yml).
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const repo = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(__dirname, "..", "e2e", "xdevice", "four-identities-league.mts");
const script = fs.readFileSync(scriptPath, "utf8");
const workflow = yaml.load(fs.readFileSync(path.join(repo, ".github", "workflows", "xdevice-stack.yml"), "utf8"));

test("the league harness script exists and refuses non-loopback endpoints before any Auth/SQL/HTTP call", () => {
  expect(fs.existsSync(scriptPath)).toBe(true);
  const lines = script.split("\n");
  const guardLine = lines.findIndex((l) => l.includes("127.0.0.1") && l.includes("localhost"));
  expect(guardLine).toBeGreaterThan(-1);
  // The guard must run before any network identity/SQL call is constructed.
  const firstNetworkLine = lines.findIndex((l) => l.includes("createClient(api") || l.includes("execFileSync('psql'"));
  expect(guardLine).toBeLessThan(firstNetworkLine);
});

test("the harness exercises four distinct disposable identities, not two", () => {
  expect(script).toMatch(/for \(let i = 0; i < 4; i\+\+\)/);
  expect(script).toMatch(/signInAnonymously/);
  expect(script).toMatch(/signUp/);
});

test("every league RPC named in the M9 candidate migration is exercised by the harness", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "supabase", "proposed", "20261103150000_lightweight_leagues.sql"), "utf8");
  const defined = [...migration.matchAll(/CREATE FUNCTION public\.(\w+)\(/g)].map((m) => m[1]);
  const exercised = ["create_league", "link_league_event", "map_league_event_player", "list_league_roster",
    "request_league_event_join", "list_my_leagues", "list_league_events"];
  for (const name of exercised) {
    expect(defined).toContain(name);
    expect(script).toContain(`'${name}'`);
  }
});

test("covers before-approval isolation, event-specific approval/mapping, mapped score sync, offline-reconnect-exactly-once and relaunch recovery", () => {
  expect(script).toMatch(/PASS before-approval isolation/);
  expect(script).toMatch(/PASS event-specific approval and player mapping/);
  expect(script).toMatch(/PASS mapped score synchronization/);
  expect(script).toMatch(/PASS offline reconnect exactly-once convergence/);
  expect(script).toMatch(/PASS relaunch membership recovery/);
  // Exactly-once: the dropped-ack path must be retried with the durable
  // outbox entry (replay called twice on the one enqueued entry), and the
  // net new score_events row count for that write must be exactly 1.
  expect(script.match(/box1\.replay\(\)/g).length).toBe(2);
  expect(script).toMatch(/box1\.enqueue\(/);
  expect(script).toMatch(/Number\(after\) - Number\(before\), 1/);
});

test("the harness never writes to a non-loopback host and performs no live build/App Store/Supabase-project action", () => {
  expect(script).not.toMatch(/eas\s+build|supabase\s+link|supabase\s+db\s+push|App Store Connect/i);
  expect(script).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)/);
});

test("a disposable CI job runs exactly this script against the proposed M9 migration, never against a device", () => {
  const job = workflow.jobs["xdevice-four-identities-league"];
  expect(job).toBeDefined();
  expect(job["runs-on"]).toBe("ubuntu-latest");
  const steps = job.steps;
  const migrationStep = steps.find((s) => s.run && s.run.includes("lightweight_leagues.sql"));
  expect(migrationStep).toBeDefined();
  const runStep = steps.find((s) => s.run && s.run.includes("four-identities-league.mts"));
  expect(runStep).toBeDefined();
  expect(runStep.run).toBe("node --import tsx e2e/xdevice/four-identities-league.mts");
  for (const step of steps) if (step.run) expect(step.run).not.toMatch(/xcodebuild|simctl|maestro|ios-sim/i);
});
