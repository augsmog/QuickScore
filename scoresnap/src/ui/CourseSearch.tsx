import { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  FlatList,
  Modal,
} from "react-native";
import { Search, MapPin, ChevronDown, X, Check } from "lucide-react-native";
import { COLORS } from "./theme";
import {
  searchCourses,
  getCourseDetail,
  CourseSearchResult,
  CourseDetail,
  TeeBox,
  teeBoxToCourse,
} from "../services/course-api";
import type { Course as EngineCourse } from "../engine/types";

interface CourseSearchProps {
  onSelect: (course: EngineCourse, courseName: string, teeBox: TeeBox | null) => void;
  initialCourseName?: string;
}

// Common tee box colors for display
const TEE_COLORS: Record<string, string> = {
  black: "#1a1a1a",
  blue: "#3b82f6",
  white: "#e8edf5",
  gold: "#ffd700",
  red: "#ff4757",
  green: "#00d47e",
  silver: "#c0c0c0",
};

function getTeeColor(tee: TeeBox): string {
  const lower = (tee.color || tee.name || "").toLowerCase();
  for (const [key, color] of Object.entries(TEE_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return COLORS.textDim;
}

export default function CourseSearch({ onSelect, initialCourseName }: CourseSearchProps) {
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CourseSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<CourseDetail | null>(null);
  const [selectedTee, setSelectedTee] = useState<TeeBox | null>(null);
  const [displayName, setDisplayName] = useState(initialCourseName || "");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.length < 3) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      const courses = await searchCourses(text);
      setResults(courses);
      setLoading(false);
    }, 400);
  }, []);

  const handleSelectCourse = async (course: CourseSearchResult) => {
    setLoading(true);
    const detail = await getCourseDetail(course.id);
    if (detail) {
      setSelectedCourse(detail);
      // Auto-select first tee box if available
      if (detail.teeBoxes.length > 0) {
        setSelectedTee(detail.teeBoxes[0]);
      }
    } else {
      // API unavailable — use course name only
      setDisplayName(course.name);
      setShowModal(false);
      onSelect(
        {
          name: course.name,
          holes: Array.from({ length: 18 }, (_, i) => ({
            num: i + 1,
            par: [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4][i],
            hcp: i + 1,
            yards: 400,
          })),
        },
        course.name,
        null
      );
    }
    setLoading(false);
  };

  const handleConfirmTee = () => {
    if (!selectedCourse) return;
    const teeName = selectedTee ? `${selectedCourse.name} (${selectedTee.name})` : selectedCourse.name;
    setDisplayName(teeName);

    if (selectedTee && selectedTee.holes.length >= 18) {
      const engineCourse = teeBoxToCourse(selectedCourse.name, selectedTee);
      onSelect(engineCourse, teeName, selectedTee);
    } else {
      // No hole data — use defaults
      onSelect(
        {
          name: selectedCourse.name,
          holes: Array.from({ length: 18 }, (_, i) => ({
            num: i + 1,
            par: [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4][i],
            hcp: i + 1,
            yards: 400,
          })),
        },
        teeName,
        selectedTee
      );
    }

    setShowModal(false);
    setSelectedCourse(null);
    setSelectedTee(null);
    setQuery("");
    setResults([]);
  };

  return (
    <View>
      {/* Trigger Button */}
      <Pressable
        onPress={() => setShowModal(true)}
        style={{
          flexDirection: "row", alignItems: "center", gap: 10,
          backgroundColor: COLORS.inputBg, borderColor: COLORS.border, borderWidth: 1,
          borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
        }}
      >
        <MapPin size={16} color={COLORS.textDim} />
        <Text
          style={{
            flex: 1, color: displayName ? COLORS.text : COLORS.textDim,
            fontSize: 14,
          }}
          numberOfLines={1}
        >
          {displayName || "Search courses..."}
        </Text>
        <ChevronDown size={16} color={COLORS.textDim} />
      </Pressable>

      {/* Search Modal */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={{ flex: 1, justifyContent: "flex-end" }}>
          <Pressable style={{ flex: 0.15 }} onPress={() => setShowModal(false)} />
          <View
            style={{
              flex: 0.85, backgroundColor: COLORS.bg,
              borderTopLeftRadius: 24, borderTopRightRadius: 24,
              paddingTop: 16,
            }}
          >
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: COLORS.border, alignSelf: "center", marginBottom: 16 }} />

            {!selectedCourse ? (
              /* Search View */
              <View style={{ flex: 1 }}>
                <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                  <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 18, marginBottom: 12 }}>
                    Find Your Course
                  </Text>
                  <View
                    style={{
                      flexDirection: "row", alignItems: "center", gap: 10,
                      backgroundColor: COLORS.inputBg, borderColor: COLORS.border, borderWidth: 1,
                      borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
                    }}
                  >
                    <Search size={18} color={COLORS.textDim} />
                    <TextInput
                      value={query}
                      onChangeText={handleSearch}
                      placeholder="Search by course name..."
                      placeholderTextColor={COLORS.textDim}
                      autoFocus
                      style={{ flex: 1, color: COLORS.text, fontSize: 15 }}
                    />
                    {loading && <ActivityIndicator size="small" color={COLORS.accent} />}
                    {query.length > 0 && !loading && (
                      <Pressable onPress={() => { setQuery(""); setResults([]); }}>
                        <X size={16} color={COLORS.textDim} />
                      </Pressable>
                    )}
                  </View>
                </View>

                {/* Results */}
                <FlatList
                  data={results}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
                  ListEmptyComponent={
                    query.length >= 3 && !loading ? (
                      <View style={{ alignItems: "center", paddingVertical: 32 }}>
                        <Text style={{ color: COLORS.textDim, fontSize: 14 }}>No courses found</Text>
                        <Text style={{ color: COLORS.textDim, fontSize: 12, marginTop: 4 }}>
                          Try a different search term
                        </Text>
                      </View>
                    ) : query.length > 0 && query.length < 3 ? (
                      <View style={{ alignItems: "center", paddingVertical: 32 }}>
                        <Text style={{ color: COLORS.textDim, fontSize: 13 }}>
                          Type at least 3 characters to search
                        </Text>
                      </View>
                    ) : null
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      onPress={() => handleSelectCourse(item)}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 12,
                        backgroundColor: COLORS.card, borderColor: COLORS.border, borderWidth: 1,
                        borderRadius: 14, padding: 14, marginBottom: 8,
                      }}
                    >
                      <MapPin size={18} color={COLORS.accent} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: COLORS.text, fontWeight: "600", fontSize: 14 }}>
                          {item.name}
                        </Text>
                        <Text style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2 }}>
                          {[item.city, item.state, item.country].filter(Boolean).join(", ")} · {item.holes} holes
                        </Text>
                      </View>
                    </Pressable>
                  )}
                />

                {/* Manual entry fallback */}
                <Pressable
                  onPress={() => {
                    if (query.trim()) {
                      setDisplayName(query.trim());
                      setShowModal(false);
                      onSelect(
                        {
                          name: query.trim(),
                          holes: Array.from({ length: 18 }, (_, i) => ({
                            num: i + 1,
                            par: [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4][i],
                            hcp: i + 1,
                            yards: 400,
                          })),
                        },
                        query.trim(),
                        null
                      );
                    }
                  }}
                  style={{
                    marginHorizontal: 20, marginBottom: 32, borderRadius: 12, padding: 14,
                    borderColor: COLORS.border, borderWidth: 1, borderStyle: "dashed",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: COLORS.textDim, fontSize: 13 }}>
                    Or enter course name manually
                  </Text>
                </Pressable>
              </View>
            ) : (
              /* Tee Box Selection View */
              <View style={{ flex: 1, paddingHorizontal: 20 }}>
                <Text style={{ color: COLORS.text, fontWeight: "800", fontSize: 18, marginBottom: 4 }}>
                  {selectedCourse.name}
                </Text>
                <Text style={{ color: COLORS.textDim, fontSize: 13, marginBottom: 16 }}>
                  {[selectedCourse.city, selectedCourse.state].filter(Boolean).join(", ")} · {selectedCourse.holes} holes
                </Text>

                <Text style={{ color: COLORS.textDim, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
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
                          flexDirection: "row", alignItems: "center", gap: 12,
                          backgroundColor: isSelected ? COLORS.accent + "12" : COLORS.card,
                          borderColor: isSelected ? COLORS.accent + "44" : COLORS.border,
                          borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8,
                        }}
                      >
                        <View
                          style={{
                            width: 24, height: 24, borderRadius: 12,
                            backgroundColor: teeColor,
                            borderColor: teeColor === "#e8edf5" ? COLORS.border : "transparent",
                            borderWidth: teeColor === "#e8edf5" ? 1 : 0,
                          }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: COLORS.text, fontWeight: "600", fontSize: 14 }}>
                            {tee.name} Tees
                          </Text>
                          <Text style={{ color: COLORS.textDim, fontSize: 12, marginTop: 2 }}>
                            {tee.totalYards > 0 ? `${tee.totalYards} yds` : ""}
                            {tee.courseRating ? ` · Rating ${tee.courseRating}` : ""}
                            {tee.slopeRating ? ` / Slope ${tee.slopeRating}` : ""}
                          </Text>
                        </View>
                        {isSelected && <Check size={18} color={COLORS.accent} />}
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
                    backgroundColor: COLORS.accent, borderRadius: 14,
                    paddingVertical: 14, alignItems: "center", marginTop: 12,
                  }}
                >
                  <Text style={{ color: "#000", fontWeight: "700", fontSize: 15 }}>
                    {selectedTee ? `Select ${selectedTee.name} Tees` : `Use ${selectedCourse.name}`}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => { setSelectedCourse(null); setSelectedTee(null); }}
                  style={{ alignItems: "center", paddingVertical: 12, marginTop: 4 }}
                >
                  <Text style={{ color: COLORS.textDim, fontSize: 14 }}>Back to Search</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
