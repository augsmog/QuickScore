require("tsx/cjs");
const fs = require("node:fs");
const path = require("node:path");
const { createWebAnalytics } = require("../src/services/analytics-web.ts");
const { screenNameFromSegments } = require("../src/services/analytics-screen.ts");

const events = ["app_opened", "screen_viewed", "score_snap_started", "score_snap_completed", "share_tapped", "error_shown"];

test("disabled capture does not load the SDK, initialize, or send a network event", async () => {
  const sdk = { init: jest.fn(), register: jest.fn(), capture: jest.fn() };
  const load = jest.fn(async () => sdk);
  const analytics = createWebAnalytics({ platform: "web", enabled: false, projectKey: "test-key", load });

  await Promise.all(events.map((event) => analytics.capture(event, { screen_name: "home" })));

  expect(load).not.toHaveBeenCalled();
  expect(sdk.init).not.toHaveBeenCalled();
  expect(sdk.capture).not.toHaveBeenCalled();
});

test("requires a key and web platform before initializing", async () => {
  const load = jest.fn(async () => ({ init: jest.fn(), register: jest.fn(), capture: jest.fn() }));
  await createWebAnalytics({ platform: "web", enabled: true, projectKey: "  ", load }).capture("app_opened");
  await createWebAnalytics({ platform: "ios", enabled: true, projectKey: "test-key", load }).capture("app_opened");
  expect(load).not.toHaveBeenCalled();
});

test("initializes with privacy defaults and emits only allow-listed event properties", async () => {
  const sdk = { init: jest.fn(), register: jest.fn(), capture: jest.fn() };
  const analytics = createWebAnalytics({ platform: "web", enabled: true, projectKey: "test-project-key", load: async () => sdk });
  const samples = [
    ["app_opened", { unexpected: "discard me" }],
    ["screen_viewed", { screen_name: "contest_settlement", unexpected: "discard me" }],
    ["score_snap_started", {}],
    ["score_snap_completed", { duration_ms: 12.7, success: true, unexpected: "discard me" }],
    ["share_tapped", {}],
    ["error_shown", { code: "scorecard_parse_failed", unexpected: "discard me" }],
  ];
  for (const [event, properties] of samples) await analytics.capture(event, properties);

  expect(sdk.init).toHaveBeenCalledTimes(1);
  expect(sdk.init).toHaveBeenCalledWith("test-project-key", expect.objectContaining({
    api_host: "https://us.i.posthog.com",
    defaults: "2026-08-30",
    person_profiles: "identified_only",
    ip: false,
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    session_recording: { maskAllInputs: true },
    before_send: expect.any(Function),
  }));
  expect(sdk.register).toHaveBeenCalledWith({ app: "snapscore", platform: "web" });
  expect(sdk.capture).toHaveBeenCalledTimes(events.length);
  for (const [event, properties] of sdk.capture.mock.calls) {
    expect(properties.app).toBe("snapscore");
    const allowed = new Set(["app", ...(event === "screen_viewed" ? ["screen_name"] : []),
      ...(event === "score_snap_completed" ? ["duration_ms", "success"] : []),
      ...(event === "error_shown" ? ["code"] : [])]);
    expect(Object.keys(properties).every((key) => allowed.has(key))).toBe(true);
  }
  expect(sdk.capture).toHaveBeenCalledWith("screen_viewed", { app: "snapscore", screen_name: "contest_settlement" });
  expect(sdk.capture).toHaveBeenCalledWith("score_snap_completed", { app: "snapscore", duration_ms: 13, success: true });

  const beforeSend = sdk.init.mock.calls[0][1].before_send;
  const enriched = beforeSend({
    event: "screen_viewed",
    properties: {
      token: "test-project-token",
      distinct_id: "anonymous-session-uuid",
      $process_person_profile: false,
      app: "snapscore",
      screen_name: "contest_settlement",
      $current_url: "https://example.test/contest/private-id?token=secret",
      $referrer: "https://example.test/private",
      $referring_domain: "example.test",
      $pathname: "/contest/private-id",
      $host: "example.test",
      $ip: "203.0.113.10",
      $browser: "ExampleBrowser",
      unexpected: "discard me",
    },
  });
  expect(enriched.properties).toEqual({
    token: "test-project-token",
    distinct_id: "anonymous-session-uuid",
    $process_person_profile: false,
    app: "snapscore",
    screen_name: "contest_settlement",
  });
  for (const key of ["$current_url", "$referrer", "$referring_domain", "$pathname", "$host", "$ip", "$browser", "unexpected"]) {
    expect(enriched.properties).not.toHaveProperty(key);
  }
  expect(beforeSend({ event: "$pageview", properties: { $current_url: "https://example.test/private" } })).toBeNull();
});

test("drops free-text properties and reports route templates without IDs", async () => {
  const sdk = { init: jest.fn(), register: jest.fn(), capture: jest.fn() };
  const analytics = createWebAnalytics({ platform: "web", enabled: true, projectKey: "test-key", load: async () => sdk });
  await analytics.capture("screen_viewed", { screen_name: "contest/real-uuid" });
  await analytics.capture("error_shown", { code: "Jane Doe: OCR failed" });
  expect(sdk.capture).toHaveBeenNthCalledWith(1, "screen_viewed", { app: "snapscore" });
  expect(sdk.capture).toHaveBeenNthCalledWith(2, "error_shown", { app: "snapscore" });
  expect(screenNameFromSegments(["(tabs)", "profile"])).toBe("profile");
  expect(screenNameFromSegments(["contest", "[id]", "settlement"])).toBe("contest_settlement");
  expect(screenNameFromSegments(["r", "[token]"])).toBe("public_share");
});

test("does not contain a PostHog project token in the implementation source", () => {
  const files = [
    "../src/services/analytics.ts",
    "../src/services/analytics.web.ts",
    "../src/services/analytics-web.ts",
    "../src/services/analytics-screen.ts",
    "../app/_layout.tsx",
    "../app/scan/index.tsx",
    "../app/contest/[id]/settlement.tsx",
    "../package.json",
    "../package-lock.json",
  ];
  const source = files.map((file) => fs.readFileSync(path.join(__dirname, file), "utf8")).join("\n");
  expect(source).not.toMatch(/phc_[A-Za-z0-9]+/);
});
