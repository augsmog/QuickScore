import { COURSE_SEARCH_ENABLED } from "../config/features";
import { supabase } from "../db/supabase";
import { mapCourse, mapSearch } from "../../supabase/functions/course-data/logic";
export type CourseDetail = ReturnType<typeof mapCourse>;
export type CourseSearchResult = ReturnType<typeof mapSearch>;
export type TeeBox = CourseDetail["teeBoxes"][number];
export type TeeBoxHole = TeeBox["holes"][number];
export let courseSearchResting = false;
async function request(params: string) {
  courseSearchResting = false;
  try {
    const { data, error } = await supabase.functions.invoke(`course-data?${params}`, { method: "GET" });
    if (error) {
      const body = await error.context?.json?.().catch(() => null);
      courseSearchResting = body?.error === "quota_exhausted";
      return null;
    }
    courseSearchResting = !!data?.quota_exhausted;
    return data;
  } catch { return null; }
}
export async function searchCourses(query: string): Promise<CourseSearchResult[]> {
  if (!COURSE_SEARCH_ENABLED || query.trim().length < 2) return [];
  const data = await request(`q=${encodeURIComponent(query)}`);
  return (data?.courses ?? []).map(mapSearch);
}
export async function getCourseDetail(slug: string): Promise<CourseDetail | null> {
  if (!COURSE_SEARCH_ENABLED) return null;
  const data = await request(`slug=${encodeURIComponent(slug)}`);
  return data?.course ? mapCourse(data.course) : null;
}
export function teeBoxToCourse(name: string, tee: TeeBox) {
  if (![9, 18].includes(tee.holes.length) || tee.holes.some((h, i) =>
    h.number !== i + 1 || h.par == null || h.par < 3 || h.par > 6 ||
    h.handicap == null || !Number.isInteger(h.handicap) || h.handicap < 1 || h.handicap > tee.holes.length ||
    h.yards == null || h.yards <= 0
  ) || new Set(tee.holes.map(h => h.handicap)).size !== tee.holes.length) return null;
  return { name: `${name} (${tee.name})`, holes: tee.holes.map(h => ({ num: h.number!, par: h.par!, hcp: h.handicap!, yards: h.yards! })) };
}
