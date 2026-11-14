require("tsx/cjs");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const { identifyAnonymousOnly } = require("../src/services/posthog-identity.ts");
const { captureOcrAnalytics } = require("../supabase/functions/ocr-scorecard/analytics.ts");

const forbiddenKeys = /(?:^|_)(?:email|name|image|base64|response|messages|password|token|user_id)(?:_|$)|^\$ai_/i;
function expectNoPiiKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(key).not.toMatch(forbiddenKeys);
    expectNoPiiKeys(nested);
  }
}

function propertyName(property) {
  if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
    return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : "";
  }
  return "";
}

function collectPiiKeys(node) {
  if (!ts.isObjectLiteralExpression(node)) return [];
  return node.properties.flatMap((property) => {
    if (ts.isSpreadAssignment(property)) return ["<spread-payload>"];
    const name = propertyName(property);
    const nested = ts.isPropertyAssignment(property) ? collectPiiKeys(property.initializer) : [];
    return [...(name && name !== "screen_name" && forbiddenKeys.test(name) ? [name] : []), ...nested];
  });
}

function inspectPostHogCaptures(sourceFiles) {
  const events = [];
  const findings = [];
  for (const source of sourceFiles) {
    function visit(node) {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(source) === "posthog"
        && node.expression.name.text === "capture") {
        const event = node.arguments[0];
        const payload = node.arguments[1];
        if (event && ts.isStringLiteral(event)) events.push(event.text);
        if (payload) {
          const keys = ts.isObjectLiteralExpression(payload) ? collectPiiKeys(payload) : ["<non-literal-payload>"];
          findings.push(...keys.map((key) => ({ event: event?.getText(source), key })));
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return { events, findings };
}

function nativeCaptureSources() {
  return [
    "../app/contest/new.tsx",
    "../app/contest/[id]/index.tsx",
    "../app/paywall.tsx",
    "../app/scan/index.tsx",
    "../app/scan/review.tsx",
  ].map((file) => ts.createSourceFile(file, fs.readFileSync(path.join(__dirname, file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX));
}

test("PostHog identity only uses its current anonymous distinct ID", () => {
  const client = {
    getDistinctId: jest.fn(() => "anonymous-session-uuid"),
    identify: jest.fn(),
  };

  expect(identifyAnonymousOnly(client)).toBe("anonymous-session-uuid");
  expect(client.identify).toHaveBeenCalledTimes(1);
  expect(client.identify).toHaveBeenCalledWith("anonymous-session-uuid");
  expectNoPiiKeys(client.identify.mock.calls);

  const authSource = fs.readFileSync(path.join(__dirname, "../src/stores/auth-store.ts"), "utf8");
  expect(authSource).toMatch(/identifyAnonymousOnly\(posthog\)/);
  expect(authSource).not.toMatch(/posthog\.identify\(/);
});

test("OCR analytics sends only anonymous status, latency, and counts", async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true }));
  await captureOcrAnalytics({
    success: true,
    latencyMs: 42.7,
    playerCount: 2,
    scoreCount: 36,
    imageData: "private-base64-scorecard",
    response: { player: "private response" },
    email: "private@example.test",
  }, {
    projectToken: "test-project-token",
    host: "https://posthog.example.test",
    fetchImpl,
    anonymousId: () => "ocr-anonymous-request-uuid",
  });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const request = fetchImpl.mock.calls[0][1];
  const body = JSON.parse(request.body);
  expect(body.event).toBe("ocr_scorecard_processed");
  expect(body.properties).toEqual({
    distinct_id: "ocr-anonymous-request-uuid",
    success: true,
    latency_ms: 43,
    player_count: 2,
    score_count: 36,
  });
  expectNoPiiKeys(body);
});

test("all native PostHog capture call sites exclude PII keys", () => {
  const expectedEvents = [
    "contest_created",
    "round_finalized",
    "subscription_purchase_completed",
    "scorecard_scan_processed",
    "scorecard_imported",
    "quick_settlement_created",
  ].sort();
  const result = inspectPostHogCaptures(nativeCaptureSources());

  expect(result.events.sort()).toEqual(expectedEvents);
  expect(result.findings).toEqual([]);

  const mutated = ts.createSourceFile("mutation.tsx", 'posthog.capture("contest_created", { email: "private@example.test" });', ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  expect(inspectPostHogCaptures([mutated]).findings).toEqual([
    { event: '"contest_created"', key: "email" },
  ]);
});

test("PostHog exception and crash autocapture are explicitly disabled", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/config/posthog.tsx"), "utf8");
  expect(source).toMatch(/uncaughtExceptions:\s*false/);
  expect(source).toMatch(/unhandledRejections:\s*false/);
  expect(source).toMatch(/nativeCrashes:\s*false/);
  expect(source).toMatch(/androidNdkCrashes:\s*false/);
  expect(source).toMatch(/console:\s*\[\]/);
});
