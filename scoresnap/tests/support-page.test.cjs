const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
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

function startSite() {
  const site = path.join(root, "site");
  const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const rel = pathname.replace(/^\/+/, "");
    const candidates = [
      path.resolve(site, rel),
      path.resolve(site, rel, "index.html"),
    ];
    const file = candidates.find((candidate) => candidate.startsWith(site + path.sep) && fs.existsSync(candidate) && fs.statSync(candidate).isFile());
    if (!file) {
      res.writeHead(404).end("missing");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve({ server, port: server.address().port }));
  });
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

test("support route renders the contact email, deletion request, and no external scripts", async () => {
  const pages = load("src/web/public-pages.ts");
  const privacyMarkdown = fs.readFileSync(path.join(root, "docs/privacy-policy.md"), "utf8");
  expect(crypto.createHash("sha256").update(privacyMarkdown).digest("hex")).toBe(
    "e83e70b4bf5c3bc1550db7ff6ef220807bcd75b08056eb82e3b4a5e237ff02f9",
  );
  expect(privacyMarkdown).toContain("Effective date: October 30, 2026");
  expect(privacyMarkdown).toContain("SnapScore is operated by John August Jones");
  expect(privacyMarkdown).toContain("email augie@autumn8.me");
  expect(privacyMarkdown).not.toMatch(/\bOPEN\b/);
  expect(privacyMarkdown).not.toMatch(/\[E\d+\]/);
  expect(privacyMarkdown.toLowerCase()).not.toContain("draft");
  expect(privacyMarkdown).not.toContain("august-industries.com");
  const supportHtml = fs.readFileSync(path.join(root, "site/support/index.html"), "utf8");
  const privacyHtml = fs.readFileSync(path.join(root, "site/privacy/index.html"), "utf8");
  const renderedSupport = pages.renderSupportPage();
  const renderedPrivacy = pages.renderPrivacyPage(privacyMarkdown);
  expect(supportHtml).toBe(renderedSupport.endsWith("\n") ? renderedSupport : `${renderedSupport}\n`);
  expect(privacyHtml).toBe(renderedPrivacy.endsWith("\n") ? renderedPrivacy : `${renderedPrivacy}\n`);

  const { server, port } = await startSite();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/support`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("mailto:augie@autumn8.me");
    expect(html).toContain("augie@autumn8.me");
    expect(html).toContain('id="data-deletion"');
    expect(html).toContain("does not automatically delete data stored on SnapScore's servers");
    expect(html).toContain("To request deletion of that server data");
    expect(html).toContain('href="/privacy"');
    expect(html.toLowerCase()).not.toContain("coming soon");
    expect(html).not.toContain("johnaugustjones@gmail.com");
    expect(externalScriptTags(html)).toEqual([]);
    expect(html).not.toMatch(/\bsrc\s*=\s*["']https?:/i);
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1"');
    expect(html).toContain("@media (max-width: 390px)");

    const privacy = await fetch(`http://127.0.0.1:${port}/privacy`);
    const privacyBody = await privacy.text();
    expect(privacy.status).toBe(200);
    expect(privacyBody).toContain("mailto:augie@autumn8.me");
    expect(privacyBody).toContain("<title>Privacy policy · SnapScore</title>");
    expect(privacyBody).toContain('id="retention-and-deletion"');
    expect(privacyBody).toContain('id="children"');
    expect(privacyBody).toContain("It does not delete your account or data on SnapScore's servers");
    expect(privacyBody).toContain("Effective date: October 30, 2026");
    expect(privacyBody).toContain("SnapScore is operated by John August Jones");
    expect(privacyBody).toContain("To ask us to delete your account and the data stored on SnapScore's servers");
    expect(privacyBody).toContain("forwards it to Anthropic's API");
    expect(privacyBody).not.toContain("Draft dated");
    expect(privacyBody).not.toContain("johnaugustjones@gmail.com");
    expect(externalScriptTags(privacyBody)).toEqual([]);
    expect(privacyBody).not.toMatch(/\bsrc\s*=\s*["']https?:/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("terms route is generated from docs/terms-of-service.md", async () => {
  const pages = load("src/web/public-pages.ts");
  const termsMarkdown = fs.readFileSync(path.join(root, "docs/terms-of-service.md"), "utf8");
  expect(termsMarkdown).toContain("Effective Date: March 24, 2026");
  expect(termsMarkdown).toContain("Email: augie@autumn8.me");
  expect(termsMarkdown).not.toContain("august-industries.com");
  expect(termsMarkdown).not.toContain("support@august-industries.com");
  const termsHtml = fs.readFileSync(path.join(root, "site/terms/index.html"), "utf8");
  const renderedTerms = pages.renderTermsPage(termsMarkdown);
  expect(termsHtml).toBe(renderedTerms.endsWith("\n") ? renderedTerms : `${renderedTerms}\n`);

  const { server, port } = await startSite();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/terms`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("<title>Terms of Service — SnapScore Golf</title>");
    expect(html).toContain("Effective Date: March 24, 2026");
    expect(html).toContain("The App is a score-tracking and calculation tool only.");
    expect(html).toContain("State of Texas");
    expect(html).toContain("mailto:augie@autumn8.me");
    expect(html).toContain('href="/terms" aria-current="page"');
    expect(html).not.toContain("august-industries.com");
    expect(html).not.toContain("support@august-industries.com");
    expect(externalScriptTags(html)).toEqual([]);
    expect(html).not.toMatch(/\bsrc\s*=\s*["']https?:/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
