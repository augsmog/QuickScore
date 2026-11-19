import { posthog } from "../config/posthog";

export const posthogAppLogger = {
  contestCreated({
    playerCount,
    groupCount,
    isTournament,
  }: {
    playerCount: number;
    groupCount: number;
    isTournament: boolean;
  }) {
    posthog?.logger.info("contest setup saved", {
      player_count: playerCount,
      group_count: groupCount,
      is_tournament: isTournament,
    });
  },

  scorecardScanCompleted({
    playerCount,
    hasContestContext,
  }: {
    playerCount: number;
    hasContestContext: boolean;
  }) {
    posthog?.logger.info("scorecard scan completed", {
      player_count: playerCount,
      has_contest_context: hasContestContext,
    });
  },

  scorecardScoresCommitted({
    playerCount,
    importMode,
    lowConfidenceItemCount,
  }: {
    playerCount: number;
    importMode: "existing_contest" | "quick_settle";
    lowConfidenceItemCount: number;
  }) {
    posthog?.logger.info("scorecard scores committed", {
      player_count: playerCount,
      import_mode: importMode,
      low_confidence_item_count: lowConfidenceItemCount,
    });
  },
};
