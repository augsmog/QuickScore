/** Static inventory only; importing this module emits no telemetry. Logger methods
 * use a posthogAppLogger. prefix and log messages have separate entries. */
const entries: Record<string, { files: string[]; allowedProps: string[] }> = {
  "app_opened": {
    "files": [
      "app/_layout.tsx"
    ],
    "allowedProps": []
  },
  "screen_viewed": {
    "files": [
      "app/_layout.tsx"
    ],
    "allowedProps": [
      "screen_name"
    ]
  },
  "round_finalized": {
    "files": [
      "app/contest/[id]/index.tsx"
    ],
    "allowedProps": [
      "game_ids",
      "group_count",
      "is_tournament"
    ]
  },
  "share_tapped": {
    "files": [
      "app/contest/[id]/settlement.tsx"
    ],
    "allowedProps": []
  },
  "contest_created": {
    "files": [
      "app/contest/new.tsx"
    ],
    "allowedProps": [
      "player_count",
      "group_count",
      "game_ids",
      "has_teams",
      "is_tournament",
      "round_count"
    ]
  },
  "posthogAppLogger.contestCreated": {
    "files": [
      "app/contest/new.tsx"
    ],
    "allowedProps": [
      "playerCount",
      "groupCount",
      "isTournament"
    ]
  },
  "subscription_purchase_completed": {
    "files": [
      "app/paywall.tsx"
    ],
    "allowedProps": [
      "selected_tier",
      "billing_period"
    ]
  },
  "scorecard_scan_processed": {
    "files": [
      "app/scan/index.tsx"
    ],
    "allowedProps": [
      "player_count",
      "has_contest_context"
    ]
  },
  "posthogAppLogger.scorecardScanCompleted": {
    "files": [
      "app/scan/index.tsx"
    ],
    "allowedProps": [
      "playerCount",
      "hasContestContext"
    ]
  },
  "score_snap_started": {
    "files": [
      "app/scan/index.tsx"
    ],
    "allowedProps": []
  },
  "score_snap_completed": {
    "files": [
      "app/scan/index.tsx"
    ],
    "allowedProps": [
      "duration_ms",
      "success"
    ]
  },
  "error_shown": {
    "files": [
      "app/scan/index.tsx"
    ],
    "allowedProps": [
      "code"
    ]
  },
  "scorecard_imported": {
    "files": [
      "app/scan/review.tsx"
    ],
    "allowedProps": [
      "player_count",
      "low_confidence_item_count"
    ]
  },
  "posthogAppLogger.scorecardScoresCommitted": {
    "files": [
      "app/scan/review.tsx"
    ],
    "allowedProps": [
      "playerCount",
      "importMode",
      "lowConfidenceItemCount"
    ]
  },
  "quick_settlement_created": {
    "files": [
      "app/scan/review.tsx"
    ],
    "allowedProps": [
      "player_count",
      "game_ids",
      "low_confidence_item_count"
    ]
  },
  "contest setup saved": {
    "files": [
      "src/services/posthog-log.ts"
    ],
    "allowedProps": [
      "player_count",
      "group_count",
      "is_tournament"
    ]
  },
  "scorecard scan completed": {
    "files": [
      "src/services/posthog-log.ts"
    ],
    "allowedProps": [
      "player_count",
      "has_contest_context"
    ]
  },
  "scorecard scores committed": {
    "files": [
      "src/services/posthog-log.ts"
    ],
    "allowedProps": [
      "player_count",
      "import_mode",
      "low_confidence_item_count"
    ]
  },
  "tournament director entitlement started": {
    "files": [
      "src/services/posthog-log.ts"
    ],
    "allowedProps": [
      "period_type",
      "product_id",
      "store"
    ]
  },
  "posthogAppLogger.tournamentDirectorEntitlementStarted": {
    "files": [
      "src/services/purchases.ts"
    ],
    "allowedProps": []
  }
};
for (const entry of Object.values(entries)) {
  Object.freeze(entry.files); Object.freeze(entry.allowedProps); Object.freeze(entry);
}
export const ANALYTICS_CONTRACT: Readonly<Record<string, { readonly files: readonly string[]; readonly allowedProps: readonly string[] }>> = Object.freeze(entries);
