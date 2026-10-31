import { useOnlineStore } from './online-store';
import { completeScores } from "../services/ocr-review";
import { REAL_AUTH_CONFIGURED } from "../config/auth";
import { useAuthStore } from "./auth-store";
import { generateJoinCode } from "../services/guest-join";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CONTEST_STORAGE_KEY, createGatedStorage } from "./persisted-keys";
import { GameType, GameConfig, Player, Course, HoleInfo, AuxiliaryData } from "../engine/types";
import { syncRound, syncRoundGroups, syncContestTournamentMeta, syncScore } from "../services/tournament-sync";

// Track local edits even before the first authorized snapshot (for example after an offline restart).
function tracksOnlineEdits(contestId: string): boolean {
  return !!useOnlineStore.getState().events[contestId] || (REAL_AUTH_CONFIGURED && require('../config/features').CROSS_DEVICE_SHARING_ENABLED);
}

// Load new-rule validation at the mutation boundary; legacy guest scoring stays independent of host services.
function validateHostContest(contest:Contest,_tier?:unknown){return require("../engine/contest-validation").validateHostContest(contest,require("./scan-store").useScanStore.getState().tier);}
function validateContestChange(before:Contest,after:Contest){return require("../engine/contest-validation").validateContestChange(before,after);}
function validateAuxiliaryWrite(...args:Parameters<typeof import("../engine/contest-validation").validateAuxiliaryWrite>){return require("../engine/contest-validation").validateAuxiliaryWrite(...args);}
function validateScoreWrite(...args:Parameters<typeof import("../engine/contest-validation").validateScoreWrite>){if(args[0].gameConfig?.rulesVersion===1)return require("../engine/contest-validation").validateScoreWrite(...args);}
function calculateContestSettlement(contest:Contest){return require("../engine/contest-results").calculateContestSettlement(contest);}
function scopeKey(roundId:string|undefined,groupId:string):string{return require("../engine/contest-results").scopeKey(roundId,groupId);}

export interface ContestGroup {
  id: string;
  name: string;
  players: Player[];
  teeTime?: string; // "10:03" or "10:03 AM"
  externalId?: string; // External group ID (e.g. from GolfGenius)
}

export interface RoundInfo {
  id: string;
  number: number;
  name: string;
  date?: string;
  course?: Course; // Each round can have a different course
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
  auxiliaryByScope?: Record<string, AuxiliaryData>;
  isDemo?: boolean;
  joinCode?: string;
  liveShareEnabled?: boolean;
  onlineEdits?: Record<string, { token: string; strokes: number }>;
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
    playerScores: { source?: "paste" | "ocr"; playerId: string; scores: (number | null)[] }[]
  ) => void;

  completeContest: (id: string) => void;

  // Auxiliary data for Tier 2 games (Wolf, Hammer, Snake, Greenies, BBB)
  updateAuxiliaryData: (
    contestId: string,
    gameKey: keyof AuxiliaryData,
    hole: number,
    data: any,
    groupId?: string
  ) => void;

  // Tournament/multi-round support
  setCurrentRound: (contestId: string, roundNumber: number) => void;
  addRound: (contestId: string, roundName?: string) => void;
  updateRoundGroups: (contestId: string, roundNumber: number, groups: ContestGroup[]) => void;
  copyRoundGroups: (contestId: string, fromRound: number, toRound: number) => void;

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
        validateHostContest(contest);
        set((state) => ({ contests: [...state.contests, { ...contest, joinCode: generateJoinCode(state.contests.map(c => c.joinCode || "")) }] }));
      },

      updateContest: (id, updates) =>
        set((state) => ({
          contests: state.contests.map((c) =>
            c.id === id ? (()=>{const next={...c,...updates};validateContestChange(c,next);if(updates.games || updates.gameConfig || updates.groups || updates.rounds)validateHostContest(next);return next;})() : c
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

      updateScore: (contestId, groupId, playerId, hole, strokes) => {
        let roundId: string | null = useOnlineStore.getState().events[contestId]?.snapshot.protocol === 1 ? contestId : null;
        let roundNumber = 1;
        const onlineEdit = tracksOnlineEdits(contestId) ? require("expo-crypto").randomUUID() as string : undefined;
        set((state) => ({
          contests: state.contests.map((c) => {
            if (c.id !== contestId) return c;
            validateScoreWrite(c,groupId,playerId,hole,strokes);
            if(c.status==="completed") throw new Error("Completed contest scores are locked");
            if(c.gameConfig?.rulesVersion===1 && c.games.some(g=>g==="alternate_shot" || g==="chapman")) {
              const round=c.isTournament?c.rounds?.find(r=>r.number===c.currentRound):undefined;
              const group=(round?.groups??c.groups).find(g=>g.id===groupId);
              const player=group?.players.find(p=>p.id===playerId);
              if(!player?.team) throw new Error("Choose a complete team");
              const key=scopeKey(round?.id,groupId), existing=c.auxiliaryByScope?.[key]??{};
              return {...c,auxiliaryByScope:{...c.auxiliaryByScope,[key]:{...existing,teamCards:{...existing.teamCards,[hole]:{...existing.teamCards?.[hole],[player.team]:strokes}}}}};
            }
            if (onlineEdit) {
              const localRound = c.isTournament ? c.rounds?.find(r => r.number === c.currentRound)?.id : c.id;
              c = { ...c, onlineEdits: { ...c.onlineEdits, [JSON.stringify([localRound, playerId, hole])]: { token: onlineEdit, strokes } } };
            }
            // For tournaments, update the current round's groups
            if (c.isTournament && c.rounds && c.currentRound) {
              const currentRound = c.rounds.find(r => r.number === c.currentRound);
              if (currentRound) {
                roundId = currentRound.id;
                roundNumber = currentRound.number;
              }
              return {
                ...c,
                rounds: c.rounds.map((r) => {
                  if (r.number !== c.currentRound) return r;
                  return {
                    ...r,
                    groups: r.groups.map((g) => {
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
              };
            }
            // Legacy: update groups directly
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
        }));
        // Sync to Supabase
        if (roundId) {
          syncScore(contestId, roundId, playerId, hole, strokes, roundNumber, onlineEdit).catch(err =>
            console.error('Failed to sync score:', err)
          );
        }
      },

      importScores: (contestId, groupId, playerScores) => {
        const contest = get().contests.find(c => c.id === contestId);
        if (!contest) throw new Error("Contest not found");
        const round = contest.isTournament ? contest.rounds?.find(r => r.number === contest.currentRound) : undefined;
        if (contest.isTournament && !round) throw new Error("Active round not found");
        const group = (round?.groups ?? contest.groups).find(g => g.id === groupId);
        if (!group || !Array.isArray(playerScores) || !playerScores.length) throw new Error("Invalid import group or batch");
        if (!(round?.course ?? contest.course).holes.every((h, i) => h.num === i + 1)) throw new Error("Course hole mapping requires manual entry");
        if(contest.status==="completed")throw new Error("Completed scorecards are locked");
        if(contest.gameConfig?.rulesVersion===1 && contest.games.some(g=>g==="alternate_shot"||g==="chapman"))throw new Error("Enter one canonical team card in live scoring; individual scan cards are incompatible");
        const ids = new Set<string>();
        const validated = playerScores.map(p => {
          if (!p || ids.has(p.playerId) || group.players.filter(cp => cp.id === p.playerId).length !== 1) throw new Error("Import requires unique explicit player matches");
          ids.add(p.playerId);
          return { playerId: p.playerId, scores: completeScores(p.scores, (round?.course ?? contest.course).holes.length, p.source) };
        });
        const groups = (round?.groups ?? contest.groups).map(g => g.id !== groupId ? g : ({ ...g, players: g.players.map(p => {
          const imported = validated.find(v => v.playerId === p.id);
          return imported ? { ...p, scores: imported.scores } : p;
        }) }));
        for(const imported of validated) imported.scores.forEach((n,i)=>validateScoreWrite(contest,groupId,imported.playerId,i+1,n));
        const tracking = tracksOnlineEdits(contestId);
        const onlineEdits = { ...contest.onlineEdits };
        if (tracking) for (const imported of validated) imported.scores.forEach((strokes, i) => {
          onlineEdits[JSON.stringify([round?.id ?? contest.id, imported.playerId, i + 1])] = { token: require('expo-crypto').randomUUID(), strokes };
        });
        set(state => ({ contests: state.contests.map(c => c.id !== contestId ? c : round ?
          { ...c, ...(tracking ? { onlineEdits } : {}), rounds: c.rounds!.map(r => r.id === round.id ? { ...r, groups } : r) } : { ...c, ...(tracking ? { onlineEdits } : {}), groups }) }));
      },

      completeContest: (id) =>
        set((state) => ({
          contests: state.contests.map((c) =>
            c.id === id ? (()=>{if(c.gameConfig?.rulesVersion===1 && calculateContestSettlement(c).pending) throw new Error("Confirm every score and required side-bet input before completing");return {...c,status:"completed" as const};})() : c
          ),
        })),

      updateAuxiliaryData: (contestId, gameKey, hole, data, groupId) =>
        set((state) => ({
          contests: state.contests.map((c) => {
            if (c.id !== contestId) return c;
            if(c.status==="completed") throw new Error("Completed contest inputs are locked");
            const round=c.isTournament?c.rounds?.find(r=>r.number===c.currentRound):undefined;
            const groups=round?.groups??c.groups;
            const target=groupId??(groups.length===1?groups[0].id:undefined);
            if(!target || !groups.some(g=>g.id===target)) throw new Error("Choose the input group");
            validateAuxiliaryWrite(c,target,gameKey,hole,data);
            const key=scopeKey(round?.id,target);
            const existing = c.auxiliaryByScope?.[key] || (!c.isTournament && c.groups.length===1?c.auxiliaryData:{}) || {};
            const gameData = existing[gameKey] || {};
            return {
              ...c,
              auxiliaryByScope: {...c.auxiliaryByScope,[key]:{...existing,[gameKey]:{...gameData,[hole]:data}}},
            };
          }),
        })),

      setCurrentRound: (contestId, roundNumber) => {
        set((state) => ({
          contests: state.contests.map((c) =>
            c.id === contestId ? { ...c, currentRound: roundNumber } : c
          ),
        }));
        // Sync to Supabase
        syncContestTournamentMeta(contestId, true, roundNumber).catch(err => 
          console.error('Failed to sync current round:', err)
        );
      },

      addRound: (contestId, roundName) => {
        let newRound: RoundInfo | null = null;
        set((state) => ({
          contests: state.contests.map((c) => {
            if (c.id !== contestId) return c;
            if(c.status==="completed")throw new Error("Completed contests are locked");
            const rounds:RoundInfo[] = c.rounds?.length?c.rounds:[{id:generateId(),number:1,name:"Round 1",course:c.course,groups:c.groups}];
            const newRoundNumber = rounds.length + 1;
            const allPlayers = c.groups.flatMap((g) => g.players);
            // Create initial groups for new round with all players in one group
            const newGroups: ContestGroup[] = [{
              id: generateId(),
              name: `Group 1`,
              players: allPlayers.map(p => ({
                ...p,
                scores: new Array(c.course.holes.length).fill(0),
              })),
            }];
            newRound = {
              id: generateId(),
              number: newRoundNumber,
              name: roundName || `Round ${newRoundNumber}`,
              date: new Date().toISOString().split('T')[0],
              groups: newGroups,
            };
            const auxiliaryByScope={...c.auxiliaryByScope};
            if(!c.rounds?.length)for(const group of c.groups){const previous=c.auxiliaryByScope?.[scopeKey(undefined,group.id)]??(c.groups.length===1?c.auxiliaryData:undefined);if(previous)auxiliaryByScope[scopeKey(rounds[0].id,group.id)]=previous;}
            const next={...c,isTournament:true,rounds:[...rounds,newRound],currentRound:newRoundNumber,auxiliaryByScope};
            validateHostContest(next);return next;
          }),
        }));
        // Sync to Supabase
        if (newRound) {
          syncRound(contestId, newRound).catch(err =>
            console.error('Failed to sync new round:', err)
          );
        }
      },

      updateRoundGroups: (contestId, roundNumber, groups) => {
        let roundId: string | null = useOnlineStore.getState().events[contestId]?.snapshot.protocol === 1 ? contestId : null;
        let syncedRoundNumber: number | null = null;
        set((state) => ({
          contests: state.contests.map((c) => {
            if (c.id !== contestId || !c.rounds) return c;
            const targetRound = c.rounds.find(r => r.number === roundNumber);
            if (targetRound) {
              roundId = targetRound.id;
              syncedRoundNumber = targetRound.number;
            }
            if(c.status==="completed" || targetRound?.groups.some(g=>g.players.some(p=>p.scores.some(n=>n>0))) || Object.keys(c.auxiliaryByScope??{}).some(key=>key.startsWith(`${targetRound?.id}/`)))throw new Error("Started round rosters and inputs are locked");
            const next={...c,rounds:c.rounds.map(r=>r.number===roundNumber?{...r,groups}:r)};
            validateHostContest(next);return next;
          }),
        }));
        // Sync to Supabase
        if (roundId) {
          syncRoundGroups(contestId, roundId, groups, syncedRoundNumber ?? roundNumber).catch(err =>
            console.error('Failed to sync round groups:', err)
          );
        }
      },

      copyRoundGroups: (contestId, fromRound, toRound) =>
        set((state) => ({
          contests: state.contests.map((c) => {
            if (c.id !== contestId || !c.rounds) return c;
            const sourceRound = c.rounds.find((r) => r.number === fromRound);
            if (!sourceRound) return c;
            const target=c.rounds.find(r=>r.number===toRound);
            if(c.status==="completed" || target?.groups.some(g=>g.players.some(p=>p.scores.some(n=>n>0))) || Object.keys(c.auxiliaryByScope??{}).some(key=>key.startsWith(`${target?.id}/`)))throw new Error("Cannot overwrite a started round");
            validateHostContest(c);
            return {
              ...c,
              rounds: c.rounds.map((r) => {
                if (r.number !== toRound) return r;
                // Copy group structure but reset scores
                return {
                  ...r,
                  groups: sourceRound.groups.map((g) => ({
                    ...g,
                    id: generateId(), // New group ID
                    players: g.players.map((p) => ({
                      ...p,
                      scores: new Array(c.course.holes.length).fill(0),
                    })),
                  })),
                };
              }),
            };
          }),
        })),

      resetAll: () => set({ contests: [], activeContestId: null }),
    }),
    {
      name: CONTEST_STORAGE_KEY,
      storage: createJSONStorage(() => createGatedStorage(AsyncStorage)),
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

// Helper: Get the active groups for a contest (tournament-aware)
export function getActiveGroups(contest: Contest): ContestGroup[] {
  if (contest.isTournament && contest.rounds && contest.currentRound) {
    const currentRound = contest.rounds.find((r) => r.number === contest.currentRound);
    return currentRound?.groups || [];
  }
  return contest.groups;
}

// Helper: Get all players across all rounds for tournament leaderboard
export function getTournamentPlayers(contest: Contest): Player[] {
  if (!contest.isTournament || !contest.rounds) {
    return contest.groups.flatMap((g) => g.players);
  }
  
  // Aggregate scores across all rounds
  const playerMap = new Map<string, Player>();
  
  for (const round of contest.rounds) {
    for (const group of round.groups) {
      for (const player of group.players) {
        const existing = playerMap.get(player.id);
        if (!existing) {
          playerMap.set(player.id, {
            ...player,
            scores: [...player.scores], // Clone for aggregation
          });
        } else {
          // Add this round's scores to the cumulative total
          for (let i = 0; i < player.scores.length; i++) {
            if (player.scores[i] > 0) {
              existing.scores[i] = (existing.scores[i] || 0) + player.scores[i];
            }
          }
        }
      }
    }
  }
  
  return Array.from(playerMap.values());
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

/** Release only the edit represented by a settled outbox entry, never a successor. */
export function settleOnlineEdit(contestId: string, token: string) {
  useContestStore.setState(state => ({ contests: state.contests.map(c => c.id !== contestId ? c : {
    ...c, onlineEdits: Object.fromEntries(Object.entries(c.onlineEdits ?? {}).filter(([, edit]) => edit.token !== token)),
  }) }));
}

export function retainOnlineEdit(contestId: string, key: string, token: string, strokes: number) {
  useContestStore.setState(state => ({ contests: state.contests.map(c => c.id !== contestId || c.onlineEdits?.[key] ? c : {
    ...c, onlineEdits: { ...c.onlineEdits, [key]: { token, strokes } },
  }) }));
}
