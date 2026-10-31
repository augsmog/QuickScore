import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertNoDefaultPii,
  assertReplayMask,
  scrubSentryEvent,
  sentryReplayMask,
  sentrySendDefaultPii,
} from "../src/config/sentry-privacy.ts";

assert.equal(sentrySendDefaultPii, false);
assertNoDefaultPii(sentrySendDefaultPii);
assert.throws(() => assertNoDefaultPii(true), /sendDefaultPii/);

assert.deepEqual(sentryReplayMask, {
  maskAllText: true,
  maskAllImages: true,
  maskAllVectors: true,
});
assertReplayMask(sentryReplayMask);
assert.throws(() => assertReplayMask({ maskAllText: false, maskAllImages: true, maskAllVectors: true }), /masks/);
assert.throws(() => assertReplayMask({ maskAllText: true, maskAllImages: false, maskAllVectors: true }), /masks/);
assert.throws(() => assertReplayMask({ maskAllText: true, maskAllImages: true, maskAllVectors: false }), /masks/);

const event = {
  user: { id: "user-1", email: "golfer@example.com", username: "Golfer", name: "Golfer", ip_address: "203.0.113.5" },
  tags: { screen: "settings" },
};
const scrubbed = scrubSentryEvent(event);
assert.deepEqual(scrubbed.user, { id: "user-1" });
assert.equal(JSON.stringify(scrubbed.user).includes("golfer@example.com"), false);
assert.equal(JSON.stringify(scrubbed.user).includes("Golfer"), false);
assert.equal(JSON.stringify(scrubbed).includes("203.0.113.5"), false);

const emailOnly = { user: { email: "golfer@example.com", username: "Golfer", name: "Golfer" } };
scrubSentryEvent(emailOnly);
assert.equal(emailOnly.user, undefined);

const layout = fs.readFileSync("app/_layout.tsx", "utf8");
assert.match(layout, /sendDefaultPii:\s*sentrySendDefaultPii/);
assert.match(layout, /mobileReplayIntegration\(sentryReplayMask\)/);
assert.match(layout, /scrubSentryEvent/);
assert.match(layout, /assertReplayMask\(sentryReplayMask\)/);
assert.match(layout, /assertNoDefaultPii\(sentrySendDefaultPii\)/);
assert.doesNotMatch(layout, /sendDefaultPii:\s*true/);
assert.doesNotMatch(layout, /mobileReplayIntegration\(\s*\)/);
assert.doesNotMatch(layout, /maskAllText:\s*false|maskAllImages:\s*false|maskAllVectors:\s*false/);

const config = fs.readFileSync("src/config/sentry-privacy.ts", "utf8");
assert.match(config, /maskAllText:\s*true/);
assert.match(config, /maskAllImages:\s*true/);
assert.match(config, /maskAllVectors:\s*true/);
assert.match(config, /8\.4\.0/);

for (const file of ["app/_layout.tsx", "app/(tabs)/profile.tsx", "src/services/purchases.ts", "src/ui/ErrorBoundary.tsx"]) {
  const source = fs.readFileSync(file, "utf8");
  assert.doesNotMatch(source, /Sentry\.setUser/);
  assert.doesNotMatch(source, /setUser\(\s*\{[^}]*email/);
}
