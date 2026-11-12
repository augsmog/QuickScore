import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { validate, diff, flatten, LIMITS } from "../validate-and-diff";

const p = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "en-US.payload.json"), "utf8"));
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok -", name); };

t("staged payload is valid", () => assert.deepStrictEqual(validate(p), []));
t("status is staged, not applied", () => assert.strictEqual(p.status, "STAGED-NOT-APPLIED"));
t("all limited fields present", () => { for (const k of Object.keys(LIMITS)) assert.ok(flatten(p)[k], k); });
t("detects over-limit promo", () => {
  const bad = JSON.parse(JSON.stringify(p)); bad.versionLocalization.promotionalText = "x".repeat(171);
  assert.ok(validate(bad).some((e) => e.startsWith("promotionalText")));
});
t("detects stale trial copy", () => {
  const bad = JSON.parse(JSON.stringify(p)); bad.versionLocalization.description += " Score your first 3 free rounds.";
  assert.ok(validate(bad).some((e) => e.includes("stale")));
});
t("diff reports only changed fields", () => {
  const live = { ...flatten(p), subtitle: "Old" };
  const d = diff(flatten(p), live);
  assert.strictEqual(d.length, 1); assert.ok(d[0].startsWith("subtitle"));
});
t("claims match code: 29 calculators", () => {
  const dir = path.join(__dirname, "..", "..", "..", "src", "engine", "calculators");
  const c = fs.readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "index.ts").length;
  assert.strictEqual(c, 29);
  assert.ok(p.versionLocalization.description.includes("29 GAME MODES"));
});
console.log(`${n} passed`);
