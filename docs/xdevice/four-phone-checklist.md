# Two-phone acceptance (Augie)

Allow 35 minutes. Use two iPhones. Players 3–4 use separate signed-in browser
profiles on a laptop at snapscore.autumn8.me or the test web URL.
Use a designated test contest. Do not change production configuration.

## 0. Prereqs (2 min)

1. Check the build has cross-device sharing ON.
   TestFlight build 25 has sharing OFF (EXPO_PUBLIC_FEATURE_CROSS_DEVICE_SHARING is not set in eas.json testflight or the EAS production environment; code default is off). A sharing-on build is required before this checklist.
2. Sign in with two separate Apple/SnapScore accounts on the phones. Prepare
   two more SnapScore identities in separate laptop browser profiles.
3. Sign in to the sandbox Apple tester on the host phone for Pro testing.

Expected: Both phones run the sharing-on build. Each player has a separate identity.

- [ ] PASS  - [ ] FAIL

## 1. Share / join / approve (6 min)

1. On phone 1, create a contest with the host and three named player slots.
   Tap Enable online sharing. Share the invite with phone 2 and both web tabs.
2. On phone 2, open the invite, enter a display name and tap Find contest.
   Repeat in both web tabs. Check each pending screen before approval.
3. On phone 1, open Online sync. Tap Retry sync. Approve each request into its
   distinct named slot using Approve as <name>. Confirm each approval.
4. Reopen the invite on approved devices if needed. Enter a score on phone 2.
   Tap Retry queued scores; on the host tap Retry sync.

Expected: Pending players see no roster or scores. Approved players see the
confirmed totals and their own editable holes. All devices show the saved score.

- [ ] PASS  - [ ] FAIL

## 2. Airplane-mode conflict (6 min)

1. Refresh both phones. Note the same player and hole on both screens.
2. Turn airplane mode ON on both phones. Turn Wi-Fi OFF too. Enter different
   scores for that same cell: host on phone 1, approved player on phone 2.
3. Check each local value is queued or waiting to sync before leaving the screen.
4. Reconnect phone 2 first, then phone 1. Use Retry queued scores / Retry sync.
   Review the explicit conflict and both Keep current / Use my score choices.
5. Tap Keep current and confirm. Refresh all devices and compare scores.
   Repeat on another hole, reconnect host first, and choose Use my score.

Expected: Offline edits show immediately as queued, separate from confirmed
scores. Overlap produces a conflict. Each confirmed choice removes the conflict
and all four views converge to that choice. No silent overwrite occurs.

- [ ] PASS  - [ ] FAIL

## 3. Force-quit and reboot with pending edits (6 min)

1. Put both phones in airplane mode with Wi-Fi OFF. Enter different, unused holes.
   Check both show saved queued values.
2. Force-quit both apps. Reboot phone 2. Relaunch both while still offline.
3. Check the same identities and pending edits return. Reconnect phone 2, then
   phone 1. Retry sync. Background and reopen each app during replay.
4. Compare the holes and confirmed totals on both phones and both web tabs.
   Retry again and check totals do not change a second time.

Expected: Queued edits survive app termination and reboot. Reconnect accepts
each edit once. There is no score loss, duplicate score or duplicate total.

- [ ] PASS  - [ ] FAIL

## 4. Remove device lockout (1 min)

BLOCKED until a host remove-device control ships (covered by the automated web test via the backend call).
The app currently has no host control to remove a device. Record BLOCKED today.

1. When the control ships, queue a phone 2 edit offline. On phone 1, remove phone 2.
2. Reconnect phone 2 and retry. Reload, background and reopen it.
3. Attempt a new score if a stale screen still allows entry. Check the other views.

Expected: Phone 2 loses the roster and scores on authorized refresh. Its queued
or new writes are denied and retained as denied drafts. Other devices never
receive those writes. Reopening cannot restore access without new approval.

- [ ] PASS  - [ ] FAIL  - [ ] BLOCKED

## 5. Sign out / switch user with drafts present (5 min)

1. On phone 2, go offline, save a new score and check it is queued.
2. Sign out. Reconnect and sign in with a different SnapScore account. Open the
   invite without approving the new account yet.
3. Background and reopen the app. Retry if available. Check the host and web tabs.
4. Sign back into the original account. Check retained drafts and retry status.

Expected: The new account sees no old account's roster, scores or queue. It does
not send the old account's pending edit. The old account's drafts remain isolated;
any later replay must run as that original account with valid permission.

- [ ] PASS  - [ ] FAIL

## 6. Pro on host + carryover to phone 2 (sandbox) (8 min)

TestFlight purchases are sandbox purchases and are not charged.

1. On the host, open Profile → Upgrade to SnapScore Pro. Select Pro and complete
   the sandbox purchase. Return to Profile.
2. Check Profile shows Unlimited scans (Pro) and Manage Subscription. Relaunch
   and check entitlement state again.
3. Finish section 5 first, then sign phone 2 into the same SnapScore account as the
   host. Record whether Pro appears, without treating sign-in alone as guaranteed.
4. Use the same sandbox Apple ID on phone 2. Open the paywall and tap Restore
   Purchases. Read the result, return to Profile and check Pro is active.
   If already Pro, check Manage Subscription instead.

Expected: A successful purchase updates the local entitlement. Restore Purchases
with the same sandbox Apple ID restores an available entitlement on phone 2.
The service defines Purchases.logIn through identifyUser, but the app does not
call it; startup configures RevenueCat without a SnapScore user ID. Therefore
same SnapScore account sign-in alone is not implemented as guaranteed Pro
carryover. The supported path to verify here is Apple purchase restoration.
Profile exposes upgrade/manage; Restore Purchases is on the paywall.
Record a failure if restore reports success but Profile remains free.

- [ ] PASS  - [ ] FAIL

## Record (1 min)

1. Record build number, iOS versions, start/end times, and pass/fail per section.
   Mark section 4 BLOCKED. Add brief expected/actual notes for failures.
2. Keep evidence free of tokens, invite codes and passwords.

Expected: Another tester can reproduce each failure from the record.

- [ ] PASS  - [ ] FAIL

Automated CI (`xdevice-four-context.mjs`) covers 4-identity protocol behaviour; this checklist covers native storage, lifecycle, purchases and real phones.
