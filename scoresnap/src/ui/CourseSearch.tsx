import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Keyboard,
  Linking,
} from "react-native";
import { Search, MapPin, ChevronDown, X, Check, Navigation } from "lucide-react-native";
import { COLORS } from "./theme";
import {
  searchCourses,
  courseSearchResting,
  getCourseDetail,
  CourseSearchResult,
  CourseDetail,
  TeeBox,
  teeBoxToCourse,
} from "../services/course-api";
import type { Course as EngineCourse } from "../engine/types";

// ── Location helpers ──
let Location: any = null;
try {
  Location = require("expo-location");
} catch {
  // expo-location not installed — distance sorting disabled
}

interface Coords {
  latitude: number;
  longitude: number;
}

async function requestLocation(): Promise<Coords | null> {
  if (!Location) return null;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy?.Balanced ?? 3,
    });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
  } catch {
    return null;
  }
}

/** Haversine distance in miles */
function distanceMiles(a: Coords, b: Coords): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const sin1 = Math.sin(dLat / 2);
  const sin2 = Math.sin(dLon / 2);
  const h =
    sin1 * sin1 +
    Math.cos((a.latitude * Math.PI) / 180) *
      Math.cos((b.latitude * Math.PI) / 180) *
      sin2 * sin2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ── Types ──
interface CourseSearchProps {
  onSelect: (course: EngineCourse, courseName: string, teeBox: TeeBox | null) => void;
  initialCourseName?: string;
}

interface CourseWithDistance extends CourseSearchResult {
  distance?: number; // miles from user
}

// ── Tee box colors ──
const TEE_COLORS: Record<string, string> = {
  black: "#1a1a1a",
  blue: COLORS.blue,
  white: "#e8edf5",
  gold: COLORS.gold,
  red: COLORS.error,
  green: COLORS.primary,
  silver: COLORS.silver,
};

function getTeeColor(tee: TeeBox): string {
  const lower = (tee.color || tee.name || "").toLowerCase();
  for (const [key, color] of Object.entries(TEE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return COLORS.textDim;
}

// ── Component ──
export default function CourseSearch({ onSelect, initialCourseName }: CourseSearchProps) {
  const [resting, setResting] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualCard, setManualCard] = useState("");
  const [manualError, setManualError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseWithDistance[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseDetail | null>(null);
  const [selectedTee, setSelectedTee] = useState<TeeBox | null>(null);
  const [displayName, setDisplayName] = useState(initialCourseName || "");
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<TextInput>(null);
  const searchVersion = useRef(0);
  useEffect(() => () => { searchVersion.current++; if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  // Request location when modal first opens
  useEffect(() => {
    if (showModal && !locationRequested) {
      setLocationRequested(true);
      requestLocation().then((coords) => {
        if (coords) setUserLocation(coords);
      });
    }
  }, [showModal, locationRequested]);

  // Focus the TextInput after the modal slide animation finishes
  useEffect(() => {
    if (showModal && !selectedCourse) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, Platform.OS === "ios" ? 400 : 100);
      return () => clearTimeout(timer);
    }
  }, [showModal, selectedCourse]);

  const handleSearch = useCallback(
    (text: string) => {
      setQuery(text);
      const version = ++searchVersion.current;
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (text.length < 3) {
        setLoading(false);
        setResults([]);
        return;
      }

      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        const courses = await searchCourses(text);
        if (version !== searchVersion.current) return;
        setResting(courseSearchResting);

        // Attach distance if we have user location and course lat/lng
        const withDistance: CourseWithDistance[] = courses.map((c: any) => {
          if (userLocation && c.latitude != null && c.longitude != null) {
            return { ...c, distance: distanceMiles(userLocation, { latitude: c.latitude, longitude: c.longitude }) };
          }
          return c;
        });

        // Sort by distance if available, otherwise keep API order
        withDistance.sort((a, b) => {
          if (a.distance != null && b.distance != null) return a.distance - b.distance;
          if (a.distance != null) return -1;
          if (b.distance != null) return 1;
          return 0;
        });

        setResults(withDistance);
        setLoading(false);
      }, 400);
    },
    [userLocation]
  );

  const handleSelectCourse = async (course: CourseSearchResult) => {
    setLoading(true);
    Keyboard.dismiss();
    const detail = await getCourseDetail(course.id);
    if (detail) {
      setSelectedCourse(detail);
      if (detail.teeBoxes.length > 0) {
        setSelectedTee(detail.teeBoxes[0]);
      }
    } else {
      setDisplayName(course.name);
      setManualName(course.name);
      setResting(courseSearchResting);
      setShowModal(true);
    }
    setLoading(false);
  };

  const handleConfirmTee = () => {
    if (!selectedCourse) return;
    const teeName = selectedTee
      ? `${selectedCourse.name} (${selectedTee.name})`
      : selectedCourse.name;
    setDisplayName(teeName);

    const engineCourse = selectedTee ? teeBoxToCourse(selectedCourse.name, selectedTee) : null;
    if (!engineCourse || (selectedCourse.holes != null && engineCourse.holes.length !== selectedCourse.holes)) {
      setManualName(selectedCourse.name);
      setManualCard(selectedTee?.holes.map(h => `${h.number ?? ""},${h.par ?? ""},${h.handicap ?? ""},${h.yards ?? ""}`).join("\n") ?? "");
      return;
    }
    onSelect(engineCourse, teeName, selectedTee);

    setShowModal(false);
    setSelectedCourse(null);
    setSelectedTee(null);
    setQuery("");
    setResults([]);
  };

  const formatDistance = (miles: number): string => {
    if (miles < 1) return `${Math.round(miles * 5280)} ft`;
    if (miles < 10) return `${miles.toFixed(1)} mi`;
    return `${Math.round(miles)} mi`;
  };

  return (
    <View>
      {/* Trigger Button */}
      <Pressable
        onPress={() => setShowModal(true)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: COLORS.inputBg,
          borderColor: COLORS.border,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <MapPin size={16} color={COLORS.textDim} />
        <Text
          style={{
            flex: 1,
            color: displayName ? COLORS.text : COLORS.textDim,
            fontSize: 14,
          }}
          numberOfLines={1}
        >
          {displayName || "Search courses..."}
        </Text>
        <ChevronDown size={16} color={COLORS.textDim} />
      </Pressable>

      {/* Search Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowModal(false)}
      >
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 0.15 }} onPress={() => setShowModal(false)} />
          <View
            style={{
              flex: 0.85,
              backgroundColor: COLORS.bg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              paddingTop: 16,
            }}
          >
            {/* Handle */}
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 2,
                backgroundColor: COLORS.border,
                alignSelf: "center",
                marginBottom: 16,
              }}
            />

            {manualName ? (
              <View style={{ flex: 1, padding: 20 }}>
                <Text style={{ color: COLORS.text }}>Enter holes manually for {manualName}</Text>
                <Text style={{ color: COLORS.textDim }}>One hole per line: number, par, handicap, yards. Fill every blank.</Text>
                <TextInput accessibilityLabel="Manual hole card" multiline value={manualCard} onChangeText={setManualCard}
                  placeholder="1, par, handicap, yards" placeholderTextColor={COLORS.textDim}
                  style={{ color: COLORS.text, minHeight: 180, borderWidth: 1, borderColor: COLORS.border, marginVertical: 12 }} />
                <Text style={{ color: COLORS.error }}>{manualError}</Text>
                <Pressable onPress={() => {
                  const rows = manualCard.trim().split(/\n/).map(line => line.split(',').map(v => v.trim() ? Number(v) : NaN));
                  if (![9,18].includes(rows.length) || rows.some((r,i) => r.length !== 4 || r.some(v => !Number.isInteger(v)) || r[0] !== i+1 || r[1] < 3 || r[1] > 6 || r[2] < 1 || r[2] > rows.length || r[3] <= 0) || new Set(rows.map(r => r[2])).size !== rows.length) {
                    setManualError("Enter 9 or 18 complete holes with unique handicap indexes."); return;
                  }
                  onSelect({ name: manualName, holes: rows.map(([num,par,hcp,yards]) => ({num,par,hcp,yards})) }, manualName, null);
                  setDisplayName(manualName); setManualName(""); setManualCard(""); setSelectedCourse(null); setSelectedTee(null); setShowModal(false);
                }}><Text style={{ color: COLORS.primary }}>Use manual card</Text></Pressable>
                <Pressable onPress={() => setManualName("")}><Text style={{ color: COLORS.textDim }}>Back</Text></Pressable>
              </View>
            ) : !selectedCourse ? (
              /* ── Search View ── */
              <View style={{ flex: 1 }}>
                <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <Text
                      style={{
                        color: COLORS.text,
                        fontWeight: "800",
                        fontSize: 18,
                      }}
                    >
                      Find Your Course
                    </Text>
                    {userLocation && (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Navigation size={12} color={COLORS.primary} />
                        <Text
                          style={{
                            color: COLORS.primary,
                            fontSize: 11,
                            fontWeight: "600",
                          }}
                        >
                          Nearby
                        </Text>
                      </View>
                    )}
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      backgroundColor: COLORS.inputBg,
                      borderColor: COLORS.border,
                      borderWidth: 1,
                      borderRadius: 12,
                      paddingHorizontal: 14,
                      height: 48,
                    }}
                  >
                    <Search size={18} color={COLORS.textDim} />
                    <TextInput
                      ref={inputRef}
                      value={query}
                      onChangeText={handleSearch}
                      placeholder="Search by course name..."
                      placeholderTextColor={COLORS.textDim}
                      returnKeyType="search"
                      autoCorrect={false}
                      autoCapitalize="words"
                      style={{
                        flex: 1,
                        color: COLORS.text,
                        fontSize: 15,
                        height: "100%",
                        paddingVertical: 0,
                      }}
                    />
                    {loading && (
                      <ActivityIndicator size="small" color={COLORS.accent} />
                    )}
                    {query.length > 0 && !loading && (
                      <Pressable
                        onPress={() => {
                          searchVersion.current++;
                          if (debounceRef.current) clearTimeout(debounceRef.current);
                          setQuery("");
                          setLoading(false);
                          setResults([]);
                        }}
                        hitSlop={8}
                      >
                        <X size={16} color={COLORS.textDim} />
                      </Pressable>
                    )}
                  </View>
                </View>

                <Text style={{ color: COLORS.textDim, paddingHorizontal: 20 }}>Course data: GolfCore</Text>
                {resting && <Text style={{ color: COLORS.textDim, padding: 20 }}>Course search is resting, enter holes manually</Text>}
                {/* Results */}
                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  contentContainerStyle={{
                    paddingHorizontal: 20,
                    paddingBottom: 40,
                  }}
                  ListEmptyComponent={
                    query.length >= 3 && !loading ? (
                      <View
                        style={{ alignItems: "center", paddingVertical: 32 }}
                      >
                        <Text
                          style={{ color: COLORS.textDim, fontSize: 14 }}
                        >
                          No courses found
                        </Text>
                        <Text
                          style={{
                            color: COLORS.textDim,
                            fontSize: 12,
                            marginTop: 4,
                          }}
                        >
                          Try a different search term
                        </Text>
                      </View>
                    ) : query.length > 0 && query.length < 3 ? (
                      <View
                        style={{ alignItems: "center", paddingVertical: 32 }}
                      >
                        <Text
                          style={{ color: COLORS.textDim, fontSize: 13 }}
                        >
                          Type at least 3 characters to search
                        </Text>
                      </View>
                    ) : null
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => handleSelectCourse(item)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        backgroundColor: COLORS.card,
                        borderColor: COLORS.border,
                        borderWidth: 1,
                        borderRadius: 14,
                        padding: 14,
                        marginBottom: 8,
                      }}
                    >
                      <MapPin size={18} color={COLORS.accent} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            color: COLORS.text,
                            fontWeight: "600",
                            fontSize: 14,
                          }}
                        >
                          {item.name}
                        </Text>
                        <Text
                          style={{
                            color: COLORS.textDim,
                            fontSize: 12,
                            marginTop: 2,
                          }}
                        >
                          {[item.city, item.state, item.country]
                            .filter(Boolean)
                            .join(", ")}{" "}
                          · {item.holes} holes
                        </Text>
                      </View>
                      {item.distance != null && (
                        <Text
                          style={{
                            color: COLORS.primary,
                            fontSize: 12,
                            fontWeight: "600",
                          }}
                        >
                          {formatDistance(item.distance)}
                        </Text>
                      )}
                    </Pressable>
                  )}
                />

                {/* Manual entry fallback */}
                <Pressable
                  onPress={() => {
                    if (query.trim()) {
                      setDisplayName(query.trim());
                      setManualName(query.trim());
                      setShowModal(true);
                    }
                  }}
                  style={{
                    marginHorizontal: 20,
                    marginBottom: 32,
                    borderRadius: 12,
                    padding: 14,
                    borderColor: COLORS.border,
                    borderWidth: 1,
                    borderStyle: "dashed",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: COLORS.textDim, fontSize: 13 }}>
                    Or enter course name manually
                  </Text>
                </Pressable>
              </View>
            ) : (
              /* ── Tee Box Selection View ── */
              <View style={{ flex: 1, paddingHorizontal: 20 }}>
                <Text
                  style={{
                    color: COLORS.text,
                    fontWeight: "800",
                    fontSize: 18,
                    marginBottom: 4,
                  }}
                >
                  {selectedCourse.name}
                </Text>
                <Pressable onPress={() => { if (selectedCourse.url.startsWith("https://www.golfcore.org/")) Linking.openURL(selectedCourse.url); }}>
                  <Text style={{ color: COLORS.primary }}>Course data: GolfCore</Text>
                </Pressable>
                <Text
                  style={{
                    color: COLORS.textDim,
                    fontSize: 13,
                    marginBottom: 16,
                  }}
                >
                  {[selectedCourse.city, selectedCourse.state]
                    .filter(Boolean)
                    .join(", ")}{" "}
                  · {selectedCourse.holes} holes
                </Text>

                <Text
                  style={{
                    color: COLORS.textDim,
                    fontSize: 11,
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                    marginBottom: 8,
                  }}
                >
                  Select Tee Box
                </Text>

                {selectedCourse.teeBoxes.length > 0 ? (
                  selectedCourse.teeBoxes.map((tee, ti) => {
                    const isSelected = selectedTee?.name === tee.name;
                    const teeColor = getTeeColor(tee);
                    return (
                      <Pressable
                        key={ti}
                        onPress={() => setSelectedTee(tee)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          backgroundColor: isSelected
                            ? COLORS.accent + "12"
                            : COLORS.card,
                          borderColor: isSelected
                            ? COLORS.accent + "44"
                            : COLORS.border,
                          borderWidth: 1,
                          borderRadius: 14,
                          padding: 14,
                          marginBottom: 8,
                        }}
                      >
                        <View
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 12,
                            backgroundColor: teeColor,
                            borderColor:
                              teeColor === "#e8edf5"
                                ? COLORS.border
                                : "transparent",
                            borderWidth: teeColor === "#e8edf5" ? 1 : 0,
                          }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              color: COLORS.text,
                              fontWeight: "600",
                              fontSize: 14,
                            }}
                          >
                            {tee.name} Tees
                          </Text>
                          <Text
                            style={{
                              color: COLORS.textDim,
                              fontSize: 12,
                              marginTop: 2,
                            }}
                          >
                            {(tee.totalYards ?? 0) > 0 ? `${tee.totalYards} yds` : ""}
                            {tee.courseRating
                              ? ` · Rating ${tee.courseRating}`
                              : ""}
                            {tee.slopeRating
                              ? ` / Slope ${tee.slopeRating}`
                              : ""}
                          </Text>
                        </View>
                        {isSelected && (
                          <Check size={18} color={COLORS.accent} />
                        )}
                      </Pressable>
                    );
                  })
                ) : (
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <Text style={{ color: COLORS.textDim, fontSize: 13 }}>
                      No tee box data available for this course
                    </Text>
                  </View>
                )}

                {/* Confirm */}
                <Pressable
                  onPress={handleConfirmTee}
                  style={{
                    backgroundColor: COLORS.accent,
                    borderRadius: 14,
                    paddingVertical: 14,
                    alignItems: "center",
                    marginTop: 12,
                  }}
                >
                  <Text
                    style={{ color: COLORS.onPrimary, fontWeight: "700", fontSize: 15 }}
                  >
                    {selectedTee && teeBoxToCourse(selectedCourse.name, selectedTee)
                      ? `Select ${selectedTee.name} Tees`
                      : `Use ${selectedCourse.name}`}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    setSelectedCourse(null);
                    setSelectedTee(null);
                  }}
                  style={{
                    alignItems: "center",
                    paddingVertical: 12,
                    marginTop: 4,
                  }}
                >
                  <Text style={{ color: COLORS.textDim, fontSize: 14 }}>
                    Back to Search
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
