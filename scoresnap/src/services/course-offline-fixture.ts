import type { CourseDetail } from "./course-api";

// Synthetic local-only data for native tee scrolling; never a live course lookup.
export const offlineCourseFixture: CourseDetail = {
  id: "e2e-tee-course", name: "E2E Tee Course", city: "", state: "", country: "",
  holes: 18, latitude: null, longitude: null, url: "", address: "", phone: "", website: "",
  teeBoxes: Array.from({ length: 16 }, (_, index) => ({
    name: `Tee ${String(index + 1).padStart(2, "0")}`, color: "white",
    courseRating: 72, slopeRating: 130, totalYards: 6480, totalMeters: null,
    holes: Array.from({ length: 18 }, (_, hole) => ({
      number: hole + 1, par: 4, handicap: hole + 1, yards: 360, meters: null,
    })),
  })),
};
