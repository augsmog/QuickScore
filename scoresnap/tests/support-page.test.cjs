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
});

test("Help & Support opens the support page and Privacy Policy opens the privacy page", () => {
  const openURL = jest.fn(() => Promise.resolve());
  const links = load("src/config/support-links.ts", { "react-native": { Linking: { openURL } } });
  links.openSupport();
  links.openPrivacyPolicy();
  expect(openURL).toHaveBeenNthCalledWith(1, "https://snapscore.autumn8.me/support");
  expect(openURL).toHaveBeenNthCalledWith(2, "https://snapscore.autumn8.me/privacy");

  const profile = fs.readFileSync(path.join(root, "app/(tabs)/profile.tsx"), "utf8");
  const settings = fs.readFileSync(path.join(root, "app/settings.tsx"), "utf8");
  const signIn = fs.readFileSync(path.join(root, "app/auth/sign-in.tsx"), "utf8");
  expect(profile).toMatch(/label: "Help & Support", onPress: openSupport/);
  expect(profile).not.toMatch(/Help & Support", onPress: \(\) => \{\}/);
  expect(settings).toMatch(/onPress=\{openPrivacyPolicy\}/);
  expect(signIn).toMatch(/onPress=\{openPrivacyPolicy\}/);
  for (const source of [profile, settings, signIn]) {
    expect(source).not.toContain("august-industries.com/snapscore/privacy");
    expect(source).not.toContain("johnaugustjones@gmail.com");
  }
});

test("support route renders the contact email, deletion request, and no external scripts", async () => {
  const pages = load("src/web/public-pages.ts");
  const supportHtml = fs.readFileSync(path.join(root, "site/support/index.html"), "utf8");
  const privacyHtml = fs.readFileSync(path.join(root, "site/privacy/index.html"), "utf8");
  expect(supportHtml).toBe(pages.renderSupportPage().endsWith("\n") ? pages.renderSupportPage() : `${pages.renderSupportPage()}\n`);
  expect(privacyHtml).toBe(pages.renderPrivacyPage().endsWith("\n") ? pages.renderPrivacyPage() : `${pages.renderPrivacyPage()}\n`);

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
    expect(privacyBody).toContain('id="data-deletion"');
    expect(privacyBody).toContain("no automatic server deletion");
    expect(externalScriptTags(privacyBody)).toEqual([]);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
