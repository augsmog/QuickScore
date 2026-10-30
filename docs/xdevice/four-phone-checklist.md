# Four-phone acceptance (Augie)

Use an explicitly approved disposable test environment and a development build
with sharing enabled. This does not authorize live configuration changes or a
release. Record build SHA, iOS versions, four identity IDs, event/round/player IDs
and times; never record tokens or CAPTCHA answers.

- [ ] Host signs in with the real provider; three other phones establish separate
  guest identities through the actual CAPTCHA flow. Request/approve player and
  scorer slots. Pending guests see no roster; approved guests discover the event.
- [ ] In airplane mode, all four enter disjoint scores; host and a player also edit
  the same hole. Include a clear and two rounds with different courses/assignments.
  Every successful local save shows a queued value immediately. Reconnect in a
  different order: all authorized views converge, overlap shows explicit conflict,
  Keep current / Use my score work, clear stays clear with its newer version.
- [ ] While offline with queued edits, force-quit each app and reboot one phone.
  Relaunch: same identity and drafts survive SecureStore/Keychain + SQLite restore.
  Reconnect; no duplicate accepted score after a lost response. Repeat with the
  app backgrounded during replay and a session refresh.
- [ ] Host revokes one connected phone and transfers its player slot to another.
  Revoked view disappears on authorized refresh; queued/replayed writes fail and
  remain denied drafts. Background/foreground and reconnect the revoked phone;
  it cannot recover roster/scores. A socket hint alone never restores access.
- [ ] Sign out/switch identity with drafts present. No old actor's scores or queue
  appear or transmit as the new actor. Exercise a denied storage write (if the
  test build supports fault injection): input remains and UI does not claim saved.
- [ ] Check provider/cold guest routing, app-link join, native keyboard/accessibility,
  old binary behavior and sharing-off offline scoring. Capture only sanitized
  evidence; report failures with steps and expected/actual result.

Automated disposable tests cover protocol behavior; these steps establish native
storage, lifecycle, provider/CAPTCHA and physical-device acceptance.
