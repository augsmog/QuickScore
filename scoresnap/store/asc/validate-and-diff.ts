/**
 * AUG-677: validate the staged ASC payload against Apple field limits and
 * (optionally) print a read-only diff against a JSON export of the live listing.
 * No network, no credentials. Usage:
 *   npx tsx store/asc/validate-and-diff.ts [payload.json] [live.json]
 * live.json shape: same keys as the payload's versionLocalization/appInfoLocalization.
 */
import * as fs from "fs";
import * as path from "path";

export const LIMITS: Record<string, number> = {
  name: 30,
  subtitle: 30,
  keywords: 100,
  promotionalText: 170,
  description: 4000,
  whatsNew: 4000,
};

export function flatten(p: any): Record<string, string> {
  return { ...(p.appInfoLocalization ?? {}), ...(p.versionLocalization ?? {}) };
}

export function validate(p: any): string[] {
  const errs: string[] = [];
  const f = flatten(p);
  for (const [k, max] of Object.entries(LIMITS)) {
    const v = f[k];
    if (typeof v !== "string" || !v.length) errs.push(`${k}: missing`);
    else if (v.length > max) errs.push(`${k}: ${v.length} > ${max}`);
  }
  if (/,\s|\s,/.test(f.keywords ?? "")) errs.push("keywords: no spaces around commas");
  const words = (f.keywords ?? "").toLowerCase().split(",");
  if (new Set(words).size !== words.length) errs.push("keywords: duplicates");
  for (const w of ["snapscore", "golf"]) {
    if (words.includes(w)) errs.push(`keywords: '${w}' already in app name`);
  }
  if (/3 free|three (free )?rounds/i.test(f.description ?? "")) errs.push("description: stale 3-free-scans copy");
  return errs;
}

export function diff(staged: Record<string, string>, live: Record<string, string>): string[] {
  return Object.keys(LIMITS)
    .filter((k) => staged[k] !== live[k])
    .map((k) => `${k}: live=${JSON.stringify(live[k] ?? null)} -> staged=${JSON.stringify(staged[k])}`);
}

if (require.main === module) {
  const payloadPath = process.argv[2] ?? path.join(__dirname, "en-US.payload.json");
  const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  const errs = validate(payload);
  if (errs.length) { console.error("INVALID:\n" + errs.join("\n")); process.exit(1); }
  console.log("payload valid");
  if (process.argv[3]) {
    const live = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
    const d = diff(flatten(payload), flatten(live));
    console.log(d.length ? d.join("\n") : "no differences");
  }
}
