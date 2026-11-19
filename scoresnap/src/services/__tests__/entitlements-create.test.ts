import { canCreateContest } from "../entitlements";

const rounds = (n: number) => Array.from({ length: n }, () => ({ groups: [{ players: [{}] }] }));

describe("AUG-1368 canCreateContest (wizard gate)", () => {
  it("blocks free-tier multi-day tournament (would throw in validateHostContest)", () => {
    expect(canCreateContest({ games: ["stroke_play"], groups: [{ players: [{}] }], rounds: rounds(2) }, "free")).toBe(false);
  });
  it("blocks pro-tier multi-day tournament", () => {
    expect(canCreateContest({ games: ["stroke_play"], groups: [{ players: [{}] }], rounds: rounds(3) }, "pro")).toBe(false);
  });
  it("allows TD tier multi-day tournament", () => {
    expect(canCreateContest({ games: ["stroke_play"], groups: [{ players: [{}] }], rounds: rounds(4) }, "td")).toBe(true);
  });
  it("allows free single-round single-group stroke play", () => {
    expect(canCreateContest({ games: ["stroke_play"], groups: [{ players: [{}] }] }, "free")).toBe(true);
  });
});
