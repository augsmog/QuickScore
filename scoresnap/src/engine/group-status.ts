export type StartType = "shotgun" | "tee_times";
export type StartSlot = { hole: number; wave?: "A" | "B" };

export type GroupStatus =
  | { kind: "not_started" }
  | { kind: "thru"; n: number }
  | { kind: "final" }
  | { kind: "stale"; minutes: number };

/** Return the course-hole sequence beginning at a shotgun start hole. */
export function holesPlayedOrder(startHole: number, holes = 18): number[] {
  if (!Number.isInteger(holes) || holes < 1 || holes > 18) throw new RangeError("holes must be an integer from 1 to 18");
  validateHole(startHole, holes);
  return Array.from({ length: holes }, (_, i) => ((startHole - 1 + i) % holes) + 1);
}

/** Derive group progress from holes with scores and the most recent score time. */
export function groupStatus({
  scoredHoles,
  startType = "shotgun",
  startSlot,
  lastScoreAt,
  now,
  staleMinutes = 20,
  holes = 18,
}: {
  scoredHoles: number[];
  startType?: StartType;
  startSlot: StartSlot;
  lastScoreAt: Date | string | number | null;
  now: Date | string | number;
  staleMinutes?: number;
  holes?: number;
}): GroupStatus {
  if (!Number.isInteger(holes) || holes < 1 || holes > 18) throw new RangeError("holes must be an integer from 1 to 18");
  validateHole(startSlot.hole, holes);
  if (startSlot.wave !== undefined && startSlot.wave !== "A" && startSlot.wave !== "B") throw new RangeError("wave must be A or B");
  if (!Number.isFinite(staleMinutes) || staleMinutes < 0) throw new RangeError("staleMinutes must be non-negative");
  const order = holesPlayedOrder(startType === "tee_times" ? 1 : startSlot.hole, holes);
  const scored = new Set(scoredHoles);
  for (const hole of scored) validateHole(hole, holes);
  let played = 0;
  while (played < order.length && scored.has(order[played])) played++;
  if (played === 0) return { kind: "not_started" };
  if (played === holes) return { kind: "final" };

  if (lastScoreAt !== null) {
    const last = toMillis(lastScoreAt);
    const current = toMillis(now);
    if (!Number.isFinite(last) || !Number.isFinite(current)) throw new RangeError("lastScoreAt and now must be valid timestamps");
    const minutes = Math.max(0, Math.floor((current - last) / 60_000));
    if (minutes >= staleMinutes) return { kind: "stale", minutes };
  }
  return { kind: "thru", n: played };
}

function validateHole(hole: number, max = 18): void {
  if (!Number.isInteger(hole) || hole < 1 || hole > max) throw new RangeError(`hole must be an integer from 1 to ${max}`);
}

function toMillis(value: Date | string | number): number {
  return value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
}
