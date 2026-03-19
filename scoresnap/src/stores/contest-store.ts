import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GameType, Player, Course, HoleInfo } from "../engine/types";

export interface ContestGroup {
  id: string;
  name: string;
  players: Player[];
}

export interface Contest {
  id: string;
  name: string;
  course: Course;
  status: "active" | "completed";
  betUnit: number;
  hasTeams: boolean;
  teamAName?: string;
  teamBName?: string;
  groups: ContestGroup[];
  games: GameType[];
  createdAt: string;
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
}

export const useContestStore = create<ContestState>()(
  persist(
    (set, get) => ({
      contests: [],
      activeContestId: null,

      addContest: (contest) =>
        set((state) => ({ contests: [...state.contests, contest] })),

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
    }),
    {
      name: "scoresnap-contests",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

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
