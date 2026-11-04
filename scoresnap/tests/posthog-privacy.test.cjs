require("tsx/cjs");
const fs = require("node:fs");
const path = require("node:path");
const { identifyAnonymousOnly } = require("../src/services/posthog-identity.ts");
const { captureOcrAnalytics } = require("../supabase/functions/ocr-scorecard/analytics.ts");

const forbiddenKeys = /^(?:email|name|first_name|last_name|image|image_data|base64|response|messages|\$ai_input|\$ai_output_choices)$/i;
function expectNoPiiKeys(value) {
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    expect(key).not.toMatch(forbiddenKeys);
    expectNoPiiKeys(nested);
  }
}

test("PostHog identity only uses its current anonymous distinct ID", () => {
  const client = {
    get_distinct_id: jest.fn(() => "anonymous-session-uuid"),
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

test("PostHog exception and crash autocapture are explicitly disabled", () => {
  const source = fs.readFileSync(path.join(__dirname, "../src/config/posthog.tsx"), "utf8");
  expect(source).toMatch(/uncaughtExceptions:\s*false/);
  expect(source).toMatch(/unhandledRejections:\s*false/);
  expect(source).toMatch(/nativeCrashes:\s*false/);
  expect(source).toMatch(/androidNdkCrashes:\s*false/);
  expect(source).toMatch(/console:\s*\[\]/);
});
