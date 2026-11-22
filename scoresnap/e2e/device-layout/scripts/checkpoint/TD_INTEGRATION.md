# Android TD evidence integration

Parent: a38252ffce5e7450a056ece4bbcdbdeb658f86c8.
Local portable validation only. No native run, glyph approval or release acceptance.

The ordinary eight-player wizard reaches Round Settings and presses enabled Start
once. The TD observer requires exact native literals, actual native role/owner
bounds, current foreground identity and measured OS scale at 1080x2400/480dpi.
It captures fresh original full PNGs for top, Free, annual TD and disabled-purchase
sections. Merged/truncated labels or unobservable native owners fail closed.
Purchase, Restore and plan selection are forbidden while the modal is active.
Close must reach Round Settings. Back through Games to Setup then reobserves all
eight names, alternating teams, HCP zero, rounds four and enabled teams without
retapping team chips. These observations are separate from painted-text review.

Post-run invocation (external verified context, not a fabricated job artifact ID):

    python3 -B td_capture.py --artifact-root ROOT --context CONTEXT --context-sha256 SHA256

Context is the validator's snapscore-android-td-expect/v1 schema with independently
verified source/tree/APK/integration/run/attempt/artifact identity. The command
writes td-capture.json only after evidence validation and always exits 78.
An independent consumer must pin that manifest and run the unchanged validator
CLI with its pinned expectation. Successful semantic intake means only
PAINTED_TEXT_REVIEW_REQUIRED. No crop, OCR, accessibility literal or synthetic
control can approve glyphs. Duplicate section coverage/status-icon-only changes
do not satisfy another section. Missing evidence never becomes acceptance.

The imported validator/test source is byte-identical to the supplied packet.
Input ZIP SHA256: f37f6922e988e3d7653676a7914c56eea00d7deaf6a065c31128482fa6c8d9bb.
Its manifest lists portable-tests.txt absent from the ZIP; no claim is made about
that missing receipt. Its README and both source hashes were verified and tests
rerun locally. Historical 5c81 PNGs are not reused: semantic full annual price
previously disagreed with clipped pixels, and another PNG changed a status icon.

Open runtime dependencies: actual native hierarchy must expose the exact literal
and role/owner shape; API35 insets must match the strict supported parser;
fresh both-scale captures, independent glyph review and current-build full gate
remain unrun. No initialized RN scale claim. Join requires its separate isolated
two-client backend and is not covered. Workflow, product and flags unchanged.

Portable checks:
    python3 -B -m unittest discover -s scoresnap/e2e/device-layout/scripts/checkpoint -p 'test_*.py'
    node --test scoresnap/e2e/device-layout/scripts/checkpoint/geometry_output.test.mjs scoresnap/e2e/device-layout/lib/*.test.mjs

Results: 88 Python tests; 88 Node tests (81 deterministic + 7 conversion), all pass.
