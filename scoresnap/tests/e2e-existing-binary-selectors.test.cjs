/**
 * AUG-1280 / AUG-637: static proof that the existing-binary selector repairs resolve uniquely
 * against the retained 2026-11-14 hierarchy captures, without a simulator. The two pinned EAS
 * artifacts (6a97486c settlement, 33ac8ba5 safe-area) cannot be rebuilt ($0, AUG-637), so this is
 * the harness's only available regression coverage for them.
 */
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const repoRoot = path.resolve(__dirname, "..", "..");
const fixtureDir = path.join(repoRoot, ".maestro", "fixtures", "retained-20261114");
const docs = (rel) => yaml.loadAll(fs.readFileSync(path.join(repoRoot, rel), "utf8"));

function loadHierarchy(name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureDir, name), "utf8"));
}

// Mirrors Maestro's default text-selector semantics: the pattern must match the *entire* string.
function fullMatches(nodes, field, pattern) {
  const re = new RegExp(`^(?:${pattern})$`);
  return nodes.filter((a) => re.test(a[field] || ""));
}

function flattenAttributes(node, out = []) {
  const a = node.attributes || {};
  out.push(a);
  for (const c of node.children || []) flattenAttributes(c, out);
  return out;
}

describe("settlement existing binary (EAS 6a97486c, flow SHA f23fc9687d673673af339ab5cfbbd7aa41f29596)", () => {
  const nodes = flattenAttributes(loadHierarchy("aug637-settlement-6a97486c-hierarchy.json"));

  test("the shared subflow's id selector cannot resolve on this build (why it needs a repair)", () => {
    expect(nodes.some((a) => a["resource-id"] === "game-mode-skins")).toBe(false);
    // Other real testIDs on the very same screen DO resolve, proving resource-id capture itself
    // works here -- "game-mode-skins" is specifically missing, not the whole dump.
    expect(nodes.some((a) => a["resource-id"] === "contest-step-gamemodes")).toBe(true);
    expect(nodes.some((a) => a["resource-id"] === "contest-continue")).toBe(true);
  });

  test("the repaired \"^Skins$\" selector resolves to exactly one node, distinct from Skins (Carryover)", () => {
    const matches = fullMatches(nodes, "accessibilityText", "Skins");
    expect(matches).toHaveLength(1);
    expect(nodes.filter((a) => a.accessibilityText === "Skins (Carryover)")).toHaveLength(1);
  });

  test("the existing-binary subflow uses the anchored text selector, not the id, for the Skins tap", () => {
    const [, steps] = docs(".maestro/subflows/create-two-player-skins-existing-binary.yaml");
    const waitIdx = steps.findIndex((s) => s.extendedWaitUntil?.visible === "^Skins$");
    expect(waitIdx).toBeGreaterThan(0);
    expect(steps[waitIdx + 1]).toEqual({ tapOn: "^Skins$" });
    expect(steps[waitIdx + 2]).toEqual({ assertVisible: { text: "^Skins$", selected: true } });
    expect(steps.some((s) => s.tapOn?.id === "game-mode-skins")).toBe(false);
  });

  test("the pinned existing-binary flow targets the exact recorded EAS build id and never a fresh build", () => {
    const config = JSON.parse(fs.readFileSync(path.join(repoRoot, ".maestro", "e2e.config.json"), "utf8"));
    const flow = config.flows.find((f) => f.id === "aug-637-settlement-existing-binary");
    expect(flow.pinnedEasBuildId).toBe("6a97486c-6f45-42cd-ad09-27d959395fb4");
    expect(typeof flow.skipInAll).toBe("string");
    expect(flow.skipInAll).toMatch(/6a97486c-6f45-42cd-ad09-27d959395fb4/);
  });
});

describe("safe-area existing binary (EAS 33ac8ba5, flow SHA f23fc9687d673673af339ab5cfbbd7aa41f29596)", () => {
  const nodes = flattenAttributes(loadHierarchy("aug637-safe-area-33ac8ba5-hierarchy.json"));

  test("\"Search courses...\" does not exist on this build; it predates CourseSearch rollout", () => {
    expect(nodes.some((a) => (a.accessibilityText || "").includes("Search courses"))).toBe(false);
    expect(nodes.some((a) => (a.text || "").includes("Find Your Course"))).toBe(false);
  });

  test("the repaired \"Course name\" selector resolves to exactly one node with the shipping placeholder", () => {
    const matches = nodes.filter((a) => a.accessibilityText === "Course name");
    expect(matches).toHaveLength(1);
    expect(matches[0].hintText).toBe("My Course");
  });

  test("\"Course name\" + \"My Course\" matches the COURSE_SEARCH_ENABLED=false branch shipping today", () => {
    const src = fs.readFileSync(path.join(repoRoot, "scoresnap", "app", "contest", "new.tsx"), "utf8");
    expect(src).toMatch(/accessibilityLabel="Course name"/);
    expect(src).toMatch(/placeholder="My Course"/);
    expect(src).toMatch(/COURSE_SEARCH_ENABLED\s*\?/);
  });

  test("the existing-binary flow taps the Course name field directly, not Search courses", () => {
    const [, steps] = docs(".maestro/flows/offline/aug-637-safe-area-existing-binary.yaml");
    expect(steps).toContainEqual({ tapOn: "Course name" });
    expect(steps.some((s) => s.tapOn === "Search courses...")).toBe(false);
    expect(steps).toContainEqual({ inputText: "E2E Tee Course" });
  });

  test("the pinned existing-binary flow targets the exact recorded EAS build id and never a fresh build", () => {
    const config = JSON.parse(fs.readFileSync(path.join(repoRoot, ".maestro", "e2e.config.json"), "utf8"));
    const flow = config.flows.find((f) => f.id === "aug-637-safe-area-existing-binary");
    expect(flow.pinnedEasBuildId).toBe("33ac8ba5-c7d1-49b5-ba8e-f14c44211882");
    expect(typeof flow.skipInAll).toBe("string");
    expect(flow.skipInAll).toMatch(/33ac8ba5-c7d1-49b5-ba8e-f14c44211882/);
  });
});
