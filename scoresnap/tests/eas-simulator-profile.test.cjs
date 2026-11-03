const fs = require("node:fs");
const path = require("node:path");

const eas = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "eas.json"), "utf8"));

test("simulator profile builds an iOS simulator app against the production environment", () => {
  const sim = eas.build.simulator;
  expect(sim).toBeDefined();
  expect(sim.ios && sim.ios.simulator).toBe(true);
  expect(sim.environment).toBe("production");
  expect(sim.distribution).toBe("internal");
  // Never a store build, never auto-incremented, never on an update channel.
  expect(sim.autoIncrement).toBeUndefined();
  expect(sim.channel).toBeUndefined();
});

test("store profiles are unchanged by the simulator profile", () => {
  expect(eas.build.testflight.distribution).toBe("store");
  expect(eas.build.testflight.environment).toBe("production");
  expect(eas.build.production.channel).toBe("production");
  expect(eas.build.preview.ios.simulator).toBe(true);
});
