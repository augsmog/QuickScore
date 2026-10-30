# Public pages (snapscore.autumn8.me) rollback

Change: GS-AS2 privacy policy goes live (Augie Keep 2026-10-30 08:18 PT, card t771s5413).
Scope: `docs/privacy-policy.md`, the generated `site/privacy/index.html`, and `tests/support-page.test.cjs`. No app code.

Hosting: Cloudflare Pages project `snapscore-site` (direct upload of `scoresnap/site`), custom domain `snapscore.autumn8.me`.
Previous production deployment: `47815d0e-0950-44d0-98d4-896c930a2bd6` (PR #35, commit f404536).

Rollback (pick one):
1. Fastest, no rebuild: Cloudflare API `POST /accounts/{account_id}/pages/projects/snapscore-site/deployments/47815d0e-0950-44d0-98d4-896c930a2bd6/rollback`
   (or Pages dashboard > snapscore-site > Deployments > 47815d0e > Rollback). Then `curl -sL https://snapscore.autumn8.me/privacy/ | grep "Draft dated 27 October 2026"`.
2. Source revert: `git revert <merge commit>` on main, `node scripts/build-public-pages.mjs`, then redeploy `scoresnap/site` with `scripts/deploy-public-pages.sh deploy`.

Rollback restores the earlier draft-from-code page; it does not touch the app, Supabase or App Store Connect.
