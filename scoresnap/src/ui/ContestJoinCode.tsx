import { useEffect, useState } from "react";
import { View, Text, Pressable, Share, Platform } from "react-native";
import { useContestStore, type Contest } from "../stores/contest-store";
import { generateJoinCode } from "../services/guest-join";
import { COLORS } from "./theme";
import { LocalJoinLimitationBanner } from "./LocalJoinLimitationBanner";
import { getLocalJoinLimitation } from "../services/local-join-limitation";
import { CROSS_DEVICE_SHARING_ENABLED } from "../config/features";

export function ContestJoinCode({ contest }: { contest: Contest }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!contest.joinCode) useContestStore.getState().updateContest(contest.id, { joinCode: generateJoinCode(useContestStore.getState().contests.map(c => c.joinCode || "")) });
  }, [contest.id, contest.joinCode]);
  const share = async () => {
    const link = Platform.OS === "web" ? `${window.location.origin}/join/${contest.joinCode}` : `snapscore://join/${contest.joinCode}`;
    try {
      if (Platform.OS === "web" && navigator.clipboard) { await navigator.clipboard.writeText(link); setMessage("Local invite link copied · same browser only"); }
      else await Share.share({ message: `${getLocalJoinLimitation().title} — ${getLocalJoinLimitation().message} Join with code ${contest.joinCode}: ${link}` });
    } catch { setMessage("Could not share. Copy the code shown above."); }
  };
  
  // Hide same-browser-only join codes until cross-device sharing is ready
  if (!CROSS_DEVICE_SHARING_ENABLED) {
    return null;
  }
  
  return <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
    <Text testID="organizer-join-code" style={{ color: COLORS.primary }}>Join code: {contest.joinCode}</Text>
    <View style={{ marginTop: 8 }}><LocalJoinLimitationBanner /></View>
    <Pressable onPress={share}><Text style={{ color: COLORS.text, paddingVertical: 8 }}>Copy / share local invite</Text></Pressable>
    {!!message && <Text style={{ color: COLORS.textDim }}>{message}</Text>}
  </View>;
}
