/** AUG-1274: static contract for the shared-round four-identity reopen-recovery
 * harness. Runs in plain Node, no Supabase/docker/device involved; the live
 * run only happens on the disposable CI stack (see .github/workflows/xdevice-stack.yml).
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const repo = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(__dirname, "..", "e2e", "xdevice", "four-identities-reopen.mts");
const script = fs.readFileSync(scriptPath, "utf8");
const workflow = yaml.load(fs.readFileSync(path.join(repo, ".github", "workflows", "xdevice-stack.yml"), "utf8"));
const { validJoinCode } = require("../src/services/guest-join.ts");

test("the fixture join code passes the production six-character contract", () => {
  const codes = [...script.matchAll(/JOIN_CODE = '([^']+)'/g)].map((m) => m[1]);
  expect(codes.length).toBeGreaterThan(0);
  for (const code of codes) expect(validJoinCode(code)).toBe(true);
  // The harness also asserts this itself at runtime against the same production check.
  expect(script).toMatch(/assert\(validJoinCode\(JOIN_CODE\)/);
});

test("the reopen harness script exists and refuses non-loopback endpoints before any Auth/SQL/HTTP call", () => {
  expect(fs.existsSync(scriptPath)).toBe(true);
  const lines = script.split("\n");
  const guardLine = lines.findIndex((l) => l.includes("127.0.0.1") && l.includes("localhost"));
  expect(guardLine).toBeGreaterThan(-1);
  const firstNetworkLine = lines.findIndex((l) => l.includes("createClient(api") || l.includes("execFileSync('psql'"));
  expect(guardLine).toBeLessThan(firstNetworkLine);
});

test("the harness exercises four distinct disposable identities, reusing the production online-client/score-outbox stack", () => {
  expect(script).toMatch(/for \(let i = 0; i < 4; i\+\+\)/);
  expect(script).toMatch(/signInAnonymously/);
  expect(script).toMatch(/signUp/);
  expect(script).toMatch(/from '\.\.\/\.\.\/src\/services\/online-client'/);
  expect(script).toMatch(/from '\.\.\/\.\.\/src\/services\/score-outbox\.ts'|XDEVICE_OUTBOX_MODULE/);
});

test("covers host/join/approval/roster, distinct score edits, offline conflict/convergence and reopen recovery on every identity", () => {
  expect(script).toMatch(/PASS host\/join\/approval\/roster/);
  expect(script).toMatch(/PASS distinct player score edits/);
  expect(script).toMatch(/PASS offline conflict\/convergence/);
  expect(script).toMatch(/PASS reopen recovery/);
  // Reopen recovery must cover all four identities, not just one.
  expect(script).toMatch(/for \(let i = 0; i < 4; i\+\+\) \{\s*\n\s*const relaunchedAuth/);
  expect(script).toMatch(/refreshSession\(\{ refresh_token: users\[i\]\.refresh \}\)/);
});

test("records the tournament and league branch scope explicitly", () => {
  expect(script).toMatch(/rewritten-008/);
  expect(script).toMatch(/already covered end-to-end by e2e\/xdevice\/four-identities\.mts/);
  expect(script).toMatch(/lightweight-league candidate/);
  expect(script).toMatch(/explicitly OUT of scope/);
  expect(script).toMatch(/AUG-1273/);
});

test("the harness never writes to a non-loopback host and performs no live build/App Store action", () => {
  expect(script).not.toMatch(/eas\s+build|supabase\s+link|supabase\s+db\s+push|App Store Connect/i);
  expect(script).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)/);
});

test("a disposable CI job runs exactly this script, never against a device, and needs no proposed-migration overlay", () => {
  const job = workflow.jobs["xdevice-four-identities-reopen"];
  expect(job).toBeDefined();
  expect(job["runs-on"]).toBe("ubuntu-latest");
  const steps = job.steps;
  const runStep = steps.find((s) => s.run && s.run.includes("four-identities-reopen.mts"));
  expect(runStep).toBeDefined();
  expect(runStep.run).toBe("node --import tsx e2e/xdevice/four-identities-reopen.mts");
  for (const step of steps) {
    if (step.run) {
      expect(step.run).not.toMatch(/xcodebuild|simctl|maestro|ios-sim/i);
      expect(step.run).not.toMatch(/proposed\//);
    }
  }
});
