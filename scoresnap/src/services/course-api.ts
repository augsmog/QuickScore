/**
 * Golf Course API service — searches ~30,000 courses worldwide.
 * Free tier: 300 requests/day (golfcourseapi.com)
 *
 * Future: GHIN integration for automatic handicap posting.
 */

const API_BASE = "https://api.golfcourseapi.com/v1";

// API key is set via env var — register free at golfcourseapi.com
const getApiKey = () =>
  process.env.EXPO_PUBLIC_GOLF_COURSE_API_KEY || "";

export interface TeeBox {
  name: string;        // e.g. "Blue", "White", "Red"
  color: string;       // hex color or name
  courseRating: number; // e.g. 72.1
  slopeRating: number; // e.g. 131
  totalYards: number;
  totalMeters: number;
  holes: TeeBoxHole[];
}

export interface TeeBoxHole {
  number: number;
  par: number;
  yards: number;
  meters: number;
  handicap: number; // hole handicap index (1 = hardest)
}

export interface CourseSearchResult {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  holes: number; // 9 or 18
}

export interface CourseDetail {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  address: string;
  phone: string;
  website: string;
  holes: number;
  teeBoxes: TeeBox[];
}

/**
 * Search for courses by name.
 */
export async function searchCourses(query: string): Promise<CourseSearchResult[]> {
  const apiKey = getApiKey();
  if (!apiKey || !query.trim()) return [];

  try {
    const res = await fetch(
      `${API_BASE}/courses?search=${encodeURIComponent(query)}`,
      {
        headers: {
          Authorization: `Key ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );
    if (!res.ok) return [];
    const data = await res.json();

    // Map API response to our interface
    return (data.courses || []).map((c: any) => ({
      id: String(c.id),
      name: c.name || c.club_name || "",
      city: c.city || "",
      state: c.state || c.province || "",
      country: c.country || "",
      holes: c.holes || 18,
    }));
  } catch (error) {
    console.error("Course search error:", error);
    return [];
  }
}

/**
 * Get full course details including tee boxes and hole data.
 */
export async function getCourseDetail(courseId: string): Promise<CourseDetail | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch(`${API_BASE}/courses/${courseId}`, {
      headers: {
        Authorization: `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) return null;
    const c = await res.json();

    // Parse tee boxes from API response
    const teeBoxes: TeeBox[] = (c.tees || c.tee_boxes || []).map((t: any) => ({
      name: t.name || t.tee_name || "Default",
      color: t.color || t.tee_color || "#ffffff",
      courseRating: t.course_rating || t.rating || 72,
      slopeRating: t.slope_rating || t.slope || 113,
      totalYards: t.total_yards || t.yards || 0,
      totalMeters: t.total_meters || t.meters || 0,
      holes: (t.holes || []).map((h: any, i: number) => ({
        number: h.number || h.hole_number || i + 1,
        par: h.par || 4,
        yards: h.yards || h.yardage || 0,
        meters: h.meters || 0,
        handicap: h.handicap || h.hcp || h.handicap_index || i + 1,
      })),
    }));

    return {
      id: String(c.id),
      name: c.name || c.club_name || "",
      city: c.city || "",
      state: c.state || c.province || "",
      country: c.country || "",
      address: c.address || "",
      phone: c.phone || "",
      website: c.website || "",
      holes: c.holes || 18,
      teeBoxes,
    };
  } catch (error) {
    console.error("Course detail error:", error);
    return null;
  }
}

/**
 * Convert a TeeBox into our Course format for the scoring engine.
 */
export function teeBoxToCourse(
  courseName: string,
  teeBox: TeeBox
): { name: string; holes: { num: number; par: number; hcp: number; yards: number }[] } {
  return {
    name: `${courseName} (${teeBox.name})`,
    holes: teeBox.holes.map((h) => ({
      num: h.number,
      par: h.par,
      hcp: h.handicap,
      yards: h.yards,
    })),
  };
}
