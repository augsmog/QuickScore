require("tsx/cjs");
const fs = require("node:fs");
const path = require("node:path");
const { isAppReadyForSession } = require("../src/services/onboarding-gate.ts");

test("cross-device account sessions can enter without first-run onboarding", () => {
  expect(isAppReadyForSession({
    hasCompletedOnboarding: false,
    crossDeviceSharingEnabled: true,
    hasSession: true,
    isAnonymous: false,
    remoteUserId: "account-id",
  })).toBe(true);
});

test("onboarding bypass stays disabled outside cross-device mode", () => {
  expect(isAppReadyForSession({
    hasCompletedOnboarding: false,
    crossDeviceSharingEnabled: false,
    hasSession: true,
    isAnonymous: false,
    remoteUserId: "account-id",
  })).toBe(false);
});

test("anonymous sessions still need a linked remote user to bypass onboarding", () => {
  const base = { hasCompletedOnboarding: false, crossDeviceSharingEnabled: true, hasSession: true, isAnonymous: true };
  expect(isAppReadyForSession({ ...base, remoteUserId: null })).toBe(false);
  expect(isAppReadyForSession({ ...base, remoteUserId: "linked-user" })).toBe(true);
});

test("account handoff rollback is atomic, serialized, and refuses non-empty data", () => {
  const rollback = fs.readFileSync(path.join(__dirname, "../supabase/rollbacks/20261103071000_account_handoff.sql"), "utf8");
  expect(rollback).toMatch(/^\s*--[^\n]*\n(?:\s*--[^\n]*\n)*\s*BEGIN;/);
  expect(rollback).toContain("LOCK TABLE public.account_round_history, public.account_handoffs IN ACCESS EXCLUSIVE MODE");
  expect(rollback).toContain("IF EXISTS (SELECT 1 FROM public.account_round_history)");
  expect(rollback).toContain("OR EXISTS (SELECT 1 FROM public.account_handoffs)");
  expect(rollback).toMatch(/RAISE EXCEPTION 'account handoff rollback refused/);
  expect(rollback.trim().endsWith("COMMIT;")).toBe(true);
});
