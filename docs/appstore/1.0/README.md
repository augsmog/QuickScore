# SnapScore listing review kit

**copy pending Copy Chief** — neutral placeholder copy; brand voice belongs to Copy Chief.

Edit `listing.json`, then run from the repository root:

```sh
node scripts/check-appstore-copy.mjs
node scripts/check-appstore-copy.mjs --self-test
node scripts/render-appstore-proto.mjs
node scripts/render-appstore-proto.mjs --check
```

Open `docs/proto/2026-10-31/render/02-desktop.html` directly in a browser. The phone target uses the same generated markup, CSS, data, and JavaScript. No server, installation, or network is needed to review it. Only explicitly opening Terms or Privacy navigates to an external website.

The JSON holds listing fields, preview text, purchase rows, subscription terms, and review notes. Preview text is a local mock treatment, not an App Store screenshot asset. The generator escapes source strings before inserting them into HTML. Both render targets are generated artifacts: change the JSON or generator and rebuild rather than editing HTML directly.

The copy check exits unsuccessfully for counted game-library language, numeric-plus claims, permanent-purchase wording, missing review stamp, or oversized listing fields. It traverses every JSON string, including nested purchase rows and notes. Optional argument: a path to another listing JSON. It deliberately rejects prohibited wording even in negated sentences. Its heuristic proximity rules are conservative; editorial review remains required for paraphrases. It checks this kit, not historical app copy elsewhere in the repository. The render freshness check prevents edited HTML from silently diverging from reviewed source.

Prices and trial rules follow the supplied plan facts. No paid-feature entitlements are invented. Rating selection, storefront/currency confirmation, public link verification, and final brand language remain review tasks. Restore Purchases in the mock only reveals a local explanatory note. Nothing is submitted, purchased, restored, deployed, or changed in the shipping application.
