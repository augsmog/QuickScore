const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const vm = require("node:vm");

const root = path.join(__dirname, "..");

function load(rel, stubs = {}) {
  const filename = path.join(root, rel);
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require(name) {
      if (name in stubs) return stubs[name];
      if (!name.startsWith(".")) throw new Error(`Unexpected import ${name} from ${rel}`);
      const resolved = path.resolve(path.dirname(filename), name);
      return load(`${path.relative(root, resolved).replace(/\\/g, "/")}.ts`, stubs);
    },
  }, { filename });
  return exports;
}

function externalScriptTags(html) {
  return [...html.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
}

test("public host and contact are the autumn8 values", () => {
  const support = load("src/config/support.ts");
  expect(support.SUPPORT_BASE_URL).toBe("https://snapscore.autumn8.me");
  expect(support.SUPPORT_EMAIL).toBe("augie@autumn8.me");
  expect(support.SUPPORT_URL).toBe("https://snapscore.autumn8.me/support");
  expect(support.PRIVACY_URL).toBe("https://snapscore.autumn8.me/privacy");
  expect(support.TERMS_URL).toBe(support.SUPPORT_BASE_URL + "/terms");
  expect(support.TERMS_URL).toBe("https://snapscore.autumn8.me/terms");
});

test("Help & Support opens the support page and both Privacy Policy controls use SUPPORT_BASE_URL + /privacy", () => {
  const openURL = jest.fn(() => Promise.resolve());
  const links = load("src/config/support-links.ts", { "react-native": { Linking: { openURL } } });
  const { SUPPORT_BASE_URL } = load("src/config/support.ts");
  links.openSupport();
  expect(openURL).toHaveBeenCalledWith("https://snapscore.autumn8.me/support");
  expect(SUPPORT_BASE_URL + "/privacy").toBe("https://snapscore.autumn8.me/privacy");
  expect(SUPPORT_BASE_URL + "/terms").toBe("https://snapscore.autumn8.me/terms");

  const profile = fs.readFileSync(path.join(root, "app/(tabs)/profile.tsx"), "utf8");
  const settings = fs.readFileSync(path.join(root, "app/settings.tsx"), "utf8");
  const signIn = fs.readFileSync(path.join(root, "app/auth/sign-in.tsx"), "utf8");
  expect(profile).toMatch(/label: "Help & Support", onPress: openSupport/);
  expect(profile).not.toMatch(/Help & Support", onPress: \(\) => \{\}/);
  const privacyOpen = 'Linking.openURL(SUPPORT_BASE_URL + "/privacy")';
  const termsOpen = 'Linking.openURL(SUPPORT_BASE_URL + "/terms")';
  expect(settings).toContain(privacyOpen);
  expect(signIn).toContain(privacyOpen);
  expect(settings).toContain(termsOpen);
  expect(signIn).toContain(termsOpen);
  for (const source of [profile, settings, signIn]) {
    expect(source).not.toContain("johnaugustjones@gmail.com");
  }
});

function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

test("no august-industries.com URL in the app, the site, or the legal docs", () => {
  const files = ["app", "src", "site"].flatMap((dir) => filesUnder(path.join(root, dir)));
  files.push(path.join(root, "docs/privacy-policy.md"));
  files.push(path.join(root, "docs/terms-of-service.md"));
  const hits = files.filter((file) => fs.readFileSync(file, "utf8").includes("august-industries.com"));
  expect(hits.map((file) => path.relative(root, file))).toEqual([]);
});

test("Pages deploy targets snapscore-site, not the existing snapscore project", () => {
  const script = fs.readFileSync(path.join(root, "scripts/deploy-public-pages.sh"), "utf8");
  expect(script).toContain("project=snapscore-site");
  expect(script).toContain("snapscore-site.pages.dev");
  expect(script).toContain('--project-name "$project"');
  expect(script).not.toMatch(/--project-name snapscore(?!-site)/);
});

test("approved home and support copy stays in sync across both public-page render surfaces", () => {
  const pages = load("src/web/public-pages.ts");
  const privacyMarkdown = fs.readFileSync(path.join(root, "docs/privacy-policy.md"), "utf8");
  expect(crypto.createHash("sha256").update(privacyMarkdown).digest("hex")).toBe(
    "5389a5794af7d427bdce87ff0fa566b8c7bf518a93145df67335037a3c09645f",
  );
  expect(privacyMarkdown).toContain("Effective date: October 30, 2026");
  expect(privacyMarkdown).toContain("SnapScore is operated by John August Jones");
  expect(privacyMarkdown).toContain("email augie@autumn8.me");
  expect(privacyMarkdown).not.toMatch(/\bOPEN\b/);
  expect(privacyMarkdown).not.toMatch(/\[E\d+\]/);
  expect(privacyMarkdown.toLowerCase()).not.toContain("draft");
  expect(privacyMarkdown).not.toContain("august-industries.com");
  const supportHtml = fs.readFileSync(path.join(root, "site/support/index.html"), "utf8");
  const homeHtml = fs.readFileSync(path.join(root, "site/index.html"), "utf8");
  const privacyHtml = fs.readFileSync(path.join(root, "site/privacy/index.html"), "utf8");
  const renderedSupport = pages.renderSupportPage();
  const renderedHome = pages.renderHomePage();
  const renderedPrivacy = pages.renderPrivacyPage(privacyMarkdown);
  expect(supportHtml).toBe(renderedSupport.endsWith("\n") ? renderedSupport : `${renderedSupport}\n`);
  expect(homeHtml).toBe(renderedHome.endsWith("\n") ? renderedHome : `${renderedHome}\n`);
  expect(privacyHtml).toBe(renderedPrivacy.endsWith("\n") ? renderedPrivacy : `${renderedPrivacy}\n`);
  expect(homeHtml).toContain("Score your round, run your games, and see who owes what. Got a paper card? Scan it.");
  expect(supportHtml).toContain("SnapScore helps golf groups record rounds, run side games and see who owes what. Enter scores by hand or choose to scan a paper scorecard and review the results before saving.");
  expect(supportHtml).toContain("How do I record a round?");
  expect(supportHtml.indexOf("How do I record a round?")).toBeLessThan(supportHtml.indexOf("How does scorecard scanning work?"));
  expect(supportHtml).toContain("SnapScore includes 50+ game modes");
  expect(supportHtml).toContain("mailto:hello@snapscore.autumn8.me");
  expect(supportHtml).not.toMatch(/\b(bet|wager|gamble|payout|unlock)\b/i);

  expect(supportHtml).toContain("mailto:hello@snapscore.autumn8.me");
  expect(supportHtml).toContain("How do I record a round?");
  expect(supportHtml).toContain('href="/privacy"');
  expect(supportHtml.toLowerCase()).not.toContain("coming soon");
  expect(supportHtml).not.toContain("johnaugustjones@gmail.com");
  expect(externalScriptTags(supportHtml)).toEqual([]);
  expect(supportHtml).not.toMatch(/\bsrc\s*=\s*["']https?:/i);
  expect(supportHtml).toContain('name="viewport" content="width=device-width, initial-scale=1"');
  expect(supportHtml).toContain("@media (max-width: 390px)");

  expect(privacyHtml).toContain("mailto:augie@autumn8.me");
  expect(privacyHtml).toContain("<title>Privacy policy · SnapScore</title>");
  expect(privacyHtml).toContain('id="retention-and-deletion"');
  expect(privacyHtml).toContain('id="children"');
  expect(privacyHtml).toContain("It does not delete your account or data on SnapScore's servers");
  expect(privacyHtml).toContain("Effective date: October 30, 2026");
  expect(privacyHtml).toContain("SnapScore is operated by John August Jones");
  expect(privacyHtml).toContain("To ask us to delete your account and the data stored on SnapScore's servers");
  expect(privacyHtml).toContain("forwards it to Anthropic's API");
  expect(privacyHtml).not.toContain("Draft dated");
  expect(privacyHtml).not.toContain("johnaugustjones@gmail.com");
  expect(externalScriptTags(privacyHtml)).toEqual([]);
  expect(privacyHtml).not.toMatch(/\bsrc\s*=\s*["']https?:/i);
});

test("terms route is generated from docs/terms-of-service.md", () => {
  const pages = load("src/web/public-pages.ts");
  const termsMarkdown = fs.readFileSync(path.join(root, "docs/terms-of-service.md"), "utf8");
  expect(termsMarkdown).toContain("Effective Date: March 24, 2026");
  expect(termsMarkdown).toContain("Email: augie@autumn8.me");
  expect(termsMarkdown).not.toContain("august-industries.com");
  expect(termsMarkdown).not.toContain("support@august-industries.com");
  const termsHtml = fs.readFileSync(path.join(root, "site/terms/index.html"), "utf8");
  const renderedTerms = pages.renderTermsPage(termsMarkdown);
  expect(termsHtml).toBe(renderedTerms.endsWith("\n") ? renderedTerms : `${renderedTerms}\n`);

  expect(termsHtml).toContain("<title>Terms of Service — SnapScore Golf</title>");
  expect(termsHtml).toContain("Effective Date: March 24, 2026");
  expect(termsHtml).toContain("The App is a score-tracking and calculation tool only.");
  expect(termsHtml).toContain("State of Texas");
  expect(termsHtml).toContain("mailto:augie@autumn8.me");
  expect(termsHtml).toContain('href="/terms" aria-current="page"');
  expect(termsHtml).not.toContain("august-industries.com");
  expect(termsHtml).not.toContain("support@august-industries.com");
  expect(externalScriptTags(termsHtml)).toEqual([]);
  expect(termsHtml).not.toMatch(/\bsrc\s*=\s*["']https?:/i);
});
