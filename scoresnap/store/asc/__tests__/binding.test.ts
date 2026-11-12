import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { validate } from "../validate-and-diff";
import { accept, checkBinding, parseListing, purchasesFacts } from "../source-binding";

const base = path.join(__dirname, "..", "..", "..");
const p = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "en-US.payload.json"), "utf8"));
const clone = () => JSON.parse(JSON.stringify(p));
let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log("ok -", name); };

t("staged payload is accepted", () => assert.deepStrictEqual(accept(p, validate), { ok: true, errors: [] }));
t("listing doc parses all five fields", () => {
  const a = parseListing(fs.readFileSync(path.join(base, "docs", "APP_STORE_LISTING.md"), "utf8"));
  assert.deepStrictEqual(Object.keys(a).sort(), ["description", "keywords", "name", "promotionalText", "subtitle"]);
});
t("name and subtitle match approved source exactly", () => {
  const d = p.sourceBinding.declaredDeviations;
  assert.ok(!d.name && !d.subtitle);
});
t("undeclared copy change is rejected", () => {
  const bad = clone(); bad.appInfoLocalization.subtitle = "Score. Bet. Win.";
  assert.ok(checkBinding(bad).some((e) => e.startsWith("subtitle") && e.includes("no declared deviation")));
});
t("stale deviation declaration is rejected", () => {
  const bad = clone(); bad.sourceBinding.declaredDeviations.subtitle = "x";
  assert.ok(checkBinding(bad).some((e) => e.includes("matches approved source")));
});
t("changed source hash is rejected", () => {
  const bad = clone(); bad.sourceBinding.listingDocSha256 = "0".repeat(64);
  assert.ok(checkBinding(bad).some((e) => e.includes("approved source changed")));
});
t("missing binding is rejected", () => {
  const bad = clone(); delete bad.sourceBinding;
  assert.ok(!accept(bad, validate).ok);
});
t("wrong price or trial is rejected", () => {
  const bad = clone();
  bad.versionLocalization.description = bad.versionLocalization.description
    .replace("$19.99", "$9.99").replace("7-day free trial", "3-day free trial");
  const e = checkBinding(bad);
  assert.ok(e.some((x) => x.includes("price")) && e.some((x) => x.includes("trial")));
});
t("price/trial facts come from purchases.ts", () => {
  const src = fs.readFileSync(path.join(base, "src", "services", "purchases.ts"), "utf8");
  assert.deepStrictEqual(purchasesFacts(src), { price: "19.99", trialDays: 7 });
});
t("applied status is not acceptable", () => {
  const bad = clone(); bad.status = "APPLIED";
  assert.ok(accept(bad, validate).errors.some((e) => e.startsWith("status")));
});
console.log(`${n} passed`);
