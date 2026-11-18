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
    expect(doc).toMatch(/real-event outcomes remain unfulfilled/);
    expect(doc).toMatch(/free/i);
  });
  test("acceptance stays automated and owner use stays feedback", () => {
    expect(doc).toMatch(/Acceptance = automated proof only/);
    expect(doc).toMatch(/Owner use is feedback only/);
    expect(doc).not.toMatch(/owner, on a real phone|Fresh install|Play 18 holes|Capture screenshots/i);
    expect(doc).toMatch(/persisted round\/event record/);
    expect(doc).toMatch(/automatically generated operator record/);
  });

  test("outreach and grants require distinct exact approvals", () => {
    expect(doc).toMatch(/exact message.*recorded yes/i);
    expect(doc).toMatch(/grant terms and mechanism.*separate explicit approval/i);
    expect(doc).toMatch(/3-5 distinct real-event offers sent/);
    expect(doc).toMatch(/pending approval is not sent/);
    expect(doc).toMatch(/post-launch/);
  });
});
