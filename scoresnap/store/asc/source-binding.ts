/**
 * AUG-966 (repair of AUG-677 / PR #219): bind the staged ASC payload to its
 * approved sources and make acceptance testable. Offline, read-only.
 *
 * Approved sources:
 *  - docs/APP_STORE_LISTING.md  (name, subtitle, keywords, promo, description)
 *  - src/services/purchases.ts  (price, trial length)
 * Any field that differs from the listing doc must be declared in
 * payload.sourceBinding.declaredDeviations, so no copy change is silent.
 */
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { flatten } from "./validate-and-diff";

const ROOT = path.join(__dirname, "..", "..");
export const LISTING_DOC = "docs/APP_STORE_LISTING.md";
const FIELDS = ["name", "subtitle", "keywords", "promotionalText", "description"] as const;

export const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

/** Extract the fenced code-block value under each "## Heading" of the listing doc. */
export function parseListing(md: string): Record<string, string> {
  const map: Record<string, string> = {
    "App Name": "name",
    Subtitle: "subtitle",
    Keywords: "keywords",
    "Promotional Text": "promotionalText",
    Description: "description",
  };
  const out: Record<string, string> = {};
  for (const sec of md.split(/^## /m).slice(1)) {
    const head = sec.split("\n")[0];
    const key = Object.keys(map).find((h) => head.startsWith(h));
    const m = key && sec.match(/```\n([\s\S]*?)\n```/);
    if (key && m) out[map[key]] = m[1].trim();
  }
  return out;
}

export function purchasesFacts(src: string): { price: string; trialDays: number } {
  const m = src.match(/yearly:\s*\$([\d.]+)\/year \((\d+)-day free trial\)/);
  if (!m) throw new Error("purchases.ts: yearly price/trial line not found");
  return { price: m[1], trialDays: Number(m[2]) };
}

export function checkBinding(payload: any, root = ROOT): string[] {
  const errs: string[] = [];
  const b = payload.sourceBinding;
  if (!b) return ["sourceBinding: missing"];
  const docText = fs.readFileSync(path.join(root, LISTING_DOC), "utf8");
  if (b.listingDoc !== LISTING_DOC) errs.push(`sourceBinding.listingDoc must be ${LISTING_DOC}`);
  if (b.listingDocSha256 !== sha256(docText))
    errs.push("sourceBinding.listingDocSha256: approved source changed since payload was bound; re-review");

  const approved = parseListing(docText);
  const staged = flatten(payload);
  const declared: Record<string, string> = b.declaredDeviations ?? {};
  for (const f of FIELDS) {
    if (approved[f] === undefined) {
      errs.push(`${f}: not found in ${LISTING_DOC}`);
      continue;
    }
    const differs = approved[f] !== staged[f];
    if (differs && !declared[f]) errs.push(`${f}: differs from approved source with no declared deviation`);
    if (!differs && declared[f]) errs.push(`${f}: declared deviation but matches approved source`);
  }
  for (const k of Object.keys(declared))
    if (!(FIELDS as readonly string[]).includes(k)) errs.push(`declaredDeviations: unknown field ${k}`);

  const { price, trialDays } = purchasesFacts(fs.readFileSync(path.join(root, "src/services/purchases.ts"), "utf8"));
  const d = staged.description ?? "";
  if (!d.includes(`$${price} per year`)) errs.push(`description: price must be $${price} per year (purchases.ts)`);
  if (!d.includes(`${trialDays}-day free trial`)) errs.push(`description: must state ${trialDays}-day free trial (purchases.ts)`);
  return errs;
}

/** Acceptance: valid + bound + still staged. Never implies anything was sent to ASC. */
export function accept(payload: any, validate: (p: any) => string[]): { ok: boolean; errors: string[] } {
  const errors = [...validate(payload), ...checkBinding(payload)];
  if (payload.status !== "STAGED-NOT-APPLIED") errors.push("status: must be STAGED-NOT-APPLIED");
  return { ok: errors.length === 0, errors };
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { validate } = require("./validate-and-diff");
  const p = JSON.parse(fs.readFileSync(process.argv[2] ?? path.join(__dirname, "en-US.payload.json"), "utf8"));
  const r = accept(p, validate);
  console.log(r.ok ? "ACCEPTED (staged, bound to approved sources; nothing sent to ASC)" : "REJECTED:\n" + r.errors.join("\n"));
  process.exit(r.ok ? 0 : 1);
}
