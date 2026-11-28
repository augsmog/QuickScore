# Web links journey (player link, spectator link)

Runs the whole guest journey on one machine, touching nothing hosted:

```sh
cd scoresnap
e2e/web-links/run.sh
```

Options: `DIST=dist-site` reuses a site already built against `http://127.0.0.1:54399`;
`OUT_DIR=<folder>` chooses where screenshots go; `PW_CHROMIUM=<path>` names a Chromium binary
when the project's Playwright has none downloaded; `PGBIN=<folder>` names the PostgreSQL tools.

No PostgreSQL installed? With Docker running, the script starts `postgres:17` in a throwaway
container by itself (bound to this machine only, removed at the end). `WEB_LINKS_DOCKER=1` forces
that path. **The Docker path was written without a Docker daemon to try it on; its first run is
on the Mac.**

Already have an empty PostgreSQL running (for example your own container)? `PGURL=<its address>`
uses it and starts nothing. If this machine has no `psql`, also give
`PSQL="docker exec -i <container> psql -U postgres"`. The script refuses a database that already
has SnapScore tables. **The `PSQL=` form has not been run here either.**

What it does:

1. Starts a throwaway PostgreSQL with this checkout's schema and the two **proposed** files
   `supabase/proposed/20261128000000_web_player_links.sql` (add-only) and
   `supabase/proposed/20261128010000_web_score_rules.sql` (changes `submit_score`), and runs
   both server tests.
2. Seeds one round: two groups, four players, skins at $5, and a player link.
3. Builds the public site (`scripts/build-web-site.cjs`) pointed at a local stand-in backend.
4. Drives five separate browsers: two players with no account keep their groups' cards; a
   spectator watches by link; a second scorer on one card has a change flagged, denied,
   accepted and reconciled; a visitor watches by code from the home page's box; the round is
   finalized, reopened inside the hour and refused after it; then the organizer ends the links.

What is real and what is not:

| Real | Stand-in |
| --- | --- |
| Every database function, run as the caller's role and identity | Guest sign-in (`bridge.cjs` issues a local identity; no auth service) |
| The site build and its `_redirects` rules | No realtime socket: pages pick up other people's scores on reload or the 30-second poll |
| The web pages, in Chromium at 390x844 | "The organizer" is the server read as the host with SQL, not the phone app. Finalizing and moving the clock past the hour are done with SQL |

A pass here does not prove the hosted backend, Cloudflare, Safari or a phone. The same server
test files can be run on a Docker Supabase stack after applying the two proposed files:
`psql <local url> -f supabase/tests/web-player-links.sql` and `... -f supabase/tests/web-score-rules.sql`.

`bridge.cjs` refuses any database address that is not `postgres@127.0.0.1`.
