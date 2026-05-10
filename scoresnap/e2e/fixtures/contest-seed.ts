import type { Page } from "@playwright/test";

import type { Contest, ContestGroup } from "../../src/stores/contest-store";
import { TEST_COURSE, TEST_PLAYERS } from "./test-data";

/** Must match `persist({ name })` in contest-store. */
export const CONTEST_STORAGE_KEY = "snapscore-contests";

export function buildContestPlayersFromTestData() {
  return TEST_PLAYERS.map((p, i) => ({
    id: `pw-player-${i}`,
    name: p.name,
    handicap: p.handicap,
    team: null as string | null,
    scores: [...p.scores],
  }));
}

export function makeCompletedContest(overrides: Partial<Contest> = {}): Contest {
  const players = buildContestPlayersFromTestData();
  const group: ContestGroup = {
    id: "pw-g1",
    name: "Group 1",
    players,
  };
  return {
    id: "test-settlement-contest",
    name: "Settlement Test Round",
    course: { name: TEST_COURSE.name, holes: [...TEST_COURSE.holes] },
    status: "completed",
    betUnit: 5,
    hasTeams: false,
    groups: [group],
    games: ["stroke_play"],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/** Active contest with stroke_play only for score entry on web (no Tier-2 auxiliary on hole 1). */
export function makeActiveContest(id: string, name: string): Contest {
  const players = [
    {
      id: "active-p1",
      name: "Test Golfer",
      handicap: 10,
      team: null as string | null,
      scores: new Array(18).fill(0),
    },
    {
      id: "active-p2",
      name: "Partner",
      handicap: 18,
      team: null as string | null,
      scores: new Array(18).fill(0),
    },
  ];
  const group: ContestGroup = {
    id: "active-g1",
    name: "Group 1",
    players,
  };
  return {
    id,
    name,
    course: { name: TEST_COURSE.name, holes: [...TEST_COURSE.holes] },
    status: "active",
    betUnit: 5,
    hasTeams: false,
    groups: [group],
    games: ["stroke_play"],
    createdAt: new Date().toISOString(),
  };
}

export function makeHistoryContests(): Contest[] {
  const basePlayers = buildContestPlayersFromTestData();
  const c1: Contest = {
    id: "history-1",
    name: "Morning Round",
    course: { name: "Pebble Beach GL", holes: [...TEST_COURSE.holes] },
    status: "completed",
    betUnit: 5,
    hasTeams: false,
    groups: [
      {
        id: "h-g1",
        name: "Group 1",
        players: basePlayers.map((p) => ({ ...p, id: `${p.id}-h1` })),
      },
    ],
    games: ["stroke_play", "skins"],
    createdAt: "2026-05-08T10:00:00.000Z",
  };
  const c2: Contest = {
    id: "history-2",
    name: "Afternoon Round",
    course: { name: "Augusta National GC", holes: [...TEST_COURSE.holes] },
    status: "completed",
    betUnit: 10,
    hasTeams: false,
    groups: [
      {
        id: "h-g2",
        name: "Group 1",
        players: basePlayers.slice(0, 2).map((p) => ({ ...p, id: `${p.id}-h2` })),
      },
    ],
    games: ["nassau"],
    createdAt: "2026-05-09T14:00:00.000Z",
  };
  return [c1, c2];
}

/**
 * Persist contests the way zustand stores them (functions rehydrate from store definition).
 */
export function buildContestStorageJson(
  contests: Contest[],
  activeContestId: string | null = null
) {
  return JSON.stringify({
    state: { contests, activeContestId },
    version: 0,
  });
}

export async function seedContestStorage(
  page: Page,
  contests: Contest[],
  activeContestId: string | null = null
) {
  const payload = buildContestStorageJson(contests, activeContestId);
  await page.addInitScript(
    ({ key, payload: p }: { key: string; payload: string }) => {
      localStorage.setItem(key, p);
    },
    { key: CONTEST_STORAGE_KEY, payload }
  );
}
