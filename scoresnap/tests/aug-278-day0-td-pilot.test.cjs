// AUG-278: the Day-0 / TD pilot runbook must only cite evidence that exists.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const doc = fs.readFileSync(path.join(root, "docs/launch/AUG-278-day0-td-pilot.md"), "utf8");

describe("AUG-278 Day-0 / TD pilot runbook", () => {
  test("every referenced evidence file exists", () => {
    const refs = doc.match(/(?:src\/engine\/__tests__\/|scoresnap\/e2e\/)[\w.-]+\.(?:ts|mjs)/g) || [];
    expect(refs.length).toBeGreaterThanOrEqual(4);
    for (const ref of refs) {
      const rel = ref.replace(/^scoresnap\//, "");
      expect(fs.existsSync(path.join(root, rel))).toBe(true);
    }
  });

  test("states that real-world steps are not done", () => {
    expect(doc).toMatch(/owner actions and are not done/);
    expect(doc).toMatch(/free/i);
  });
});
