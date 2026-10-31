import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GUEST_STORAGE_KEY, createGatedStorage } from "./persisted-keys";
import * as Crypto from "expo-crypto";
import { bindGuest, type GuestJoinState } from "../services/guest-join";
import type { Contest } from "./contest-store";
interface GuestStore extends GuestJoinState {
  join: (contest: Contest, playerId: string, name: string) => void;
}
export const useGuestStore = create<GuestStore>()(persist((set, get) => ({
  guestId: null, bindings: [],
  join: (contest, playerId, name) => set(bindGuest(get(), contest, playerId, name, () => Crypto.randomUUID())),
}), { name: GUEST_STORAGE_KEY, storage: createJSONStorage(() => createGatedStorage(AsyncStorage)) }));
