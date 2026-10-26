import { REAL_AUTH_CONFIGURED } from "../config/auth";
import { useAuthStore } from "./auth-store";
import { generateJoinCode } from "../services/guest-join";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GameType, GameConfig, Player, Course, HoleInfo, AuxiliaryData } from "../engine/types";

export interface ContestGroup {
  id: string;
  name: string;
  players: Player[];
}

export interface RoundInfo {
  id: string;
  number: number;
  name: string;
  date?: string;
  groups: ContestGroup[];
}

export interface TeamInfo {
  id: string;
  name: string;
  color?: string;
}

export interface Contest {
  id: string;
  name: string;
  course: Course;
  status: "active" | "completed";
  betUnit: number;
  hasTeams: boolean;
  teams?: TeamInfo[]; // up to 20 teams
  // Legacy compat
  teamAName?: string;
  teamBName?: string;
  groups: ContestGroup[];
  games: GameType[];
  gameConfig?: GameConfig;
  createdAt: string;
  auxiliaryData?: AuxiliaryData;
  isDemo?: boolean;
  joinCode?: string;
  liveShareEnabled?: boolean;
  // Multi-round tournament support
  rounds?: RoundInfo[];
  currentRound?: number; // 1-indexed
  isTournament?: boolean;
}

interface ContestState {
  contests: Contest[];
  activeContestId: string | null;

  // Actions
  addContest: (contest: Contest) => void;
  updateContest: (id: string, updates: Partial<Contest>) => void;
  deleteContest: (id: string) => void;
  setActiveContest: (id: string | null) => void;
  getActiveContest: () => Contest | undefined;

  // Score entry
  updateScore: (
    contestId: string,
    groupId: string,
    playerId: string,
    hole: number,
    strokes: number
  ) => void;

  // Bulk score import (from OCR scanning)
  importScores: (
    contestId: string,
    groupId: string,
    playerScores: { playerId: string; scores: number[] }[]
  ) => void;

  completeContest: (id: string) => void;

  // Auxiliary data for Tier 2 games (Wolf, Hammer, Snake, Greenies, BBB)
  updateAuxiliaryData: (
    contestId: string,
    gameKey: keyof AuxiliaryData,
    hole: number,
    data: any
  ) => void;

  // Clear all data (used on sign-out)
  resetAll: () => void;
}

export const useContestStore = create<ContestState>()(
  persist(
    (set, get) => ({
      contests: [],
      activeContestId: null,

      addContest: (contest) => {
        // GS-5: explicit offline builds treat the local user as organizer for e2e.
        // Configured builds accept only a real Supabase UUID session, never stub IDs.
        const auth = useAuthStore.getState();
        if (REAL_AUTH_CONFIGURED && (!auth.session || auth.isAnonymous || !/^[0-9a-f-]{36}$/i.test(auth.user?.id || ""))) throw new Error("Sign in to organize a contest.");
        set((state) => ({ contests: [...state.contests, { ...contest, joinCode: generateJoinCode(state.contests.map(c => c.joinCode || "")) }] }));
      },

      updateContest: (id, updates) =>
        set((state) => ({
          contests: state.contests.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          ),
        })),

      deleteContest: (id) =>
        set((state) => ({
          contests: state.contests.filter((c) => c.id !== id),
          activeContestId:
            state.activeContestId === id ? null : state.activeContestId,
        })),

      setActiveContest: (id) => set({ activeContestId: id }),

      getActiveContest: () => {
        const state = get();
        return state.contests.find((c) => c.id === state.activeContestId);
      },

      updateScore: (contestId, groupId, playerId, hole, strokes) =>
        set((state) => ({
          contests: state.contests.map((c) => {
            if (c.id !== contestId) return c;
            return {
              ...c,
              groups: c.groups.map((g) => {
                if (g.id !== groupId) return g;
                return {
                  ...g,
                  players: g.players.map((p) => {
                    if (p.id !== playerId) return p;
                    const newScores = [...p.scores];
                    newScores[hole - 1] = strokes;
                    return { ...p, scores: newScores };
                  }),
                };
              }),
            };
          }),
        })),

      importScores: (contestId, groupId, playerScores) =>
        set((state) => ({
          contests: state.contests.map((c) => {
            if (c.id !== contestId) return c;
            return {
              ...c,
              groups: c.groups.map((g) => {
                if (g.id !== groupId) return g;
                return {
                  ...g,
                  players: g.players.map((p) => {
                    const imported = playerScores.find(
                      (ps) => ps.playerId === p.id
                    );
                    if (!imported) return p;
                    return { ...p, scores: imported.scores };
                  }),
                };
              }),
            };
          }),
        })),

      completeContest: (id) =>
        set((state) => ({
          contests: state.contests.map((c) =>
            c.id === id ? { ...c, status: "completed" as const } : c
          ),
        })),

      updateAuxiliaryData: (contestId, gameKey, hole, data) =>
        set((state) => ({
          contests: state.contests.map((c) => {
            if (c.id !== contestId) return c;
            const existing = c.auxiliaryData || {};
            const gameData = existing[gameKey] || {};
            return {
              ...c,
              auxiliaryData: {
                ...existing,
                [gameKey]: {
                  ...gameData,
                  [hole]: data,
                },
              },
            };
          }),
        })),

      resetAll: () => set({ contests: [], activeContestId: null }),
    }),
    {
      name: "snapscore-contests",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Create a realistic sample contest for first-time users
export function createSampleContest(): Contest {
  const players = [
    {
      id: generateId(),
      name: "Mike T.",
      handicap: 8,
      team: null as string | null,
      scores: [4, 5, 4, 3, 5, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4], // 75
    },
    {
      id: generateId(),
      name: "Dave R.",
      handicap: 15,
      team: null as string | null,
      scores: [5, 6, 4, 4, 5, 3, 5, 5, 5, 5, 5, 3, 6, 5, 5, 4, 4, 5], // 84
    },
    {
      id: generateId(),
      name: "Chris L.",
      handicap: 12,
      team: null as string | null,
      scores: [4, 5, 5, 3, 4, 4, 5, 5, 4, 5, 4, 3, 5, 5, 6, 3, 4, 4], // 78
    },
    {
      id: generateId(),
      name: "Jake P.",
      handicap: 20,
      team: null as string | null,
      scores: [5, 6, 5, 4, 5, 4, 5, 6, 5, 5, 5, 4, 6, 5, 6, 4, 5, 5], // 88 -> mid 80s range
    },
  ];

  const group: ContestGroup = {
    id: generateId(),
    name: "Group 1",
    players,
  };

  return {
    id: generateId(),
    name: "Sample Round",
    isDemo: true,
    course: defaultCourse("Pine Valley GC"),
    status: "completed",
    betUnit: 5,
    hasTeams: false,
    groups: [group],
    games: ["stroke_play", "skins", "nassau"],
    createdAt: new Date().toISOString(),
  };
}

// Helper to generate unique IDs
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Default course template (par 72)
export function defaultCourse(name: string = "My Course"): Course {
  const defaultHoles: HoleInfo[] = [
    { num: 1, par: 4, hcp: 7, yards: 400 },
    { num: 2, par: 5, hcp: 13, yards: 520 },
    { num: 3, par: 4, hcp: 5, yards: 380 },
    { num: 4, par: 3, hcp: 11, yards: 180 },
    { num: 5, par: 4, hcp: 1, yards: 440 },
    { num: 6, par: 3, hcp: 15, yards: 170 },
    { num: 7, par: 4, hcp: 9, yards: 420 },
    { num: 8, par: 5, hcp: 3, yards: 540 },
    { num: 9, par: 4, hcp: 17, yards: 400 },
    { num: 10, par: 4, hcp: 8, yards: 420 },
    { num: 11, par: 4, hcp: 4, yards: 450 },
    { num: 12, par: 3, hcp: 12, yards: 160 },
    { num: 13, par: 5, hcp: 14, yards: 510 },
    { num: 14, par: 4, hcp: 2, yards: 430 },
    { num: 15, par: 5, hcp: 16, yards: 520 },
    { num: 16, par: 3, hcp: 6, yards: 175 },
    { num: 17, par: 4, hcp: 10, yards: 410 },
    { num: 18, par: 4, hcp: 18, yards: 440 },
  ];
  return { name, holes: defaultHoles };
}

// Serialize updates so older score snapshots cannot overtake newer ones.
useContestStore.subscribe((state, previous) => {
  for (const contest of state.contests) {
    if (contest.liveShareEnabled && contest !== previous.contests.find(c => c.id === contest.id)) {
      void import('../services/live-share').then(m => m.publishSnapshot(contest)).catch(() => {
        // Local scoring remains available. Organizer can retry with Share.
      });
    }
  }
});
