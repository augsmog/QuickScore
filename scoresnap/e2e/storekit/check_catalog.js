// Run from scoresnap/: node e2e/storekit/check_catalog.js [--pro-enabled]
// The default catalog is the shipping flag-off catalog; Pro remains dormant in app code.
const fs = require("fs");
const proEnabled = process.argv.includes("--pro-enabled");
const file = proEnabled ? "e2e/storekit/SnapScore.pro-enabled.storekit" : "e2e/storekit/SnapScore.storekit";
const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
const subs = cfg.subscriptionGroups.flatMap(g => g.subscriptions);
const plans = fs.readFileSync("src/services/paywall-plans.ts", "utf8");
const fallback = {};
for (const m of plans.matchAll(/\{tier:'(\w+)'[^\n]*?options:\[([^\]]*)\]/g))
  for (const o of m[2].matchAll(/fallback:'\$([\d.]+)',period:'(year|month)'/g))
    fallback[`snapscore.${m[1]}.${o[2] === "year" ? "annual" : "monthly"}`] = o[1];
const want = (proEnabled ? Object.keys(fallback) : Object.keys(fallback).filter(id => id.startsWith("snapscore.td."))).sort();
const got = subs.map(s => s.productID).sort();
const errs = [];
if (proEnabled && want.length !== 4) errs.push(`expected 4 PLAN_OPTIONS prices, parsed ${want.length}`);
if (!proEnabled && want.length !== 2) errs.push(`expected 2 TD PLAN_OPTIONS prices, parsed ${want.length}`);
if (JSON.stringify(want) !== JSON.stringify(got)) errs.push(`product set differs: expected ${want} vs storekit ${got}`);
if (!proEnabled && got.some(id => id.startsWith("snapscore.pro."))) errs.push("shipping catalog must not contain Pro products");
for (const s of subs) if (fallback[s.productID] !== s.displayPrice)
  errs.push(`${s.productID}: storekit ${s.displayPrice} vs paywall ${fallback[s.productID]}`);
if (errs.length) { errs.forEach(e => console.error("mismatch:", e)); process.exit(1); }
console.log(`catalog OK: ${got.length} ${proEnabled ? "Pro-enabled" : "shipping TD-only"} products match paywall-plans.ts`);
