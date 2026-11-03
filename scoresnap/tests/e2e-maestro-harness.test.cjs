/** Static contract for the native E2E harness (.maestro, aos-e2e/v1). Runs in plain Node; no simulator needed. */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const repo = path.resolve(__dirname, "..", "..");
const dir = path.join(repo, ".maestro");
const config = JSON.parse(fs.readFileSync(path.join(dir, "e2e.config.json"), "utf8"));
const eas = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "eas.json"), "utf8"));
const read = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");
const docs = (rel) => yaml.loadAll(read(rel));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

test("config shape, app id and build profiles match the app", () => {
  expect(config.schema).toBe("aos-e2e/v1");
  expect(config.product).toBe("snapscore");
  expect(config.evidenceRoot).toBe("aos-state/e2e/snapscore");
  const app = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "app.json"), "utf8"));
  expect(config.appId).toBe(app.expo.ios.bundleIdentifier);
  for (const [key, b] of Object.entries(config.builds)) {
    const profile = eas.build[b.easProfile];
    expect(profile).toBeDefined();
    expect(profile.ios && profile.ios.simulator).toBe(true);
    expect(profile.distribution).toBe("internal");
    expect(["online", "offline"]).toContain(key);
  }
  expect(eas.build[config.builds.offline.easProfile].env.EXPO_PUBLIC_OFFLINE_MODE).toBe("true");
});

test("every flow is listed once, exists, targets the app and names its ticket", () => {
  const listed = config.flows.map((f) => path.join(repo, f.file)).sort();
  const onDisk = walk(path.join(dir, "flows")).filter((f) => f.endsWith(".yaml")).sort();
  expect(listed).toEqual(onDisk);
  expect(new Set(config.flows.map((f) => f.id)).size).toBe(config.flows.length);
  for (const f of config.flows) {
    expect(Object.keys(config.builds)).toContain(f.build);
    expect(f.file).toBe(`.maestro/flows/${f.build}/${f.id}.yaml`);
    const text = read(f.file);
    const [header, steps] = docs(f.file);
    expect(header.appId).toBe(config.appId);
    expect(Array.isArray(steps)).toBe(true);
    const ticket = f.tickets[0];
    expect(f.id.startsWith(ticket.toLowerCase() + "-")).toBe(true);
    expect(text.split("\n")[0].startsWith(`# ${ticket}`)).toBe(true);
    const shots = steps.filter((s) => s && s.takeScreenshot).map((s) => s.takeScreenshot);
    expect(shots.length).toBeGreaterThan(0);
    for (const s of shots) expect(s).toMatch(new RegExp(`^${ticket.toLowerCase()}-\\d\\d-[a-z0-9-]+$`));
    if (f.fixture) expect(fs.existsSync(path.join(repo, config.fixtures[f.fixture].file))).toBe(true);
    if ("skipInAll" in f) expect(typeof f.skipInAll === "string" && f.skipInAll.length > 20).toBe(true);
  }
});

test("runFlow references resolve and subflows target the app", () => {
  for (const file of walk(dir).filter((f) => f.endsWith(".yaml"))) {
    const [header, steps] = yaml.loadAll(fs.readFileSync(file, "utf8"));
    expect(header.appId).toBe(config.appId);
    for (const s of steps || []) {
      if (!s || !s.runFlow) continue;
      const target = typeof s.runFlow === "string" ? s.runFlow : s.runFlow.file;
      if (target === undefined) expect(Array.isArray(s.runFlow.commands)).toBe(true); // inline conditional block
      else expect(fs.existsSync(path.resolve(path.dirname(file), target))).toBe(true);
    }
  }
});

test("flows carry no credentials, no outbound send steps, and no banned copy outside negative assertions", () => {
  for (const file of walk(dir)) {
    const text = fs.readFileSync(file, "utf8");
    expect(text).not.toMatch(/(password|secret|token|api[_-]?key|service_role|eyJ[a-zA-Z0-9]{10,})\s*[:=]/i);
    const lines = text.split("\n").filter((l) => !/assertNotVisible/.test(l));
    expect(lines.join("\n")).not.toMatch(/\b(bet|bets|betting|wager|wagers|gamble|gambling|payout|payouts|unlock)\b/i);
  }
  for (const f of config.flows) {
    const text = read(f.file);
    expect(text).not.toMatch(/tapOn:\s*"(Send|Mail|Messages|Post)"/);
    const writes = f.liveWrite !== undefined;
    expect(writes).toBe(f.id === "aug-259-guest-join");
  }
});

test("paid-tier fixture is the same persisted cache shape as the web fixture", () => {
  const fx = JSON.parse(read(config.fixtures["paid-tier"].file));
  expect(Object.keys(fx)).toEqual(["snapscore-scans"]);
  expect(JSON.parse(fx["snapscore-scans"])).toEqual({ state: { tier: "pro", isPro: true, isTD: false, scanMonth: "", scansUsed: 0 }, version: 1 });
  const { SCAN_STORAGE_KEY } = { SCAN_STORAGE_KEY: /SCAN_STORAGE_KEY = "([^"]+)"/.exec(fs.readFileSync(path.join(__dirname, "..", "src/stores/persisted-keys.ts"), "utf8"))[1] };
  expect(SCAN_STORAGE_KEY).toBe("snapscore-scans");
});

test("selectors used by flows exist in the app source", () => {
  const src = [...walk(path.join(__dirname, "..", "app")), ...walk(path.join(__dirname, "..", "src", "ui"))].filter((f) => f.endsWith(".tsx")).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const ids = new Set();
  for (const file of walk(dir).filter((f) => f.endsWith(".yaml"))) {
    for (const m of fs.readFileSync(file, "utf8").matchAll(/id:\s*"([^"]+)"/g)) ids.add(m[1]);
  }
  for (const id of ids) {
    const literal = src.includes(`testID="${id}"`);
    const templ = /^score-(minus|par|plus)-/.test(id) && src.includes(`testID={\`score-${id.split("-")[1]}-\${player.name}\`}`);
    expect([id, literal || templ]).toEqual([id, true]);
  }
});

test("workflow is manual-only, secret-free, and passes inputs through env", () => {
  const wf = read(".github/workflows/e2e-ios-sim.yml");
  const parsed = yaml.load(wf);
  expect(Object.keys(parsed.on)).toEqual(["workflow_dispatch"]);
  expect(wf).not.toMatch(/secrets\./);
  expect(parsed.permissions).toEqual({ contents: "read" });
  for (const step of parsed.jobs.maestro.steps) if (step.run) expect(step.run).not.toMatch(/\$\{\{/);
  expect(read(".maestro/scripts/run-ios-sim.sh")).toMatch(/lipo -archs/);
});


test("UX tee flow uses the offline fixture and captures the last row and pinned confirm", () => {
  const env = eas.build[config.builds.offline.easProfile].env;
  expect(env.EXPO_PUBLIC_FEATURE_COURSE_SEARCH).toBe("true");
  expect(env.EXPO_PUBLIC_E2E_COURSE_FIXTURE).toBe("true");
  const [, steps] = docs(".maestro/flows/offline/aug-429-ux-pass.yaml");
  expect(steps).toContainEqual({ inputText: "E2E Tee Course" });
  expect(steps).toContainEqual({ scrollUntilVisible: { element: "Tee 16", direction: "DOWN" } });
  const last = steps.findIndex(s => s.tapOn === "Tee 16");
  expect(steps[last + 1]).toEqual({ assertVisible: { id: "confirm-tees" } });
  expect(steps[last + 2].takeScreenshot).toBe("aug-429-14-pinned-confirm-last-row");
});
