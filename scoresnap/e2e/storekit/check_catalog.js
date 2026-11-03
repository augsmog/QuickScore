// Fails unless SnapScore.storekit matches the app's product IDs and prices in purchases.ts (header) AND the
// paywall fallbacks in paywall-plans.ts (PLAN_OPTIONS). Run from scoresnap/: node e2e/storekit/check_catalog.js
const fs = require("fs");
const cfg = JSON.parse(fs.readFileSync("e2e/storekit/SnapScore.storekit", "utf8"));
const subs = cfg.subscriptionGroups.flatMap(g => g.subscriptions);
const purchases = fs.readFileSync("src/services/purchases.ts", "utf8");
const plans = fs.readFileSync("src/services/paywall-plans.ts", "utf8");
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const errs = [];
// PLAN_OPTIONS fallbacks: {tier:'pro', ... options:[{key:..,fallback:'$24.99',period:'year'}, ...]}
const fallback = {};
for (const m of plans.matchAll(/\{tier:'(\w+)'[^\n]*?options:\[([^\]]*)\]/g))
  for (const o of m[2].matchAll(/fallback:'\$([\d.]+)',period:'(year|month)'/g))
    fallback[`snapscore.${m[1]}.${o[2] === "year" ? "annual" : "monthly"}`] = o[1];
const want = Object.keys(fallback).sort();
const got = subs.map(s => s.productID).sort();
if (want.length !== 4) errs.push(`expected 4 PLAN_OPTIONS prices in paywall-plans.ts, parsed ${want.length}`);
if (JSON.stringify(want) !== JSON.stringify(got)) errs.push(`product set differs: paywall ${want} vs storekit ${got}`);
for (const s of subs) {
  if (fallback[s.productID] !== s.displayPrice) errs.push(`${s.productID}: storekit ${s.displayPrice} vs paywall ${fallback[s.productID]}`);
  if (!new RegExp(esc(s.productID) + " \\(\\$" + esc(s.displayPrice) + "/").test(purchases))
    errs.push(`${s.productID} ${s.displayPrice} not in purchases.ts product header`);
}
if (errs.length) { errs.forEach(e => console.error("mismatch:", e)); process.exit(1); }
console.log(`catalog OK: ${got.length} products match purchases.ts and paywall-plans.ts`);
