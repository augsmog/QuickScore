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
HTML numeric entities, the complete semicolon-terminated WHATWG named entity
table, and whitespace are normalized before Unicode normalization.
The guard checks **copy text in source order**, not screen layout. In scope:
literal counts in source/HTML/JSX/Markdown/JSON, whitespace/entity/Unicode
normalization (NFKC and invisible formatting characters), and counts split
across adjacent text nodes/elements in source order. Out of scope: visual
reordering via CSS/flex/grid order, direction reversal, absolute positioning,
and JSX child reordering. Layout-only assembly requires separate rendered-output
review; a passing copy guard makes no layout claim. CSS never exempts forbidden
source-order text. This boundary supersedes earlier static inline-order support.
HTML inline tags preserve
text adjacency, while block tags separate text. Static array `.join()` calls
(including local or named-import array constants and explicit delimiters) are
evaluated and scanned even outside JSX. JSX is checked both with
exact text adjacency (including words split across nested inline elements) and
with separated sibling labels. Count modifiers are open-ended, including
“supported” and “available”; grammatical boundaries prevent instructional text
such as “one preset for each game” from becoming an inventory claim. Engine literals are not
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
JSX, HTML inline split words, entities, templates, imported providers,
concatenation and array joins. Approved split HTML and joined JSX are positive
controls; the round-three verifier reproductions are permanent regressions.

No claim publication is authorized. Build 26's EAS/source receipt identifies
7d3060d76c1edec1e25f9bbd582cb38bf0af5e05, but delivered >=50 playable capabilities
and installed/OTA/App Store identities still require evidence. Owner approval
and that evidence are required before any listing/email publication, deployment,
OTA, install or release containing a count claim.
