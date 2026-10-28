# PR 35 support-page verdict

**Verdict: FAIL**

Independent check of https://github.com/augsmog/QuickScore/pull/35 at head `eb1cd278108e694aac8244696b9337a129a7c7f6` (`snapscore/support-page`). This review did not edit that branch. Base for the diff is `92b6c9b3638ba08ae964b20921f9b1ff079a7a04`. The privacy text compared below is blob `622c75ab783a31fc8d3471ad804ee8289f35e819` at both this head and `d5d3b97d1e8ee8198b6129e78ad4bc9e5dc8f0bc`.

Items 1, 2, 4, and 5 pass. Item 6 is pass-with-fixes: the CNAME steps match Cloudflare and GoDaddy, and the Pages project name `snapscore` already serves a different site. Item 3 fails because `august-industries.com` URLs are still in the app and on the privacy page.

## 1. Site build, local routes, policy bytes — PASS

`node scripts/build-public-pages.mjs` from `scoresnap/` after `npm ci` left `scoresnap/site` and `scoresnap/docs` clean (`git status --short` printed nothing).

`git rev-parse` of `scoresnap/docs/privacy-policy.md` is `622c75ab783a31fc8d3471ad804ee8289f35e819` at both `eb1cd278` and `d5d3b97`. `sha256sum` of that file is `c0ed86fee618ae63668dd28557623aa4e0fdad5a021ef9a7b69166b782601882` (48,757 bytes).

The served page is the HTML rendering of that file, not a raw copy of the blob. `renderPrivacyPage(markdown)` from `scoresnap/src/web/public-pages.ts` equals the committed `scoresnap/site/privacy/index.html` (62,852 bytes, including the trailing newline the build writes). The renderer does not rewrite sentences. It drops blank lines and markdown table-divider rows, wraps the wording in tags, and auto-links bare `https://` URLs and email addresses (`scoresnap/src/web/markdown.ts`). Stripping tags makes adjacent list items run together (`privacy.Account` versus `privacy. Account`) because the space lives in the markup, not because a sentence was removed.

Local static server on `127.0.0.1:8765` (Python `http.server`, which redirects a directory URL to the trailing slash):

| Request | Result |
| --- | --- |
| `GET /` | 200, 3,277 bytes, matches `site/index.html` |
| `GET /support` then `/support/` | 301, then 200, 5,185 bytes, matches `site/support/index.html` |
| `GET /privacy` then `/privacy/` | 301, then 200, 62,852 bytes, matches `site/privacy/index.html` |

Every `href` in the three pages is one of `#content` (id exists on `<main>`), `/support`, `/privacy`, `mailto:augie@autumn8.me`, or `https://snapscore.autumn8.me/support` or `/privacy`. There is no `<script>` and no `src`. An unsolicited `GET /favicon.ico` is 404; no page references that file.

`https://snapscore.autumn8.me` does not resolve (`curl` exit 6). That host is not in DNS yet. The PR says the site is not deployed. Those absolute links are the policy’s own URLs, not missing files in `scoresnap/site`.

## 2. Support page and App Store support URL — PASS

`GET /support/` is a real page. Title is `Support · SnapScore`. The brand line and the title use the app name SnapScore. The contact line is `mailto:augie@autumn8.me` (`scoresnap/site/support/index.html`, and again in the deletion section). `scoresnap/src/config/support.ts` sets `SUPPORT_EMAIL` to `augie@autumn8.me` and `SUPPORT_BASE_URL` to `https://snapscore.autumn8.me`.

The page has a contact method, the app name, and working copy for scan, review, settlement, join-by-code, a wrong scan, and account deletion. Deletion says the in-app delete does not remove server data and that email is how that request is made. A search of the served HTML for placeholder, coming soon, lorem, todo, and `johnaugustjones` found none.

Apple’s platform version information says the Support URL must lead to actual contact information (a legal address, email, or phone) so users can reach the developer. Guideline 1.5 says the app and Support URL need an easy way to contact you. An email on a real page meets that. Sources: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information and https://developer.apple.com/app-store/review/guidelines/ (Guideline 1.5), read with the Pages docs on 28 October 2026.

## 3. In-app links and august-industries URLs — FAIL

Help and both Privacy Policy controls point at the new host.

- Profile **Help & Support** calls `openSupport` (`scoresnap/app/(tabs)/profile.tsx:696`). `openSupport` opens `SUPPORT_URL` (`scoresnap/src/config/support-links.ts:4-6`), which is `https://snapscore.autumn8.me/support` (`scoresnap/src/config/support.ts:2-9`).
- Settings Privacy Policy opens `SUPPORT_BASE_URL + "/privacy"` (`scoresnap/app/settings.tsx:611`).
- Sign-in Privacy Policy opens the same expression (`scoresnap/app/auth/sign-in.tsx:614`).

That is `https://snapscore.autumn8.me/privacy`. The diff against `92b6c9b` only changes those three call sites (empty Help handler to `openSupport`; both privacy `openURL`s from `https://august-industries.com/snapscore/privacy` to the new URL).

`august-industries.com` is still present. `git grep august-industries.com eb1cd278` hits:

- Live Terms control, sign-in: `Linking.openURL("https://august-industries.com/snapscore/terms")` at `scoresnap/app/auth/sign-in.tsx:611`.
- Live Terms control, settings: `Linking.openURL("https://august-industries.com/snapscore/terms")` at `scoresnap/app/settings.tsx:631`.
- The same URLs inside `scoresnap/docs/privacy-policy.md` (lines 5, 11, 38, 215) and the rendered `scoresnap/site/privacy/index.html` (lines 87, 90, 92, 160).

The support test only rejects `august-industries.com/snapscore/privacy` and `johnaugustjones@gmail.com` in `profile.tsx`, `settings.tsx`, and `sign-in.tsx` (`scoresnap/tests/support-page.test.cjs:80`). It does not reject the Terms URL, so the suite stays green with those links in place.

`scoresnap/app.json` has Sentry organization slug `august-industries`. That is not a URL.

The policy file is required to stay blob `622c75ab`, so the privacy page keeps the historical `august-industries.com` sentences. That does not force the live Terms buttons to keep opening that host. Those two `openURL` calls are the failure.

`git grep` at base `92b6c9b` also shows the Terms URL (`sign-in.tsx:610`, `settings.tsx:630`) plus the old privacy URLs. This PR removed the privacy URLs from the controls and left the Terms URLs. The failure scored here is the head, not a test run on main. Jest was not run at `92b6c9b`.

## 4. Owner UI rules — PASS

This PR does not change those implementations. `git rev-parse` blobs match `92b6c9b` and `eb1cd278`:

| File | Blob |
| --- | --- |
| `scoresnap/app/contest/[id]/scorecard.tsx` | `493738b491e60c5ad81a4d99107f5900f91fbd16` |
| `scoresnap/app/contest/[id]/_layout.tsx` | `1342cbab2fa70ffa0c26dac3df475c727e143a12` |
| `scoresnap/src/ui/LiveShare.tsx` | `e568209319292794305353716c8e6d811da60cad` |
| `scoresnap/src/ui/ContestJoinCode.tsx` | `5341c8c15c98c4d79cdabb54c2b84ed715918198` |
| `scoresnap/src/ui/gameSheetStyle.ts` | `b3d81dc6af2bbb764a60e1cd34f45125961cbd80` |
| `scoresnap/app/(tabs)/index.tsx` | `eeed86e9db5a80f172c4181e7fc250db749a7e88` |

`sign-in.tsx` did change, and only by the import plus the Privacy Policy URL. The join control is still behind `CROSS_DEVICE_SHARING_ENABLED &&` (`scoresnap/app/auth/sign-in.tsx:200`). The home join control is the same (`scoresnap/app/(tabs)/index.tsx:104`).

- Big hole header: the scorecard paints `HOLE {nn}` at `fontSize: 40` outside the player `ScrollView` (`scoresnap/app/contest/[id]/scorecard.tsx:332-361`, `505`).
- Share and join take no layout space when sharing is off. `LiveShare` returns `null` before any view (`scoresnap/src/ui/LiveShare.tsx:11-13`). `ContestJoinCode` returns `null` (`scoresnap/src/ui/ContestJoinCode.tsx:24-26`). Its `useEffect` still runs first and can write a join code into the store (`ContestJoinCode.tsx:12-14`); that effect does not mount a view. The home and sign-in join rows are omitted by `&&`, so they do not reserve padding.
- Pinned contest header: `testID="contest-header"` sits above the tab screen, not inside a `ScrollView` (`scoresnap/app/contest/[id]/_layout.tsx:74-78`). With no team banner, the styles are padding top 8 and bottom 12, a row whose back button is border 1 + padding 8 + a 20px icon + padding 8 + border 1 (38) plus `marginBottom` 12, and tabs with container padding 4, tab `paddingVertical` 8, and `fontSize` 10 (`_layout.tsx:178-214`). That sum is under 120. The Sample Round fixture has `hasTeams: false` (`scoresnap/src/stores/contest-store.ts:402-407`), so the team banner in the same header is not part of that screen. This review did not boot the app or measure a rendered box, and it does not claim a height failure on main.
- Game info sheet: `GAME_SHEET_STYLE` is a 1px top, left, and right border in `COLORS.sheetBorder` plus an upward shadow (`shadowOffset.height` -4, `shadowOpacity` 0.12, `shadowRadius` 12, `elevation` 12) (`scoresnap/src/ui/gameSheetStyle.ts:5-18`). The home game-info sheet uses it (`scoresnap/app/(tabs)/index.tsx:505`).

## 5. Secrets, CI, Jest — PASS

The diff against `92b6c9b`, excluding the generated site HTML, has no `sk_live`, `sk_test`, `whsec_`, `AKIA`, private-key block, `eyJhbGci`, or service-role assignment. `scoresnap/site` has none of those either. The privacy page quotes Turnstile site key `0x4AAAAAAFnthkbq7bh9N5bW` because that sentence is in blob `622c75ab` (`scoresnap/docs/privacy-policy.md` and `scoresnap/src/config/captcha.ts:5`). A site key is the public widget key, not a secret added by this PR.

GitHub check runs on `eb1cd278108e694aac8244696b9337a129a7c7f6`, all `completed` / `success`, event `pull_request`:

| Check | Run |
| --- | --- |
| schema-drift | https://github.com/augsmog/QuickScore/actions/runs/40603573140 |
| tournament-e2e | https://github.com/augsmog/QuickScore/actions/runs/40603573168 |
| web-smoke | https://github.com/augsmog/QuickScore/actions/runs/40603573268 |
| ios-boot-smoke | https://github.com/augsmog/QuickScore/actions/runs/40603573108 |

Those four workflows are the `.github/workflows` set. The legacy commit-status API returns `pending` with an empty `statuses` array because these are check runs, not commit statuses. `total_count` on the check-runs API is 4.

Jest at this head, from `scoresnap/`: `npm test -- --runInBand` → `Test Suites: 22 passed, 22 total` / `Tests: 361 passed, 361 total` / exit 0 / 14.07s. Jest was not run at `92b6c9b`.

## 6. Cloudflare Pages and GoDaddy CNAME — PASS-WITH-FIXES

The DNS and dashboard steps match Cloudflare’s custom-domain doc (https://developers.cloudflare.com/pages/configuration/custom-domains/, last updated 21 April 2026, fetched 28 October 2026).

- `snapscore.autumn8.me` is a subdomain. DNS can stay at GoDaddy. A CNAME to `<project>.pages.dev` is the documented record. An apex would have to be a Cloudflare zone. The instructions do not tell anyone to CNAME the apex.
- The hostname also has to be added under Workers & Pages → the project → Custom domains → Set up a domain. A CNAME alone, before Pages knows the hostname, returns HTTP 522. The PR says that.
- GoDaddy’s CNAME help says Name is the host prefix without the domain (examples `blog` and `shop`), and the default TTL is one hour (https://www.godaddy.com/help/add-a-cname-record-19236). Name `snapscore`, value `snapscore.pages.dev`, TTL 1 Hour matches that. The warning that typing `snapscore.autumn8.me` into GoDaddy’s Host field stores `snapscore.autumn8.me.autumn8.me` matches GoDaddy appending the zone.

Wrangler’s current Pages commands (https://developers.cloudflare.com/workers/wrangler/commands/pages/) accept `pages project create <name> --production-branch` and `pages deploy [DIRECTORY] --project-name --branch`. `npx wrangler pages project create snapscore --production-branch main` and `npx wrangler pages deploy scoresnap/site --project-name snapscore --branch main` use those flags. Deploying branch `main` when that is the production branch is what `snapscore.pages.dev` and an attached custom domain serve. `wrangler deploy` would publish a Worker; the PR says not to do that, and the Expo web app stays on `snapscore-web.augie-os.workers.dev`. The token scope named in the PR, Account → Cloudflare Pages → Edit, is the Pages edit permission for that API.

The fix: do not assume the project name `snapscore` is free. On 28 October 2026 `https://snapscore.pages.dev/support` and `/privacy` returned HTTP 200 with a Vite shell (`<div id="root">`, `/vite.svg`, title `SnapScore`), not this PR’s static pages. The bundle text describes image analysis, a generic privacy policy, and routes `/privacy` and `/terms`. `https://snapscore.autumn8.me` does not resolve, which matches “not deployed” for the custom domain. `pages project create snapscore` fails if that name is already on the account, and `pages deploy --project-name snapscore` would replace whatever that project currently serves. Pick a free project name, or confirm that replacing the existing Pages project is intended, before running those two commands. The CNAME target has to be that project’s `*.pages.dev` host.
