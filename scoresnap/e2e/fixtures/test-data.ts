export const TEST_COURSE = {
  name: "Playwright Test Course",
  holes: Array.from({ length: 18 }, (_, i) => ({
    num: i + 1,
    par: [4, 5, 4, 3, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 4][i],
    hcp: i + 1,
    yards: 400,
  })),
};

export const TEST_PLAYERS = [
  {
    name: "Alice",
    handicap: 10,
    scores: [5, 6, 4, 3, 5, 4, 4, 6, 5, 4, 5, 3, 6, 5, 5, 3, 4, 5],
  },
  {
    name: "Bob",
    handicap: 18,
    scores: [6, 7, 5, 4, 5, 4, 5, 7, 5, 5, 6, 4, 6, 5, 6, 4, 5, 5],
  },
  {
    name: "Charlie",
    handicap: -2,
    scores: [4, 4, 4, 3, 4, 3, 3, 5, 4, 4, 4, 3, 4, 4, 4, 3, 4, 4],
  },
];
