import { validateCutRule, validateHostContest } from '../contest-validation';
import { contestCutAfterRound } from '../contest-cut';
import type { CutRule } from '../cut-line';
import type { Contest } from '../../stores/contest-store';

declare const describe: any, it: any, expect: any;
const top: CutRule = { kind: 'top_n_and_ties', n: 1 };
const within: CutRule = { kind: 'within_strokes', strokes: 2.5 };
const base = (overrides: Partial<Contest> = {}): Contest => ({
  id: 'c', name: 'Tournament', status: 'active', createdAt: '', betUnit: 1,
  hasTeams: false, groups: [], games: [], isTournament: true,
  course: { name: 'Course', holes: [{ num: 1, par: 4, hcp: 1, yards: 300 }] },
  rounds: [1, 2, 3].map(number => ({
    id: `r${number}`, name: `Round ${number}`, number,
    groups: [{ id: `g${number}`, name: 'Group', players: [
      { id: 'a', name: 'A', handicap: 0, scores: [4] },
      { id: 'b', name: 'B', handicap: 0, scores: [5] },
      { id: 'c', name: 'C', handicap: 0, scores: [7] },
    ] }],
  })),
  ...overrides,
});

describe('stored cut rules', () => {
  it('leaves legacy contests unchanged and returns no_cut without configuration', () => {
    for (const contest of [base(), base({ isTournament: false, rounds: undefined })]) {
      const before = JSON.stringify(contest);
      expect(() => validateCutRule(contest)).not.toThrow();
      expect(() => validateHostContest(contest, 'td')).not.toThrow();
      expect(contestCutAfterRound(contest)).toBe('no_cut');
      expect(contestCutAfterRound(contest, undefined, { rankMode: 'gross' })).toBe('no_cut');
      expect(JSON.stringify(contest)).toBe(before);
    }
  });

  it('validates and JSON round-trips both stored rule kinds without mutation', () => {
    for (const cutRule of [top, within, { kind: 'top_n_and_ties', n: 0 } as CutRule]) {
      const restored: Contest = JSON.parse(JSON.stringify(base({ cutRule, cutAfterRound: 1 })));
      const before = JSON.stringify(restored);
      expect(restored.cutRule).toEqual(cutRule);
      expect(restored.cutAfterRound).toBe(1);
      expect(() => validateCutRule(restored)).not.toThrow();
      expect(() => validateHostContest(restored, 'td')).not.toThrow();
      expect(contestCutAfterRound(restored)).toEqual(
        contestCutAfterRound(restored, cutRule, { afterRound: 1, rankMode: 'gross' }),
      );
      expect(JSON.stringify(restored)).toBe(before);
    }
    expect(contestCutAfterRound(base({ cutRule: within, cutAfterRound: 1 })))
      .toMatchObject({ mode: 'gross', result: { made: ['a', 'b'], missed: ['c'], cutScore: 6.5 } });
  });

  it('prefers explicit rule and round independently over stored configuration', () => {
    const contest = base({ cutRule: top, cutAfterRound: 1 });
    expect(contestCutAfterRound(contest)).toMatchObject({
      standings: [{ playerId: 'a', total: 4 }, { playerId: 'b', total: 5 }, { playerId: 'c', total: 7 }],
      result: { made: ['a'], missed: ['b', 'c'] },
    });
    expect(contestCutAfterRound(contest, within)).toMatchObject({ result: { made: ['a', 'b'] } });
    expect(contestCutAfterRound(contest, undefined, { afterRound: 2 })).toMatchObject({
      standings: [{ playerId: 'a', total: 8 }, { playerId: 'b', total: 10 }, { playerId: 'c', total: 14 }],
      result: { made: ['a'] },
    });
    expect(contestCutAfterRound(contest, within, { afterRound: 2, rankMode: 'gross' }))
      .toMatchObject({ result: { made: ['a', 'b'], cutScore: 10.5 } });
    expect(() => contestCutAfterRound(contest, undefined, { afterRound: 0 })).toThrow(RangeError);
  });

  const invalid: Partial<Contest>[] = [
    { cutRule: top }, { cutAfterRound: 1 },
    { cutRule: top, cutAfterRound: 1, isTournament: false },
    { cutRule: top, cutAfterRound: 1, rounds: undefined },
    { cutRule: top, cutAfterRound: 1, rounds: [] },
    { cutRule: top, cutAfterRound: 1, rounds: base().rounds!.slice(0, 1) },
    ...[-1, NaN, Infinity, -Infinity, 1.5].map(n => ({
      cutRule: { kind: 'top_n_and_ties', n } as CutRule, cutAfterRound: 1,
    })),
    ...[-1, NaN, Infinity, -Infinity].map(strokes => ({
      cutRule: { kind: 'within_strokes', strokes } as CutRule, cutAfterRound: 1,
    })),
    ...[0, -1, 1.5, 4, NaN, Infinity, 3].map(cutAfterRound => ({ cutRule: top, cutAfterRound })),
  ];
  it.each(invalid.map((overrides, i) => [i, overrides]))('rejects invalid stored configuration %s at both boundaries', (_: number, overrides: Partial<Contest>) => {
    expect(() => validateCutRule(base(overrides))).toThrow(RangeError);
    expect(() => validateHostContest(base(overrides), 'td')).toThrow(RangeError);
  });

  it('uses actual round numbers rather than array positions', () => {
    const contest = base({ cutRule: top, cutAfterRound: 5 });
    contest.rounds = contest.rounds!.map((round, i) => ({ ...round, number: [2, 5, 9][i] })).reverse();
    expect(() => validateCutRule(contest)).not.toThrow();
    expect(contestCutAfterRound(contest)).toMatchObject({ standings: [
      { playerId: 'a', total: 8 }, { playerId: 'b', total: 10 }, { playerId: 'c', total: 14 },
    ] });
  });

  it('requires a round for an explicit rule and validates stored limits in the adapter', () => {
    expect(() => contestCutAfterRound(base(), top)).toThrow(RangeError);
    expect(() => contestCutAfterRound(base({ cutRule: { kind: 'top_n_and_ties', n: -1 }, cutAfterRound: 1 })))
      .toThrow(RangeError);
  });
});
