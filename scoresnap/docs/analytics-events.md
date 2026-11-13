# Analytics event inventory

Source baseline: QuickScore 501bdae. This static contract changes no emitters or runtime policy. Native captures require configured PostHog; six web events pass through analytics-web PROPERTY_KEYS. SDK automatic lifecycle events are configuration, not literal captures in this inventory. `posthogAppLogger.*` rows are method calls; human-readable log-message rows are logger.info records, not funnel capture events.

| Event or log | Source file:line | Literal properties | Funnel step |
|---|---|---|---|
| app_opened | `app/_layout.tsx:239` | None literal (see dynamic-payload note) | Context/log |
| screen_viewed | `app/_layout.tsx:243` | screen_name | Context/log |
| round_finalized | `app/contest/[id]/scorecard.tsx:327` | game_ids, group_count, is_tournament | Explicit finish |
| share_tapped | `app/contest/[id]/settlement.tsx:113`, `app/contest/[id]/settlement.tsx:193` | None literal (see dynamic-payload note) | Share intent |
| contest_created | `app/contest/new.tsx:323` | player_count, group_count, game_ids, has_teams, is_tournament, round_count | Creation |
| posthogAppLogger.contestCreated | `app/contest/new.tsx:331` | playerCount, groupCount, isTournament | Context/log |
| subscription_purchase_completed | `app/paywall.tsx:72` | selected_tier, billing_period | Conversion |
| scorecard_scan_processed | `app/scan/index.tsx:122` | player_count, has_contest_context | Scan/import |
| posthogAppLogger.scorecardScanCompleted | `app/scan/index.tsx:126` | playerCount, hasContestContext | Context/log |
| score_snap_started | `app/scan/index.tsx:197` | None literal (see dynamic-payload note) | Scan/import |
| score_snap_completed | `app/scan/index.tsx:201`, `app/scan/index.tsx:206` | duration_ms, success | Scan/import |
| error_shown | `app/scan/index.tsx:202` | code | Context/log |
| scorecard_imported | `app/scan/review.tsx:216` | player_count, low_confidence_item_count | Scan/import |
| posthogAppLogger.scorecardScoresCommitted | `app/scan/review.tsx:220`, `app/scan/review.tsx:270` | playerCount, importMode, lowConfidenceItemCount | Context/log |
| quick_settlement_created | `app/scan/review.tsx:265` | player_count, game_ids, low_confidence_item_count | Creation |
| contest setup saved | `src/services/posthog-log.ts:13` | player_count, group_count, is_tournament | Context/log |
| scorecard scan completed | `src/services/posthog-log.ts:27` | player_count, has_contest_context | Scan/import |
| scorecard scores committed | `src/services/posthog-log.ts:42` | player_count, import_mode, low_confidence_item_count | Context/log |
| tournament director entitlement started | `src/services/posthog-log.ts:58` | period_type, product_id, store | Conversion |
| posthogAppLogger.tournamentDirectorEntitlementStarted | `src/services/purchases.ts:113` | None literal (see dynamic-payload note) | Context/log |

The web allow-list is `src/services/analytics-web.ts:28`: app_opened (none), screen_viewed (screen_name), score_snap_started (none), score_snap_completed (duration_ms, success), share_tapped (none), error_shown (code). The wrapper adds app/platform context; SDK delivery token/distinct_id and $process_person_profile are transport fields, outside literal call-site properties. The guard verifies the allow-list names and property keys against the contract.

The entitlement logger call passes conversion.event instead of an object literal; its emitted period_type, product_id and store keys are guarded at the logger.info boundary. This is a static literal inventory, not proof of dynamic payload contents or successful ingestion.

## Activation coverage

AUG-277 defines activation as the first round finished through any entry method, separately from the first scan. `round_finalized` occurs only after explicit scorecard finalization (scorecard.tsx:327); it lacks first-ever, durable account/cohort and entry-method attribution. `scorecard_imported` (scan/review.tsx:216) measures committing an import to an existing contest, not finishing a round. `quick_settlement_created` (scan/review.tsx:265) measures quick-settle creation, not a universal first-round finish. Scan-start/completion events measure processing, not activation. `share_tapped` measures intent, not confirmed sharing.

Manual score entry, paste/import commits without explicit finalization, guest/join/shared-scorecard scoring and viewing a settlement emit no dedicated first-round-finished capture. Native camera processing emits scan events but no finish event. Web scan emits score_snap_completed but no universal finish event. Returning or restored contests do not emit a first-finish capture merely by loading. The separate Quick Settle completion queue and server proposals are outside this PostHog contract; their existence does not establish cross-entry activation coverage. No activation numerator can be inferred from this inventory, and no event was added to fill the gap.
