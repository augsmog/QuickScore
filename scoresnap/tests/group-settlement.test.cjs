"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const group_settlement_1 = require("../src/engine/group-settlement");
const contest_results_1 = require("../src/engine/contest-results");
function fixture(games = ['nassau', 'skins']) {
    return { id: 'c', name: 'Groups', status: 'active', createdAt: '2026-11-12', betUnit: 1.23, hasTeams: false, games,
        course: { name: 'Course', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 350 })) },
        groups: [0, 1].map(g => ({ id: `g${g}`, name: `Group ${g}`, players: [0, 1, 2, 3].map(p => ({
                id: `${g}-${p}`, name: `${g}-${p}`, handicap: 0, team: p % 2 === 0 ? 'Red' : 'Blue', scores: Array.from({ length: 18 }, (_, h) => 3 + (p + h % 3) % 4),
            })) })), gameConfig: { rulesVersion: 1, inputRulesVersion: 1, skinsScope: 'group', nassauWeights: [1, 1, 1] } };
}
function net(summaries) {
    const amounts = {};
    for (const s of summaries)
        for (const t of s.transactions) {
            amounts[t.from] = (amounts[t.from] ?? 0) - t.amount;
            amounts[t.to] = (amounts[t.to] ?? 0) + t.amount;
        }
    return Object.fromEntries(Object.entries(amounts).map(([n, v]) => [n, Math.round(v * 100) / 100]));
}
function check(contest, games, bet) {
    const result = (0, group_settlement_1.calculateGroupSettlements)(contest, games, bet);
    expect(result.allGroups.netByPlayer).toEqual((0, contest_results_1.calculateContestSettlement)(contest, games, bet).netByPlayer);
    if (!result.allGroups.pending && result.allGroups.transactions.length) {
        const rolled = net([...result.groups.map(g => g.summary), ...(result.field ? [result.field] : [])]);
        for (const [name, value] of Object.entries(result.allGroups.netByPlayer))
            expect(rolled[name] ?? 0).toBe(value);
    }
    return result;
}
test('Nassau and group skins stay inside each four-player group', () => {
    const contest = fixture(), result = check(contest);
    expect(result.field).toBeUndefined();
    expect(result.groups.map(g => g.groupId)).toEqual(['g0', 'g1']);
    for (const { groupId, summary } of result.groups) {
        const names = contest.groups.find(g => g.id === groupId).players.map(p => p.name);
        expect(Object.keys(summary.netByPlayer).sort()).toEqual([...names].sort());
        expect(summary.transactions.length).toBeGreaterThan(0);
        for (const t of summary.transactions) {
            expect(names).toContain(t.from);
            expect(names).toContain(t.to);
        }
    }
});
test('mixed field skins and Stableford only enter field; Nassau stays in group', () => {
    const contest = fixture(['nassau', 'skins', 'stableford']);
    contest.gameConfig.skinsScope = 'field';
    const result = check(contest);
    expect(result.field).toEqual((0, contest_results_1.calculateContestSettlement)(contest, ['skins', 'stableford']));
    for (const { summary } of result.groups)
        expect(summary.transactions.every(t => t.gameType === 'nassau')).toBe(true);
});
test('16-player three-round tournament uses own courses and regrouped/absent players', () => {
    const contest = fixture(['nassau', 'skins', 'stableford']);
    contest.groups.push(...contest.groups.map(g => ({ ...g, id: `extra-${g.id}`, players: g.players.map(p => ({ ...p, id: `extra-${p.id}`, name: `extra-${p.name}` })) })));
    contest.gameConfig.skinsScope = 'field';
    contest.isTournament = true;
    contest.rounds = [1, 2, 3].map(number => ({ id: `r${number}`, number,
        course: { ...contest.course, holes: contest.course.holes.map(h => ({ ...h, par: number === 2 ? 5 : 4 })) },
        groups: contest.groups.map((g, i) => ({ ...g, id: `r${number}-${g.id}`,
            players: g.players.filter((_, p) => number !== 3 || i !== 3 || p < 2).map(p => ({ ...p, scores: p.scores.map((s, h) => s + (number + h) % 2) })) })),
    }));
    const result = check(contest);
    expect(result.groups).toHaveLength(12);
    for (const round of contest.rounds)
        for (const group of round.groups) {
            const summary = result.groups.find(g => g.groupId === group.id).summary;
            expect(summary.transactions.length).toBeGreaterThan(0);
            for (const t of summary.transactions) {
                expect(group.players.map(p => p.name)).toContain(t.from);
                expect(group.players.map(p => p.name)).toContain(t.to);
            }
        }
});
test('pending group retains pending without erasing ready group; aggregate stays pending', () => {
    const contest = fixture();
    contest.groups[0].players[0].scores[0] = 0;
    const result = check(contest);
    expect(result.groups[0].summary.pending).toBe(true);
    expect(result.groups[0].summary.transactions).toEqual([]);
    expect(result.groups[1].summary.pending).toBeFalsy();
    expect(result.groups[1].summary.transactions.length).toBeGreaterThan(0);
    expect(result.allGroups).toEqual((0, contest_results_1.calculateContestSettlement)(contest));
});
test('legacy is a single group-less summary identical to existing calculation', () => {
    const contest = fixture(['stroke_play']);
    delete contest.gameConfig;
    const result = (0, group_settlement_1.calculateGroupSettlements)(contest);
    expect(result.groups).toEqual([]);
    expect(result.field).toBeUndefined();
    expect(result.allGroups).toEqual((0, contest_results_1.calculateContestSettlement)(contest));
});
test('amount/game overrides, empty games, field-only, repeated group ids across rounds', () => {
    const contest = fixture();
    expect(check(contest, ['stroke_play'], 2).field).toBeDefined();
    expect(check(contest, []).allGroups.transactions).toEqual([]);
    contest.isTournament = true;
    contest.rounds = [1, 2].map(number => ({ id: `r${number}`, number, groups: contest.groups }));
    const result = check(contest, ['nassau'], 2);
    expect(result.groups).toHaveLength(2);
});

test('round/group event namespaces remain isolated and pending flags do not leak', () => {
    const contest = fixture(['bingo_bango_bongo']);
    contest.gameConfig.bbbAmountPerOpponent = true;
    contest.isTournament = true;
    contest.rounds = [1, 2].map(number => ({id:`r${number}`,number,groups:contest.groups}));
    contest.auxiliaryByScope = {};
    for (const round of contest.rounds) for (const group of round.groups) {
        contest.auxiliaryByScope[`${round.id}/${group.id}`] = {bbb:Object.fromEntries(
            contest.course.holes.map(h => [h.num,{bingo:group.players[round.number-1].id,bango:null,bongo:null}]))};
    }
    const result = check(contest);
    for (const {groupId,summary} of result.groups) {
        const names=contest.groups.find(g=>g.id===groupId).players.map(p=>p.name);
        expect(summary.transactions.length).toBeGreaterThan(0);
        for (const t of summary.transactions) {expect(names).toContain(t.from);expect(names).toContain(t.to);}
    }
    delete contest.auxiliaryByScope['r2/g0'].bbb[9];
    const pending=check(contest);
    expect(pending.groups[0].summary.pending).toBe(true);
    expect(pending.groups[1].summary.pending).toBeFalsy();
});
