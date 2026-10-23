import { useState } from "react";
import { ScrollView, Text, TextInput, Pressable, View } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useContestStore, type Contest } from "../../src/stores/contest-store";
import { useGuestStore } from "../../src/stores/guest-store";
import { localContestJoinService, claimGuestHistory } from "../../src/services/guest-join";
import { COLORS } from "../../src/ui/theme";
import { LocalJoinLimitationBanner } from "../../src/ui/LocalJoinLimitationBanner";
export default function JoinContest() {
  const router = useRouter();
  const { code: initial } = useLocalSearchParams<{ code: string }>();
  const [code, setCode] = useState(initial === "enter" ? "" : initial || "");
  const [name, setName] = useState("");
  const [contestId, setContestId] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState("");
  const [claim, setClaim] = useState("");
  const contests = useContestStore(s => s.contests);
  const contest = contests.find(c => c.id === contestId);
  const guest = useGuestStore();
  const binding = guest.bindings.find(b => b.contestId === contestId);
  const player = contest?.groups.flatMap(g => g.players).find(p => p.id === binding?.playerId);
  const button = (label: string, action: () => void, id?: string) => <Pressable testID={id} onPress={action} style={{ backgroundColor: COLORS.surfaceHigh, padding: 14, borderRadius: 12, marginVertical: 5 }}><Text style={{ color: COLORS.primary }}>{label}</Text></Pressable>;
  const lookup = async () => {
    try {
      setError("");
      if (!name.trim()) throw new Error("Enter your display name.");
      const found = await localContestJoinService(() => useContestStore.getState().contests).lookup(code);
      if (!found) throw new Error("Contest not found on this device. Offline codes work only in the organizer’s browser.");
      setContestId(found.id);
    } catch (e: any) { setError(e.message); }
  };
  const join = (c: Contest, playerId: string) => {
    try { guest.join(c, playerId, name); setJoined(true); setError(""); } catch (e: any) { setError(e.message); }
  };
  return <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}><View style={{ paddingHorizontal: 24, paddingTop: 16 }}><Pressable testID="join-dismiss" accessibilityRole="button" accessibilityLabel="Back to home" onPress={() => router.replace("/")} style={{ paddingVertical: 12 }}><Text style={{ color: COLORS.primary }}>Back to home</Text></Pressable><LocalJoinLimitationBanner /></View><ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
    <Text style={{ color: COLORS.text, fontSize: 26 }}>Join with code</Text>
    <Text style={{ color: COLORS.textDim }}>Play as a guest. No account needed.</Text>
    {!contest && <>
      <TextInput accessibilityLabel="Join code" placeholder="Join code" value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={6} style={{ color: COLORS.text, backgroundColor: COLORS.surfaceHigh, padding: 16 }} />
      <TextInput placeholder="Display name" value={name} onChangeText={setName} style={{ color: COLORS.text, backgroundColor: COLORS.surfaceHigh, padding: 16 }} />
      {button("Find contest", () => { void lookup(); })}
    </>}
    {!!error && <Text style={{ color: COLORS.error }}>{error}</Text>}
    {contest && !joined && <>
      <Text style={{ color: COLORS.text, fontSize: 22 }}>{contest.name}</Text>
      <Text style={{ color: COLORS.text }}>Pick your player name</Text>
      <Text style={{ color: COLORS.textDim }}>Choose your existing slot. Ask the organizer to add you if your name is missing.</Text>
      {contest.groups.map(g => <View key={g.id}><Text style={{ color: COLORS.textDim }}>{g.name}</Text>{g.players.map(p => <View key={p.id}>{button(p.name, () => join(contest, p.id), `guest-pick-${p.name}`)}</View>)}</View>)}
    </>}
    {contest && joined && player && binding && <>
      <Text testID="guest-identity" style={{ color: COLORS.text, fontSize: 20 }}>Playing as {player.name} · Guest {binding.displayName}</Text>
      <Text style={{ color: COLORS.textDim }}>Only your scores are editable. Scores save in this browser.</Text>
      {button("Claim your rounds — coming soon", () => setClaim(claimGuestHistory()), "guest-claim")}
      {!!claim && <Text testID="guest-claim-message" style={{ color: COLORS.primary }}>{claim}</Text>}
      <Text style={{ color: COLORS.text, fontSize: 22 }}>Leaderboard</Text>
      {[...contest.groups.flatMap(g => g.players)].sort((a,b) => a.scores.reduce((s,n)=>s+n,0)-b.scores.reduce((s,n)=>s+n,0)).map(p => <Text key={p.id} testID={`guest-total-${p.name}`} style={{ color: COLORS.text }}>{p.name}: {p.scores.some(n=>n>0) ? p.scores.reduce((s,n)=>s+n,0) : "No scores yet"}</Text>)}
      <Text style={{ color: COLORS.text, fontSize: 22 }}>Your scores</Text>
      {contest.course.holes.map((h, i) => <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <Text style={{ color: COLORS.text }}>Hole {i+1}</Text>
        <TextInput testID={`guest-score-${i+1}`} accessibilityLabel={`Hole ${i+1} strokes`} keyboardType="number-pad" editable={contest.status === "active"} value={player.scores[i] ? String(player.scores[i]) : ""} placeholder="—" onChangeText={text => {
          if (!/^\d{0,2}$/.test(text)) return;
          const strokes = Number(text);
          if (strokes >= 0 && strokes <= 15) useContestStore.getState().updateScore(contest.id, binding.groupId, binding.playerId, i+1, strokes);
        }} style={{ color: COLORS.text, backgroundColor: COLORS.surfaceHigh, padding: 12, width: 80 }} />
      </View>)}
    </>}
  </ScrollView></SafeAreaView>;
}
