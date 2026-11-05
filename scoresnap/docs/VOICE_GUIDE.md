# SnapScore game-count voice guidance

The sole permitted inventory wording is `50+ game modes`. This wording rule
permits no new placement: current count-free surfaces stay count-free. Any
publication requires owner approval for its exact placement and evidence of at
least 50 delivered playable capabilities. Source inventory alone is insufficient.

The consistency guard checks copy text in source order, not screen layout.
It covers literal counts in source/HTML/JSX/Markdown/JSON, whitespace, entity and
Unicode normalization, and counts split across adjacent text nodes/elements in
source order. Visual reordering through CSS/flex/grid order, direction reversal,
absolute positioning and JSX child reordering are outside its threat model.
Review layout-dependent copy separately; passing this guard makes no claim
about rendered visual order. See [the contract](GAME_COPY_GUARD.md) and
[test README](../tests/README.md).
