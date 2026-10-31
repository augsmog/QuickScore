# Game-count copy contract

This is a prevention-only change. Main's count-free paywall value rows, plans,
teaser, home, onboarding, email and positive Figma fixtures stay count-free.
The voice guide allows wording but authorizes no new placements. Any future
approved inventory count must be exactly `50+ game modes`. Source inventory uses
base games + options + format; it is not proof of installed binary capability.

`tests/game-copy-guard.test.cjs` is discovered by the existing Jest configuration
and automatic PR web-smoke workflow. The >=50 assertion reads the real registry.
The scanner discovers sources recursively across src (including services and
engine copy providers), app, components, Supabase function email sources, root
JS/JSX/HTML apps, web/site/public, repository store-listing drafts and positive
Figma JSON fixtures. It scans literal strings, local constants, named relative
import providers, templates, concatenation, JSX children/fragments and HTML text;
HTML numeric entities and whitespace are normalized. Engine literals are not
blanket exempted. Exact contest expressions have path/reason entries and stale
entries fail.

Excluded: dependencies, Git/build outputs, engine __tests__, negative test
vectors, internal implementation status (GAMES_STATUS.md), internal dashboard,
research and strategy documents. These are not customer copy. New store drafts
must use a store-listing/app-store/listing-draft filename; new web sources must
live in the discovered web/site/public directories or root source files.

This is static analysis, not a general JavaScript interpreter. Runtime function
results, remote content, computed property providers and complex import graphs
need rendered-output coverage when used to assemble marketing copy. Do not
interpret a green static scan as permission to add such copy without coverage.
The actual paywall rendering is covered in both periods and Pro/TD tiers by
paywall-clubhouse-ledger.test.cjs. Mutation tests exercise discovery and reject
bad strings by filename in every source category, including new files, split
JSX, entities, templates, imported providers and concatenation.

No claim publication is authorized. Build 26's EAS/source receipt identifies
7d3060d76c1edec1e25f9bbd582cb38bf0af5e05, but delivered >=50 playable capabilities
and installed/OTA/App Store identities still require evidence. Owner approval
and that evidence are required before any listing/email publication, deployment,
OTA, install or release containing a count claim.
