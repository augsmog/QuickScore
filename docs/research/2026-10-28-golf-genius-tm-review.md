# Golf Genius Tournament Management vs SnapScore

**Date:** 28 October 2026
**Audience:** Augie, SnapScore
**Scope:** Public sources only. No employer, customer, or non-public Golf Genius material.
**Repo read:** `scoresnap/docs/`, planning notes under `scoresnap/supabase/`, and the app code those docs point at. There is no top-level product README; the app’s own docs are under `scoresnap/docs/`.

## Executive summary

Golf Genius sells Tournament Management to facilities in two named tiers, Club and Club Premium. On the US and Canada rate card for facilities of up to 36 holes, retrieved 28 October 2026, **TM Club is $1,425 per year plus a $200 onboarding fee**, and **TM Club Premium is $4,275 per year plus a $500 onboarding fee**. [Tournament Management](https://golfgenius.com/products/tm) [TM pricing](https://www.golfgeniussoftware.com/products/tm/pricing) A separate Trip Manager product is **$149 per trip**, covering up to 12 rounds and 36 players. [Trip Manager](https://golfgenius.com/products/trip-manager) A newer entry product, Golf Genius Golf Hub, was announced on 10 August 2026 for a page, a roster, and entry fees. Its price is **not published**. [2026 release announcements](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements)

Club is the back-office product: cloud event and league setup, the format library, rosters, pairings, basic event pages, completed-results TV boards, printed materials, GHIN, and Golf Hub flyers. Premium adds the phone: live scoring, live leaderboards, Live Activities, custom websites, advanced registration and card payments, open tee times, sponsor placements, club-system integrations, and texting. [Tournament Management](https://golfgenius.com/products/tm) The help center is the size of an enterprise suite (Start Here 108 articles, Guides & Collections 75, General Management 158, plus dedicated collections for pairings, formats, handicaps, registration, print, and TV). [Help Center home](https://docs.golfgenius.com/en/)

SnapScore today is a phone app for a group that already has a card. It scores 29 games, can read a scorecard photo, settles side bets, and keeps a local multi-round shell. It does not yet run a club season: cross-device scoring, leagues, GHIN, signup, and a real tee sheet are planned or missing. The league and round-sharing plans already name the gap. [Contest sharing spec](scoresnap/docs/spec-contest-sharing.md) [M2 foundation](scoresnap/supabase/M2-FOUNDATION.md)

The middle and lower market this note is aimed at is a weekly league, a nine-and-dine, a member-guest, or a public-course outing that will not pay $1,425 to $4,275 a year. The switch kit is small: a season roster, a weekly round, manual pairings, net stroke play, skins, best ball, a shared leaderboard, and a signup list. Camera scan, a price under the published Golf Genius cards, and a setup measured in minutes are the places SnapScore can win. Publisher merge, cart GPS, tee-sheet integrations, association handicapping, calcuttas, and the AI tee-sheet agent are enterprise weight for this buyer.

Suggested pricing posture, not a decided price: keep the individual in-app prices that are in code today ($2.99 a month, $19.99 a year, $29.99 lifetime) until a separate decision. [purchases.ts](scoresnap/src/services/purchases.ts) Price a league season at or under Trip Manager’s published **$149 per trip**, and keep any facility plan under the **$1,425** Club list. Charge organizers nothing until cross-device leagues actually work.

## How tiers were assigned

A row is **Both** or **Premium** only when the live comparison table or the product-matrix PDF names it. The PDF was created 15 September 2023 and is still the file linked from the help article dated 31 March 2025. [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) [Club and Premium features](https://docs.golfgenius.com/en/articles/10776723-golf-genius-tournament-management-club-premium-features)

A row is **Club** when a help article is written for TM Club users and describes the workflow they use. Premium is documented as everything in Club plus the Premium rows, so a Club workflow is also available on Premium. [Upgrade to Premium](https://docs.golfgenius.com/en/articles/10778464-how-to-upgrade-to-golf-genius-tm-club-premium)

A row is **Unclear** when the help center or a release note documents the feature and no retrieved page says Club, Premium, or both. Parenthetical notes are context. They are not a tier. Several help articles say “only available with the following products” and then show the product names in an image. Those names were not read as text. Live scoring, digital scorecards, and live skins take their tier from the comparison table’s mobile-app row.

SnapScore status:

- **Have** — implemented in app code or a status doc that matches the code.
- **Partial** — a slice exists and a club could not run the Golf Genius job with it.
- **Planned** — a planning doc in this repo describes it and the product does not ship it.
- **Missing** — no implementation and no planning doc for that capability.

Priority is for a club or league that will not pay Golf Genius facility prices: **Must-have**, **Next**, **Later**, **Skip**, or **Win** (already in SnapScore and worth keeping in front of buyers).

## Published pricing

Retrieved 28 October 2026 unless a source date is shown. “Not published” means the public page says to make contact, or no figure was found.

| Item | Price | What the page says | Source |
| --- | --- | --- | --- |
| TM Club, US and Canada, facilities up to 36 holes | $1,425 per year, plus $200 one-time onboarding | Event and league management, basic event websites, full tournament library, TV leaderboards, email communications | [Tournament Management](https://golfgenius.com/products/tm), [pricing](https://www.golfgeniussoftware.com/products/tm/pricing) |
| TM Club Premium, same facilities | $4,275 per year, plus $500 one-time onboarding | Everything in Club, plus live scoring, online registration and payments, open tee times, text communications | Same two pages |
| Facilities over 36 holes, golf associations, and customers outside the US and Canada | Not published | The product page lists sales contacts and does not list a price | [Tournament Management](https://golfgenius.com/products/tm) |
| Indoor facilities | Not published | “Contact … for special pricing.” | [pricing](https://www.golfgeniussoftware.com/products/tm/pricing) |
| One-time events, and leagues sold on their own | Not published | “Contact us for more information.” | [pricing](https://www.golfgeniussoftware.com/products/tm/pricing) |
| Trip Manager | $149 per trip | Up to 12 rounds and 36 players. The TM page also says trip pricing starts at $149 | [Trip Manager](https://golfgenius.com/products/trip-manager), [Tournament Management](https://golfgenius.com/products/tm) |
| Golf Genius Golf Hub, the 10 August 2026 entry product | Not published | Publish an event or league page, collect entry fees and registrations, manage a roster, then inquire about upgrading to Club or Premium | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements), [creating an account](https://docs.golfgenius.com/en/articles/15649418-golf-genius-golf-hub-creating-an-account-and-purchasing) |
| Golf Hub inside an existing TM subscription | No extra software fee | Card-processing fees still apply. Spotlight dated 25 January 2022, help article dated 8 April 2025 | [Spotlight: Golf Hub](https://docs.golfgenius.com/en/articles/10778434-spotlight-golf-hub) |
| Card-processing rate | Not published | Described only as “normal credit card processing fees” | [Spotlight: Golf Hub](https://docs.golfgenius.com/en/articles/10778434-spotlight-golf-hub) |
| Professional Suite on the same TM page | $9,975 | Bundle of Tournament Management ($4,275), Golf Shop ($2,600), CoachNow Academy ($2,700), and Operation 36 ($2,900). The page says “Save $2,000” and “does not include onboarding fee.” Those four list prices sum to $12,475. This note does not invent a reconciliation | [Tournament Management](https://golfgenius.com/products/tm) |
| Association channel, Golf Association of Michigan | TM Club included in the club’s association membership. In 2023, Premium for member clubs with 36 holes or fewer was $3,500 for one year plus a $500 onboarding fee, renewing “at the prevailing annual subscription cost” | The page footer is ©2026. The $3,500 figure is explicitly “In 2023,” so it is not the current list price | [GAM Golf Genius TM](https://gam.org/membership/club-services/golf-genius-tm/) |
| Conflicting public rate card | $1,200 Club and $3,700 Premium, each with the same $200 and $500 onboarding fees, still for up to 36 holes | No date on the page. A public LinkedIn post dated 23 February 2024 reported February 2024 prices of Club $1,200 and Premium $3,700. This research did not re-open the full LinkedIn page, so that history is reported, not a rate card. The current golfgenius.com and golfgeniussoftware.com cards are the ones used above | [HPE pricing](https://hpe.golfgenius.com/products/tm/pricing), [LinkedIn post](https://www.linkedin.com/feed/update/urn:li:activity:7166876875301093376) |
| Secondary check of the current card | $1,425 and $4,275, checked 13 September 2026 by the page’s author | A competitor’s comparison page, used only as a date check against the live card | [Links Meridian](https://linksmeridian.com/alternatives/golf-genius) |
| SnapScore individual Pro, in this repo | $2.99 / month, $19.99 / year, $29.99 lifetime | Code comment. The March 2026 gap analysis repeats those figures and suggests other prices. Third-party app prices in that analysis were not re-checked for this note | [purchases.ts](scoresnap/src/services/purchases.ts), [RELEASE_GAP_ANALYSIS.md](scoresnap/docs/RELEASE_GAP_ANALYSIS.md) |

The LinkedIn post, as returned by search, also reported earlier pairs: May 2022 Club $600 and Premium $3,100; March 2023 Club $900 and Premium $3,500; January 2024 Club $900 and Premium $3,700. Same caveat: reported, not re-opened, not a Golf Genius rate card. [LinkedIn post](https://www.linkedin.com/feed/update/urn:li:activity:7166876875301093376)

Home-page scale, same retrieval: 11,000+ facilities, 41,000,000+ rounds, and 60+ (the page does not label the 60). The Tournament Management section of the same home page says over 10,000 clubs and 40,000,000+ rounds. [Home](https://www.golfgenius.com/)

The iPhone and iPad app is free, rated 4.8 from 75K ratings, requires iOS 15.1 or later, and the listing showed version 20.0 dated Oct 12 with no year on that line. Copyright on the listing is © 2025. What’s New on that version mentions a club Feed rolling out to a limited number of accounts. [App Store](https://apps.apple.com/us/app/golf-genius/id555651262) The 2023 product matrix says the live-scoring app is free for iPhone, iPad, and Android. [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) This review did not open a Google Play listing, so current Android version and rating are not verified.

## Feature inventory

Counts by category are at the end of the table.

| Feature | Category | GG tier | SnapScore status | Priority for low/mid market | Source |
| --- | --- | --- | --- | --- | --- |
| Cloud-based manager access, nothing to install | Platform | Both | Partial — contests live on the device; Supabase is wired for auth and a tournament sync helper, not a club console | Must-have | [TM comparison](https://golfgenius.com/products/tm) |
| Product support: knowledge base, online support, live phone | Platform | Both | Missing | Skip | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| Email communications | Platform | Both | Missing | Next | [TM pricing block](https://golfgenius.com/products/tm) |
| Extra languages on the app, member portal, and manager site | Platform | Unclear | Missing | Skip | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Event and league management for a season | Events and leagues | Both | Planned — local contests and a multi-round flag exist; leagues are named as M9 after rounds and tournaments | Must-have | [TM comparison](https://golfgenius.com/products/tm), [M2 foundation](scoresnap/supabase/M2-FOUNDATION.md) |
| Season-long competitions: points, ringers, birdies | Events and leagues | Both | Missing | Must-have | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| Aggregate a season and keep the best X of Y rounds | Events and leagues | Both | Missing | Must-have | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats) |
| League round signups: in or out, add a guest, add another member, message the manager | Events and leagues | Unclear | Missing | Must-have | [Rounds and scheduling](https://docs.golfgenius.com/en/articles/10776882-event-league-profile-rounds-scheduling) |
| Rosters, divisions, rounds, pairings, and points inside league management | Events and leagues | Both | Partial — named groups, a team string, and local rounds; no season roster or flight list | Must-have | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| Autofill divisions from handicap, age, and gender, and refill them | Events and leagues | Unclear | Missing | Next | [2025 releases](https://docs.golfgenius.com/en/articles/11030977-2025-release-announcements) |
| Teams whose members are not in the same foursome | Events and leagues | Both | Partial — team id on a player and team calculators; pairings are not built around a team list | Next | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats) |
| Season money list that rolls purse up across events | Events and leagues | Premium | Missing | Later | [Awards: points and purse](https://docs.golfgenius.com/en/articles/10778635-awards-points-and-purse) |
| Player statuses DQ, WD, NS, NC, DNF | Events and leagues | Unclear | Partial — `WD` and `NS` only | Next | [Tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup), [types.ts](scoresnap/src/engine/types.ts) |
| Non-golf events (seminars and meetings) with registration kept and golf menus removed | Events and leagues | Unclear | Missing | Skip | [2025 releases](https://docs.golfgenius.com/en/articles/11030977-2025-release-announcements) |
| Clone up to 10 events or leagues, choosing what to copy | Events and leagues | Unclear | Missing | Later | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Master-roster backfill when someone registers | Events and leagues | Unclear | Missing | Later | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Manual pairings: create, swap, add, remove | Scheduling | Both | Partial — manual groups and copy-previous-round | Must-have | [Creating pairings](https://docs.golfgenius.com/en/articles/10778284-creating-new-pairings), [tournament rounds](scoresnap/app/contest/[id]/tournament-rounds.tsx) |
| Pairing sizes from twosomes through sixsomes, sevensomes and eightsomes, or no tee sheet | Scheduling | Unclear | Partial — groups with no pairing-size rules | Must-have | [Scheduling and pairings](https://docs.golfgenius.com/en/collections/12012986-scheduling-and-pairings) |
| Automatic pairings: random, fewer repeats, AB through ABCDEF, by flight, keep apart or together | Scheduling | Unclear | Missing | Next | [Scheduling and pairings](https://docs.golfgenius.com/en/collections/12012986-scheduling-and-pairings) |
| Pair from previous results, a spreadsheet column, or entry order | Scheduling | Unclear | Missing | Later | [Creating pairings](https://docs.golfgenius.com/en/articles/10778284-creating-new-pairings) |
| Tee times, starter times, reverse order, waves, split tees, cross-nines | Scheduling | Unclear | Partial — optional `teeTime` text on a group | Must-have | [Pairings FAQ](https://docs.golfgenius.com/en/collections/12013037-scheduling-and-pairings-faq), [contest-store.ts](scoresnap/src/stores/contest-store.ts) |
| Shotgun starts and shotgun hole priority | Scheduling | Unclear | Missing | Next | [Scheduling and pairings](https://docs.golfgenius.com/en/collections/12012986-scheduling-and-pairings) |
| Round-robin scheduling and seeding | Scheduling | Unclear | Missing | Later | [Scheduling and pairings](https://docs.golfgenius.com/en/collections/12012986-scheduling-and-pairings) |
| Open tee times: the player picks a time and adds other people | Scheduling | Premium | Missing | Next | [TM comparison](https://golfgenius.com/products/tm) |
| Default course and tee by gender, division, or flight | Scheduling | Unclear | Missing | Next | [Scheduling and pairings](https://docs.golfgenius.com/en/collections/12012986-scheduling-and-pairings) |
| Lock an announced pairing so it cannot be regenerated (Japan Golf Association) | Scheduling | Unclear | Missing | Skip | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Full format library: single round, multi-round, bracket, Ryder Cup, round robin | Formats | Both | Partial — 29 round games, no bracket, Ryder Cup, or round robin | Must-have | [TM comparison](https://golfgenius.com/products/tm), [GAMES_STATUS.md](GAMES_STATUS.md) |
| Individual stroke play | Formats | Both | Have | Win | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats), [GAMES_STATUS.md](GAMES_STATUS.md) |
| Stableford | Formats | Both | Have | Win | [Tournament formats](https://docs.golfgenius.com/en/collections/12012202-tournament-formats), [GAMES_STATUS.md](GAMES_STATUS.md) |
| Best ball, including how many balls count on a par or a hole | Formats | Both | Partial — best ball and four-ball; balls-by-par and balls-by-hole are absent | Must-have | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats) |
| Scramble, including larger pairings and a 2x2 scramble | Formats | Both | Partial — scramble calculator only | Next | [Tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup) |
| Shamble | Formats | Both | Have | Win | [Tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup), [GAMES_STATUS.md](GAMES_STATUS.md) |
| Alternate shot, and Chapman / greensomes / Pinehurst | Formats | Both | Have | Win | [Tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup), [GAMES_STATUS.md](GAMES_STATUS.md) |
| Singles and four-ball match play | Formats | Both | Have | Win | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats), [GAMES_STATUS.md](GAMES_STATUS.md) |
| Match play versus par, and a 36-hole match | Formats | Unclear | Missing | Later | [Tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup) |
| Nassau: front nine, back nine, and overall | Formats | Both | Have, including presses | Win | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats), [GAMES_STATUS.md](GAMES_STATUS.md) |
| Skins, with or without carry, plus validation | Formats | Both | Partial — skins and carry; validation is absent | Must-have | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats) |
| Team skins and multi-round aggregate skins | Formats | Both | Missing | Later | [Tournament formats](https://docs.golfgenius.com/en/collections/12012202-tournament-formats) |
| Quota, adjustable quota, and Chicago quota | Formats | Both | Partial — quota and Chicago; adjustable quota is absent | Next | [Tournament formats](https://docs.golfgenius.com/en/collections/12012202-tournament-formats) |
| Ringers / eclectic, at round and season level | Formats | Both | Missing | Later | [Tournament formats](https://docs.golfgenius.com/en/collections/12012202-tournament-formats) |
| Birdie, deuce, trey, and eagle aggregate formats | Formats | Both | Partial — aces-and-deuces and dots, which are group side games rather than these field formats | Later | [Tournament formats](https://docs.golfgenius.com/en/collections/12012202-tournament-formats) |
| 3/3/3, 6/6/6, and 9/9 | Formats | Both | Missing | Later | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats) |
| Ryder Cup, including a three-team setup | Formats | Both | Missing | Later | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| Bracket tournaments: seeding, byes, consolation, qualifying, playoff holes | Formats | Both | Missing | Later | [Tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup) |
| Round robin, and every player or pair matched against every other | Formats | Both | Missing | Later | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats) |
| User-scored side contests such as closest to the pin and longest drive | Formats | Both | Partial — greenies records a closest-to-pin winner inside the group | Next | [Awards: points and purse](https://docs.golfgenius.com/en/articles/10778635-awards-points-and-purse) |
| Several competitions scored from the same round | Formats | Both | Have | Win | [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats), [GAMES_STATUS.md](GAMES_STATUS.md) |
| Cuts, tie-breaks, and points or purse payout tables | Formats | Unclear | Partial — side-bet settlement, not a purse table or a cut | Later | [Tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup) |
| Blinds, half strokes, maximum hole scores, drop-worst-hole | Formats | Unclear | Missing | Skip | [Tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup) |
| Long-tail formats: college team count, team wheels, Cha Cha Cha, Lone Ranger, shootout, Pick a Pro, yellow ball, criss-cross, Jack and Jill, par/bogey, member-guest, team point tables | Formats | Both | Missing | Skip | [Tournament formats](https://docs.golfgenius.com/en/collections/12012202-tournament-formats) |
| Nine-hole events, and entering one total instead of every hole | Formats | Unclear | Partial — a front nine can be imported and padded to 18; there is no total-only score | Later | [Tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup) |
| GHIN: pull indexes, download a club roster, post scores | Handicaps | Both | Missing | Next | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| Playing handicaps from slope and rating, allowances, decimal and plus indexes, more than one tee | Handicaps | Unclear | Partial — one number per player, plus hole stroke index | Must-have | [Handicap collection](https://docs.golfgenius.com/en/collections/12012983-playing-handicaps-handicap-indexes-posting-scores) |
| Type an index, or load indexes from a spreadsheet | Handicaps | Unclear | Partial — the number can be typed; there is no roster spreadsheet | Must-have | [Handicap collection](https://docs.golfgenius.com/en/collections/12012983-playing-handicaps-handicap-indexes-posting-scores) |
| Peoria, Callaway, and System 36 | Handicaps | Unclear | Missing | Next | [Handicap collection](https://docs.golfgenius.com/en/collections/12012983-playing-handicaps-handicap-indexes-posting-scores) |
| Other index services: WHS regions, Golf Canada / GolfNet, GOLF Link, HandicapMaster, GA CONNECT, CDGA, Golf Australia, French Golf Federation, sim-golf handicap | Handicaps | Unclear | Missing | Skip | [Handicap collection](https://docs.golfgenius.com/en/collections/12012983-playing-handicaps-handicap-indexes-posting-scores) |
| Automatic posting of round scores to GHIN | Handicaps | Unclear | Missing | Next | [2025 product updates](https://share-cdn.golfgenius.com/products/tm/product-updates) |
| General-play posting to GHIN from the Club App | Handicaps | Unclear | Missing | Later | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Handicap history in the Club App | Handicaps | Unclear | Partial — a local statistics screen, not an official index history | Later | [App Store version history](https://apps.apple.com/us/app/golf-genius/id555651262) |
| Manager enters gross scores hole by hole, including an unfinished-hole mark, and can check a card | Scoring | Both | Have — manual entry, and a photo import that fills the card | Win | [Entering scores](https://docs.golfgenius.com/en/articles/10776844-entering-scores), [TM Club paper cards](https://docs.golfgenius.com/en/articles/10776890-eliminating-the-collection-of-physical-scorecards-tm-club-users) |
| TM Club paper-card path: the player texts a photo, or types into a linked Google Sheet, and the manager retypes the scores | Scoring | Club | Have — the photo is read into scores instead of retyped | Win | [TM Club paper cards](https://docs.golfgenius.com/en/articles/10776890-eliminating-the-collection-of-physical-scorecards-tm-club-users) |
| Mobile live scoring with a pairing GGID | Scoring | Premium | Planned — guests can enter scores in the organizer’s browser; another device is specified and not shipped | Must-have | [Live scoring setup](https://docs.golfgenius.com/en/articles/10777399-live-scoring-setup-for-the-golf-genius-apps-managers), [sharing spec](scoresnap/docs/spec-contest-sharing.md) |
| Digital scorecards: a marker, marker notes, and certification | Scoring | Premium | Missing | Later | [Digital scorecards](https://docs.golfgenius.com/en/articles/10777405-digital-scorecards-instructions-for-players), [TM comparison](https://golfgenius.com/products/tm) |
| Live leaderboard on the phone while the round is in progress | Scoring | Premium | Partial — the phone shows the group, and a public link polls a published snapshot | Must-have | [TM comparison](https://golfgenius.com/products/tm), [LIVE_SHARE.md](scoresnap/docs/LIVE_SHARE.md) |
| TV leaderboard of completed results | Scoring | Both | Missing | Later | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| Live TV leaderboards, including an Amazon Fire TV stick | Scoring | Premium | Missing | Skip | [TM comparison](https://golfgenius.com/products/tm), [Live scoring setup](https://docs.golfgenius.com/en/articles/10777399-live-scoring-setup-for-the-golf-genius-apps-managers) |
| iPhone Lock Screen Live Activities and Dynamic Island, including team events | Scoring | Premium | Missing | Later | [TM comparison](https://golfgenius.com/products/tm), [Live Activities](https://docs.golfgenius.com/en/articles/16112800-live-activities-and-dynamic-island-iphone) |
| Push a leaderboard to officials out on the course | Scoring | Premium | Missing | Skip | [Tournaments and scoring profile](https://docs.golfgenius.com/en/articles/10776884-event-league-profile-tournaments-scoring) |
| Skins shown on the live board before the round is complete, and still able to be lost | Scoring | Premium | Partial — local skins update with the scores | Next | [Skins and live scoring](https://docs.golfgenius.com/en/articles/10777440-can-skins-tournaments-be-played-with-live-scoring), [TM comparison](https://golfgenius.com/products/tm) |
| Photo galleries from the phone | Scoring | Premium | Missing | Later | [App Store](https://apps.apple.com/us/app/golf-genius/id555651262), [TM comparison](https://golfgenius.com/products/tm) |
| Basic event website: logo, colors, background, tee sheet, leaderboard, photos | Web | Both | Partial — `/r/<token>` is a scoreboard and a chat, not an event page | Must-have | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf), [LIVE_SHARE.md](scoresnap/docs/LIVE_SHARE.md) |
| Custom multi-page event websites | Web | Premium | Missing | Skip | [TM comparison](https://golfgenius.com/products/tm) |
| Golf Hub flyers inside TM, at no extra software fee | Registration | Both | Missing | Next | [Spotlight: Golf Hub](https://docs.golfgenius.com/en/articles/10778434-spotlight-golf-hub) |
| Simple Golf Hub registration: name, gender, handicap ID, optional payment, a player limit, and a closing date | Registration | Both | Missing | Must-have | [Getting started with Golf Hub](https://docs.golfgenius.com/en/articles/10777113-getting-started-with-golf-hub) |
| Advanced online registration and card payments | Registration | Premium | Missing | Later | [TM comparison](https://golfgenius.com/products/tm), [Registration collection](https://docs.golfgenius.com/en/collections/12012196-event-and-league-registration) |
| Waitlists and pending registrations | Registration | Unclear | Missing | Next | [Registration collection](https://docs.golfgenius.com/en/collections/12012196-event-and-league-registration) |
| Waivers, eligibility rules, invitation lists, and registration packages | Registration | Unclear | Missing | Later | [Registration collection](https://docs.golfgenius.com/en/collections/12012196-event-and-league-registration) |
| Check-in payments, saved cards, credit balances, and regional wallets | Registration | Unclear | Missing | Skip | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Player gift shopping, with a prompt to open a free Golf Shop account | Registration | Unclear | Missing | Skip | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Calcutta auctions through BidParTee | Registration | Premium | Missing | Skip | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Lottery management for tee times or entries | Registration | Unclear | Missing | Skip | [Product updates](https://share-cdn.golfgenius.com/products/tm/product-updates) |
| Text messages for tee times, delays, and similar, 300-character limit as of 2026 | Communications | Premium | Missing | Later | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf), [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Marketing campaigns that schedule email and text | Communications | Premium | Missing | Skip | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| Text opt-in tools | Communications | Unclear | Missing | Skip | [2025 releases](https://docs.golfgenius.com/en/articles/11030977-2025-release-announcements) |
| Direct and group chat with people on the club roster | Communications | Unclear | Partial — anyone with a live link can post; there is no roster directory | Skip | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements), [LIVE_SHARE.md](scoresnap/docs/LIVE_SHARE.md) |
| Printed scorecards, scoreboards, cart signs, tee sheets, hole locations, Publisher templates, and merge | Print | Both | Missing | Next | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| Report, page, and spreadsheet composers, bag labels, and pace-of-play sheets | Print | Unclear | Missing | Skip | [Printed materials](https://docs.golfgenius.com/en/collections/12012985-printed-materials) |
| Sponsor branding on the app, TV, print, and the event site | Sponsors | Premium | Missing | Skip | [TM comparison](https://golfgenius.com/products/tm) |
| More than one custom logo on a leaderboard | Sponsors | Unclear | Missing | Skip | [2025 releases](https://docs.golfgenius.com/en/articles/11030977-2025-release-announcements) |
| Club systems: Club Essential, ForeTees, Jonas, MembersFirst, Visage, GPSI/Club Car | Integrations | Premium | Missing | Skip | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| GPS cart feeds: Smartscore, YamaTrack, FAIRWAYiQ | Integrations | Unclear | Missing | Skip | [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) |
| Golf Genius AI assistant, public beta: tee sheet, substitutions, handicaps, and mobile scoring from a phone | AI | Premium | Planned — a different assistant that configures a contest from plain language | Later | [TM product page](https://golfgenius.com/products/tm), [AI announcement, 23 June 2026](https://golfgenius.com/resources/news/public-beta-golf-genius-ai), [AI contest spec](scoresnap/docs/spec-ai-contest-config.md) |
| Trip management inside Tournament Management: courses, players, pairings, boards, expenses | Other products | Premium | Missing | Skip | [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) |
| Standalone Trip Manager: trip site, live scoring, pairings, formats, email, expense split | Other products | Separate product | Partial — one group can score and settle; there is no trip website or expense ledger | Later | [Trip Manager](https://golfgenius.com/products/trip-manager) |
| Standalone Golf Genius Golf Hub: one dashboard for a page, fees, and a roster | Other products | Separate product | Missing | Next | [Golf Hub get started, 17 August 2026](https://docs.golfgenius.com/en/articles/15649392-golf-genius-golf-hub-get-started-golf-genius-golf-hub-manager-guide) |
| Phone GPS distances to the green | Other products | Unclear | Planned — specified, and the stored holes have yardages rather than green coordinates | Later | No public TM page retrieved for this review describes a phone rangefinder. Cart feeds are a different feature. [GPS spec](scoresnap/docs/spec-gps-distance.md) |

### Count by category

| Category | Rows |
| --- | ---: |
| Platform | 4 |
| Events and leagues | 12 |
| Scheduling | 10 |
| Formats | 25 |
| Handicaps | 8 |
| Scoring | 11 |
| Web | 2 |
| Registration | 9 |
| Communications | 4 |
| Print | 2 |
| Sponsors | 2 |
| Integrations | 2 |
| AI | 1 |
| Other products | 4 |
| **Total** | **96** |

Tier marks on those 96 rows: Both 37, Premium 19, Club 1, Unclear 37, Separate product 2. The phone-GPS row is Unclear because no public Tournament Management page retrieved here describes it. General-play posting and in-app handicap history are Unclear because the release note and the App Store listing describe them without naming a tier.

The help center has more articles than this table has rows. Collections that were opened and folded into the rows above, rather than copied article by article: [tournament formats](https://docs.golfgenius.com/en/collections/12012202-tournament-formats), [tournament setup](https://docs.golfgenius.com/en/collections/12012198-tournament-setup), [scheduling](https://docs.golfgenius.com/en/collections/12012986-scheduling-and-pairings), [pairings FAQ](https://docs.golfgenius.com/en/collections/12013037-scheduling-and-pairings-faq), [handicaps](https://docs.golfgenius.com/en/collections/12012983-playing-handicaps-handicap-indexes-posting-scores), [registration](https://docs.golfgenius.com/en/collections/12012196-event-and-league-registration), and [printed materials](https://docs.golfgenius.com/en/collections/12012985-printed-materials).

## What SnapScore already has that this buyer feels

A foursome can scan a card, confirm the holes, run several games at once, and leave with a settlement and a Venmo or Cash App link. The game list in `GAMES_STATUS.md` covers stroke, match, Stableford, modified Stableford, skins with and without carry, Nassau with presses, wolf, banker, hammer, snake, rabbit, defender, closeout, Vegas, sixes, nines, bingo bango bongo, dots, quota, Chicago, greenies, aces and deuces, best ball, scramble, shamble, alternate shot, Chapman, and four-ball. Fields are tested through 40 players. [GAMES_STATUS.md](GAMES_STATUS.md) [App Store listing draft](scoresnap/docs/APP_STORE_LISTING.md)

Course search exists behind a flag, with a manual card when the lookup is unavailable. [COURSE_DATA.md](scoresnap/docs/COURSE_DATA.md) A public scoreboard and round chat exist when an organizer is signed in and the round is published; the viewer polls every five seconds, and the organizer’s device has to stay on the round. [LIVE_SHARE.md](scoresnap/docs/LIVE_SHARE.md) Guest scoring by a six-character code works in that browser. Another phone is the deferred slice. [Contest sharing spec](scoresnap/docs/spec-contest-sharing.md) `CROSS_DEVICE_SHARING_ENABLED` hides join codes until that backend is on. [features.ts](scoresnap/src/config/features.ts)

Local multi-round support can mark a contest as a tournament, add rounds, copy groups, and aggregate scores. The client also calls a Supabase sync helper. That is a shell, not a league. [contest-store.ts](scoresnap/src/stores/contest-store.ts) [tournament-sync.ts](scoresnap/src/services/tournament-sync.ts)

## Roadmap for clubs and leagues that will not pay Golf Genius prices

### Must-have before a small club will switch

A weekly men’s, women’s, or nine-and-dine league can leave a spreadsheet, or a Golf Genius seat somebody else is paying for, when all of the following are true:

1. One person creates a season, adds the roster, and sets a handicap number. Players do not need a GGID or a staff login.
2. Each week is a round with groups and tee times. Copying last week’s groups is enough at the start. Shotgun and automatic “everyone plays with everyone” can follow.
3. The round scores net stroke play, and can add skins and best ball. Those three cover the formats the popular-formats article treats as ordinary club golf. [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats)
4. Players on their own phones can enter scores, and everyone can open one leaderboard. The sharing spec and the M2 note already describe this, with leagues after rounds and tournaments. [Contest sharing spec](scoresnap/docs/spec-contest-sharing.md) [M2 foundation](scoresnap/supabase/M2-FOUNDATION.md)
5. A player who will not install anything can still be scored, by the organizer typing or by a photo of the card. Club customers are told to text a picture and have the staff retype it. [TM Club paper cards](https://docs.golfgenius.com/en/articles/10776890-eliminating-the-collection-of-physical-scorecards-tm-club-users)
6. The season shows a running result, including a missed week, which Golf Genius does with best X of Y. [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats)
7. There is a signup list: name, a handicap number, and in or out. Card payments can wait.
8. The price is understandable without a sales call. The published alternative for a facility is $1,425 before onboarding, or $4,275 if they want phones. [TM pricing](https://www.golfgeniussoftware.com/products/tm/pricing)

GHIN posting is the first thing a private club with an official index will ask for, and it is a Both-tier Golf Genius feature. It is not required for a recreational league that already types indexes. Treat official posting as Next, and treat a typed index as part of the switch kit.

### Skip as enterprise weight

Leave these until a specific club writes a check that requires them:

- Microsoft Publisher templates, bag labels, locker signs, and the report-composer catalog. [Printed materials](https://docs.golfgenius.com/en/collections/12012985-printed-materials)
- ForeTees, Jonas, Club Essential, MembersFirst, Visage, Club Car, and the GPS-cart feeds. [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf)
- Live TV, Fire TV, Lock Screen Live Activities, and on-course official boards.
- Marketing-campaign automation, sponsor rotations, multi-logo leaderboards, and custom multi-page websites.
- Non-golf events, player gifts, Golf Shop, calcutta via BidParTee, lotteries, and regional wallets.
- Association handicap services outside GHIN, Japan pairing locks, and attestation built for a national junior event.
- The long-tail format list (Cha Cha Cha, Lone Ranger, yellow ball, college counting, and the rest).
- The AI assistant that edits a live tee sheet. The contest-setup assistant in `spec-ai-contest-config.md` is a different, smaller idea and can stay on its own track. [AI announcement](https://golfgenius.com/resources/news/public-beta-golf-genius-ai)
- Phone-support staffing. App Store reviews praise Golf Genius support and also call the product clunky and hard to read. A low price cannot include a PGA staffed phone desk, so the product has to be obvious. [App Store reviews](https://apps.apple.com/us/app/golf-genius/id555651262)

### Where SnapScore can win

**Camera scan.** Club’s published paper path is “text a legible photo, then someone types it.” Premium’s published path is hole-by-hole taps in the app. This review found no public Golf Genius page that reads a scorecard photo into scores. SnapScore already does that, then settles the games. [TM Club paper cards](https://docs.golfgenius.com/en/articles/10776890-eliminating-the-collection-of-physical-scorecards-tm-club-users) [RELEASE_GAP_ANALYSIS.md](scoresnap/docs/RELEASE_GAP_ANALYSIS.md)

**Price.** A league organizer can be offered something at or under $149, which is the published price of one buddy trip, instead of a facility subscription whose public floor is $1,425 plus $200. [Trip Manager](https://golfgenius.com/products/trip-manager) [TM pricing](https://www.golfgeniussoftware.com/products/tm/pricing) Many association clubs already receive Club inside their dues, so the pro shop is the wrong first target. The GAM page says the Club price is included in association membership. [GAM](https://gam.org/membership/club-services/golf-genius-tm/) The open buyers are the league that still uses a spreadsheet, the public course or simulator paying Premium out of pocket, and the outing that only needs one weekend.

**Simplicity and setup time.** Golf Genius live scoring starts from a GGID, a manager toggle, and an in-progress round. [Live scoring setup](https://docs.golfgenius.com/en/articles/10777399-live-scoring-setup-for-the-golf-genius-apps-managers) A 2023 review describes a player who can open the league on the website and still get “You are not part of any leagues / events / trips” in the app. A 2024 review says the type is too small. A July review asks for recent GGIDs because people play in several groups. [App Store reviews](https://apps.apple.com/us/app/golf-genius/id555651262) SnapScore’s current draft listing is “Scan Scores. Settle Bets.” That sentence is the setup. [APP_STORE_LISTING.md](scoresnap/docs/APP_STORE_LISTING.md) The side games a regular game plays for money — wolf, presses, Vegas, snake, hammer — are already in the app and are not the center of the Golf Genius format marketing.

**Offline.** Golf Genius is sold as cloud-only. SnapScore already keeps the round on the phone. A league round in a spotty cellular area can finish and publish when the organizer is back online. That behavior is already how the live-share note describes completion. [LIVE_SHARE.md](scoresnap/docs/LIVE_SHARE.md)

### Suggested pricing posture

Use the published anchors, and label everything else as a suggestion.

- Individual players: leave the in-code prices ($2.99 / $19.99 / $29.99) until there is a separate pricing decision. [purchases.ts](scoresnap/src/services/purchases.ts)
- One league season, once cross-device scoring works: at or under **$149**, the published Trip Manager price for up to 12 rounds and 36 players. A weekly league that runs longer than 12 weeks can still sit under **$1,425**, the Club annual list. [Trip Manager](https://golfgenius.com/products/trip-manager)
- A facility that wants several leagues: a few hundred dollars a year stays under the Club list and under the $500 Premium onboarding fee alone. This note does not pick the dollar.
- Organizer price before the shared season exists: $0. Selling a club plan on top of same-browser codes would repeat the complaint in the App Store reviews.
- Card fees, if payments come later: Golf Genius does not publish its rate. Do not invent one. [Spotlight: Golf Hub](https://docs.golfgenius.com/en/articles/10778434-spotlight-golf-hub)

Golf Hub, announced 10 August 2026, is the product to watch. It is the entry offer this market would buy, and its price is not on the public pages retrieved here. [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements)

### Phased roadmap

Effort is size of the change, not a calendar. **S** is a thin slice on code that already exists. **M** is one new flow across UI and stored data. **L** is multi-device correctness, payments, or a licensed external system.

**Now — the switch kit**

| Work | Effort | Why this size |
| --- | --- | --- |
| Finish cross-device rounds: organizer account, join by code, guest scores, conflict handling, offline queue. The spec and M2 foundation already bound this | L | Auth, row security, and two phones writing one card |
| A season object: name, roster, weekly rounds, one net leaderboard, best X of Y | L | New model on top of the local tournament shell |
| Manual groups and tee times good enough to text to the field, reusing the group and `teeTime` fields | S | Fields exist |
| Make the public link the thing players open for results, including a finished season | S | Live share already publishes a snapshot |
| Keep camera scan as the way a card becomes scores | S | Already shipped |

**Next — a league someone will renew**

| Work | Effort | Why this size |
| --- | --- | --- |
| Signup link: name, handicap number, in or out, a cap, and a simple waitlist. No card charge | M | New public form, no processor |
| Playing handicap from course rating and slope when the course record has them | M | Course data and the net math |
| Automatic pairings that avoid repeats | M | A scheduler over the roster |
| Flights as handicap bands | S | A sort of the roster |
| Shotgun or a two-tee start | M | Start hole on each group, then the leaderboard |
| One printable tee sheet or cart sign | S | A PDF of data already on the round |
| Season points, not only a stroke total | M | A second standing beside net score |
| Peoria for an outing that has no indexes | M | A defined handicap method with its own inputs |
| Closest-to-the-pin and long-drive as field contests | S | Greenies already collects a winner |

**Later — only after the season is in use**

| Work | Effort | Why this size |
| --- | --- | --- |
| Card payments, refunds, and receipts | L | A processor, disputes, and tax language Golf Genius already had to add |
| GHIN lookup and posting, if a license is available | L | A contract and a posting audit, not a UI field |
| Text or email of tee times | M | Delivery and opt-out |
| A one-page event site | M | More than the scoreboard link |
| Bracket, Ryder Cup, or round robin | L | A different scoring structure from a stroke round |
| Live TV or a clubhouse display | M | A read-only full-screen board |
| Cart and tee-sheet integrations | L | One integration per vendor, and Premium is where Golf Genius put them |
| Marker certification | M | Two people agreeing on a card |
| The tee-sheet AI assistant | L | Writes pairings and handicaps from speech |

### Top risks

1. **The free association seat.** Where a golf association includes Club in dues, the shop will not uninstall it to save a fee it does not pay. GAM states that arrangement directly. Win the league secretary and the public-course event, and let Premium’s phone features be the comparison. [GAM](https://gam.org/membership/club-services/golf-genius-tm/)
2. **Golf Hub’s unpublished entry price.** Since 10 August 2026 Golf Genius has a product whose public description is the switch kit: a page, fees, and a roster. Building a large tournament suite while that price is unknown is the main positioning risk. [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements)
3. **Handicap licensing.** GHIN and the other posting services are integrations, not a field on a form. A typed number can ship. Official posting waits on a license this research did not find in public docs.
4. **Cross-device scoring is the gate.** Same-browser codes and a polled spectator link are not a league. Shipping a club price before that works will produce the “I can see it on the website and not on my phone” review Golf Genius already has. [Contest sharing spec](scoresnap/docs/spec-contest-sharing.md)
5. **Trust in the card.** Scan errors and the lack of a marker are fine for a $5 nassau. A net club championship will want a checked card. Golf Genius has a checked-card lock and, on Premium, marker certification. [Entering scores](https://docs.golfgenius.com/en/articles/10776844-entering-scores)
6. **Field size.** Trip Manager’s published cap is 36 players. SnapScore’s tested cap is 40. The Merion testimonial on the TM page describes a league of over 120 members. A 40-player product is the lower market; a 144-player outing is a later problem. [Trip Manager](https://golfgenius.com/products/trip-manager) [TM testimonials](https://golfgenius.com/products/tm)
7. **Course data.** Search is quota-limited and the terms forbid building a competing course database. Net events need rating and slope, which may or may not be on a given course record. [COURSE_DATA.md](scoresnap/docs/COURSE_DATA.md)
8. **Support load.** Copying the help center (hundreds of articles) creates the clunky product reviewers describe. The skip list above is the control.
9. **Payments.** Entry fees bring refunds, chargebacks, and tax. Golf Genius added tax-responsibility copy in 2026. Leave this out of Now. [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements)

## What could not be verified

- Standalone Golf Hub subscription price.
- Prices for facilities over 36 holes, associations buying direct, customers outside the US and Canada, indoor facilities, one-time events, and leagues sold without a facility subscription.
- The card-processing rate.
- Whether the HPE page’s $1,200 / $3,700 is an old mirror, an association price, or a current exception. It has no date. It is not used as the current list price.
- The February 2024 and earlier prices in the LinkedIn post. The search result quoted them and dated the post 23 February 2024. The full post was not re-opened.
- A current Google Play listing.
- The year on App Store version “20.0 Oct 12.”
- Club versus Premium for every help-center article. Thirty-seven feature rows stay Unclear on purpose. Product-availability badges that are images were not transcribed.
- A public phone rangefinder inside Tournament Management. Cart integrations are documented. A player GPS yardage is not, in the pages retrieved here.
- Any Golf Genius feature that reads a scorecard photo into hole scores. The retrieved paper-card article tells a person to type what they see.

## Sources

- [Home](https://www.golfgenius.com/) (retrieved 28 October 2026)
- [Tournament Management](https://golfgenius.com/products/tm) (retrieved 28 October 2026)
- [TM pricing](https://www.golfgeniussoftware.com/products/tm/pricing) (retrieved 28 October 2026)
- [HPE pricing](https://hpe.golfgenius.com/products/tm/pricing) (retrieved 28 October 2026, undated, conflicts with the two cards above)
- [Trip Manager](https://golfgenius.com/products/trip-manager) (retrieved 28 October 2026)
- [Product matrix PDF](https://s3.eu-west-1.amazonaws.com/cdn.supporthero.io/article/260/TM%20Product%20Matrix.pdf) (PDF created 15 September 2023)
- [Club and Premium features](https://docs.golfgenius.com/en/articles/10776723-golf-genius-tournament-management-club-premium-features) (31 March 2025)
- [Upgrade to Premium](https://docs.golfgenius.com/en/articles/10778464-how-to-upgrade-to-golf-genius-tm-club-premium)
- [Help Center home](https://docs.golfgenius.com/en/) (retrieved 28 October 2026)
- [Popular formats](https://docs.golfgenius.com/en/articles/10778568-popular-tournament-formats) (7 November 2025)
- [Tournament formats collection](https://docs.golfgenius.com/en/collections/12012202-tournament-formats)
- [Tournament setup collection](https://docs.golfgenius.com/en/collections/12012198-tournament-setup)
- [Creating pairings](https://docs.golfgenius.com/en/articles/10778284-creating-new-pairings)
- [Rounds and scheduling](https://docs.golfgenius.com/en/articles/10776882-event-league-profile-rounds-scheduling)
- [Scheduling collection](https://docs.golfgenius.com/en/collections/12012986-scheduling-and-pairings)
- [Pairings FAQ](https://docs.golfgenius.com/en/collections/12013037-scheduling-and-pairings-faq)
- [Handicap collection](https://docs.golfgenius.com/en/collections/12012983-playing-handicaps-handicap-indexes-posting-scores)
- [Registration collection](https://docs.golfgenius.com/en/collections/12012196-event-and-league-registration)
- [Printed materials](https://docs.golfgenius.com/en/collections/12012985-printed-materials)
- [Getting started with Golf Hub](https://docs.golfgenius.com/en/articles/10777113-getting-started-with-golf-hub)
- [Spotlight: Golf Hub](https://docs.golfgenius.com/en/articles/10778434-spotlight-golf-hub) (article 8 April 2025; spotlight 25 January 2022)
- [Golf Hub account and purchasing](https://docs.golfgenius.com/en/articles/15649418-golf-genius-golf-hub-creating-an-account-and-purchasing) (17 August 2026)
- [Golf Hub get started](https://docs.golfgenius.com/en/articles/15649392-golf-genius-golf-hub-get-started-golf-genius-golf-hub-manager-guide) (17 August 2026)
- [Entering scores](https://docs.golfgenius.com/en/articles/10776844-entering-scores)
- [TM Club paper cards](https://docs.golfgenius.com/en/articles/10776890-eliminating-the-collection-of-physical-scorecards-tm-club-users)
- [Live scoring setup](https://docs.golfgenius.com/en/articles/10777399-live-scoring-setup-for-the-golf-genius-apps-managers)
- [Digital scorecards](https://docs.golfgenius.com/en/articles/10777405-digital-scorecards-instructions-for-players)
- [Live Activities](https://docs.golfgenius.com/en/articles/16112800-live-activities-and-dynamic-island-iphone)
- [Skins and live scoring](https://docs.golfgenius.com/en/articles/10777440-can-skins-tournaments-be-played-with-live-scoring) (3 April 2025)
- [Awards: points and purse](https://docs.golfgenius.com/en/articles/10778635-awards-points-and-purse)
- [Tournaments and scoring profile](https://docs.golfgenius.com/en/articles/10776884-event-league-profile-tournaments-scoring)
- [2025 releases](https://docs.golfgenius.com/en/articles/11030977-2025-release-announcements) (5 January 2026)
- [2026 releases](https://docs.golfgenius.com/en/articles/14137157-2026-release-announcements) (23 September 2026)
- [Product updates](https://share-cdn.golfgenius.com/products/tm/product-updates)
- [Golf Genius AI public beta](https://golfgenius.com/resources/news/public-beta-golf-genius-ai) (23 June 2026)
- [App Store](https://apps.apple.com/us/app/golf-genius/id555651262) (retrieved 28 October 2026)
- [GAM Golf Genius TM](https://gam.org/membership/club-services/golf-genius-tm/) (2023 price called out on the page; footer ©2026)
- [Links Meridian](https://linksmeridian.com/alternatives/golf-genius) (author’s check date 13 September 2026)
- [LinkedIn price history](https://www.linkedin.com/feed/update/urn:li:activity:7166876875301093376) (post date 23 February 2024; full page not re-opened)
