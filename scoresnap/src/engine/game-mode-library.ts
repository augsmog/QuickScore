import { ALL_GAMES, GAME_VARIATIONS, PLAYABLE_BASE_GAME_IDS, PLAYABLE_OPTION_IDS, PLAYABLE_FORMAT_IDS, GameTypeInfo } from "./types";

export interface GameModeLibraryEntry {
  id: string;
  name: string;
  desc: string;
  game?: GameTypeInfo;
}

const options: Record<string, { name: string; desc: string }> = {
  gross_net: { name: "Gross / Net", desc: "Choose gross scores or apply course handicaps when setting up your contest." },
  skins_group: { name: "Group Skins", desc: "Settle skins separately within each group instead of across the field." },
};
const formats: Record<string, { name: string; desc: string }> = {
  multi_round_multi_group_tournament: { name: "Multi-round / Multi-group Tournament", desc: "Host multiple rounds or groups with Tournament Director." },
};

// Use the same delivered capabilities as the engine's advertised inventory.
export const GAME_MODE_LIBRARY: GameModeLibraryEntry[] = [
  ...PLAYABLE_BASE_GAME_IDS.map(id => {
    const game = ALL_GAMES.find(game => game.id === id)!;
    return { id, name: game.name, desc: game.desc, game };
  }),
  ...PLAYABLE_OPTION_IDS.map(id => {
    const variation = GAME_VARIATIONS.find(variation => variation.id === id);
    return { id, ...(variation ? { name: variation.label, desc: variation.desc } : options[id]) };
  }),
  ...PLAYABLE_FORMAT_IDS.map(id => ({ id, ...formats[id] })),
];
