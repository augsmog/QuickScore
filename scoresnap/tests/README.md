# Copy guard tests

Run `node node_modules/jest/bin/jest.js --runInBand tests/game-copy-guard.test.cjs`
from scoresnap. See [the copy contract](../docs/GAME_COPY_GUARD.md) and
[voice guide](../docs/VOICE_GUIDE.md).

The guard checks copy text, not screen layout: literal counts in source, HTML,
JSX, Markdown and JSON; whitespace/entity/Unicode normalization; and text split
across adjacent nodes/elements in source order. CSS/flex/grid visual reordering,
direction reversal, absolute positioning and JSX child reordering are outside
scope. Layout-only verifier probes document that boundary; source-order negative
controls must still fail regardless of styles. No new count placement is authorized.

Named character references use the checked-in WHATWG table in
`helpers/html-named-entities.json`, generated with Python 3's
`html.entities.html5`, preserving semicolon-terminated keys and the legacy
semicolonless keys. Longest valid names win, case is preserved, and numeric
references accept an optional semicolon.
Decode entities once before NFKC, invisible-character and whitespace normalization.
The regressions exercise discovered HTML files and approved HTML/JSX controls.
