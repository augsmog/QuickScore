// The one legal entity that operates SnapScore and owns its copyright (AUG-1639, owner decision
// 2026-11-27). The terms, the privacy policy, the site pages built from them and the staged App
// Store payload must all name exactly this. tests/legal-entity.test.cjs fails if they do not.
// If the registered form differs, change it here, then in docs/terms-of-service.md,
// docs/privacy-policy.md and store/asc/en-US.payload.json, and run scripts/build-public-pages.mjs;
// the test names every place that still disagrees.
export const LEGAL_ENTITY = "Autumn8me, Inc.";
