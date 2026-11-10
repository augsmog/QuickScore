# xdevice-stack receipt: anonymous guest scope

Run: [42908769684](https://github.com/augsmog/QuickScore/actions/runs/42908769684)
Event: `workflow_dispatch` on `main`
Head SHA: `e8f98acffbf90da60d876ed5ffd8d82110682d25`
Workflow conclusion: `success`

| Job | Conclusion |
|---|---|
| [`xdevice-four-identities`](https://github.com/augsmog/QuickScore/actions/runs/42908769684/job/130153587351) | `success` |
| [`xdevice-browser-two-users`](https://github.com/augsmog/QuickScore/actions/runs/42908769684/job/130153588152) | `success` |

The `xdevice-four-identities` job passed its anonymous guest journey on the disposable stack. The workflow enables anonymous sign-ins only in that disposable stack, and the journey calls `signInAnonymously()` and asserts the resulting user is anonymous. This is evidence for the disposable-stack journey only; it is **not live-config acceptance**.

Live auth-config is a separate read-only automated check, as mapped in `/workspace/aos-state/cuts/2026-11-10-automated-acceptance-t1263u.md` (AUG-397 row and AUG-404 row): [AUG-397](https://linear.app/autumn8me/issue/AUG-397) requires release-config simulator join plus the read-only auth-config check; [AUG-404](https://linear.app/autumn8me/issue/AUG-404) includes the automated guest journey. This run does not establish the live auth-config result. No physical-device gate remains for this evidence; acceptance uses automated checks.
