# Web links journey (player link, spectator link)

Runs the whole guest journey on one machine, touching nothing hosted:

```sh
cd scoresnap
e2e/web-links/run.sh
```

Options: `DIST=dist-site` reuses a site already built against `http://127.0.0.1:54399`;
`OUT_DIR=<folder>` chooses where screenshots go; `PW_CHROMIUM=<path>` names a Chromium binary
when the project's Playwright has none downloaded; `PGBIN=<folder>` names the PostgreSQL tools.

What it does:

1. Starts a throwaway PostgreSQL with this checkout's schema and the **proposed** file
   `supabase/proposed/20261128000000_web_player_links.sql`, and runs its server test.
2. Seeds one round: two groups, four players, skins at $5, and a player link.
3. Builds the public site (`scripts/build-web-site.cjs`) pointed at a local stand-in backend.
4. Drives three separate browsers: two players with no account keep their groups' cards,
   a spectator watches, the organizer changes a score, then ends the links.

What is real and what is not:

| Real | Stand-in |
| --- | --- |
| Every database function, run as the caller's role and identity | Guest sign-in (`bridge.cjs` issues a local identity; no auth service) |
| The site build and its `_redirects` rules | No realtime socket: pages pick up other people's scores on reload or the 30-second poll |
| The web pages, in Chromium at 390x844 | "The organizer" is the server read as the host with SQL, not the phone app |

A pass here does not prove the hosted backend, Cloudflare, Safari or a phone. The same server
test file can be run on a Docker Supabase stack: `psql <local url> -f supabase/tests/web-player-links.sql`.

`bridge.cjs` refuses any database address that is not `postgres@127.0.0.1`.
