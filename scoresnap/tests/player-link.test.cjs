// A web guest with a player link keeps one group's card, and sees the board and the money.
const loader = require('./helpers/load-ts.cjs');
const { validPlayerToken, playerLinkApi, playerLinkMessage, memberLabel, webOrigin, linkUrl, groupCard, nextHole, leaderboard, money, formatDollars } = loader({})('src/services/player-link.ts');

const id = '11111111-1111-4111-8111-111111111111';
const capabilities = { api_version: 1, contract: 'snapscore-sync-v1', protocol: 1, enabled: true, revision: 1, channel: { private: true, event: 'revision', topic: `snapscore:${id}` } };
const course = { name: 'Course', holes: Array.from({ length: 18 }, (_, i) => ({ num: i + 1, par: 4, hcp: i + 1, yards: 400 })) };
const player = (pid, name, group, scores) => ({ id: pid, displayName: name, handicap: 0, status: 'active', team: null, group_id: group,
  cells: Array.from({ length: 18 }, (_, i) => ({ hole: i + 1, version: scores[i] ? 1 : 0, strokes: scores[i] ?? null })) });
const snapshot = (scores = {}, extra = {}) => ({ contest_id: id, name: 'Saturday foursome', capabilities, course, protocol: 1, revision: 1, completed: false,
  games: ['skins'], game_settings: { betUnit: 5, hasTeams: false }, id_map: [],
  rounds: [{ id: 'r1', number: 1, name: 'Round 1', course, assignment_revision: 0,
    groups: [{ id: 'gA', name: 'Group A', sort_order: 1 }, { id: 'gB', name: 'Group B', sort_order: 2 }],
    players: [player('p1', 'Matt', 'gA', scores.p1 ?? []), player('p2', 'Augie', 'gA', scores.p2 ?? []), player('p3', 'Chris', 'gB', scores.p3 ?? []), player('p4', 'Dave', 'gB', scores.p4 ?? [])] }], ...extra });

test('a token is exactly 64 lowercase hex characters, and a bad one never reaches the server', async () => {
  expect(validPlayerToken('a'.repeat(64))).toBe(true);
  for (const bad of ['', 'A'.repeat(64), 'a'.repeat(63), 'a'.repeat(65), null, 12]) expect(validPlayerToken(bad)).toBe(false);
  const rpc = jest.fn();
  await expect(playerLinkApi(rpc).roster('nope')).rejects.toThrow('no longer active');
  await expect(playerLinkApi(rpc).join('nope', 'p1')).rejects.toThrow('no longer active');
  expect(rpc).not.toHaveBeenCalled();
});

test('server refusals become plain messages; unknown failures ask to try again', async () => {
  expect(playerLinkMessage({ code: '22023', message: 'INVALID_LINK' })).toBe('This link is no longer active. Ask the organizer for a new one.');
  expect(playerLinkMessage({ code: '55000', message: 'SYNC_PAUSED' })).toMatch('finished or paused');
  expect(playerLinkMessage({ code: '42501', message: 'FORBIDDEN' })).toMatch('removed web access');
  expect(playerLinkMessage({ message: 'fetch failed' })).toMatch('Check your connection');
  const api = playerLinkApi(async () => ({ data: null, error: { code: '22023', message: 'INVALID_LINK' } }));
  await expect(api.join('a'.repeat(64), 'p1')).rejects.toMatchObject({ code: '22023' });
  const ok = playerLinkApi(async (name, args) => ({ data: { name, args }, error: null }));
  expect(await ok.join('a'.repeat(64), 'p1')).toEqual({ name: 'join_player_link', args: { p_token: 'a'.repeat(64), p_player_id: 'p1' } });
});

test('the card is the chosen player\'s whole group, and only that group', () => {
  const card = groupCard(snapshot(), 'p2');
  expect(card.groupName).toBe('Group A');
  expect(card.players.map(p => p.displayName)).toEqual(['Matt', 'Augie']);
  expect(groupCard(snapshot(), 'p4').players.map(p => p.displayName)).toEqual(['Chris', 'Dave']);
  expect(groupCard(snapshot(), 'nobody')).toBeNull();
});

test('the card opens on the first hole the group has not finished', () => {
  expect(nextHole(groupCard(snapshot(), 'p1'))).toBe(1);
  expect(nextHole(groupCard(snapshot({ p1: [4, 4], p2: [5] }), 'p1'))).toBe(2);
  const full = Array(18).fill(4);
  expect(nextHole(groupCard(snapshot({ p1: full, p2: full }), 'p1'))).toBe(18);
});

test('leaderboard: best to par first, thru counts scored holes, unscored players last', () => {
  const rows = leaderboard(snapshot({ p1: [3, 4], p2: [5], p4: [4, 4, 4] }));
  expect(rows.map(r => [r.name, r.toPar, r.thru])).toEqual([['Matt', -1, 2], ['Dave', 0, 3], ['Augie', 1, 1], ['Chris', 0, 0]]);
});

test('money: standings sum to zero and each pair of players appears once, owing in one direction', () => {
  const result = money(snapshot({ p1: [3], p2: [4], p3: [4], p4: [5] }));
  expect(result.pending).toBe(false);
  expect(result.net.map(n => n.name).sort()).toEqual(['Augie', 'Chris', 'Dave', 'Matt']);
  expect(Math.round(result.net.reduce((sum, n) => sum + n.amount, 0) * 100)).toBe(0);
  expect(result.net[0]).toMatchObject({ name: 'Matt' });
  expect(result.net[0].amount).toBeGreaterThan(0);
  const pairs = result.payments.map(p => [p.from, p.to].sort().join('|'));
  expect(new Set(pairs).size).toBe(pairs.length);
  for (const p of result.payments) { expect(p.to).toBe('Matt'); expect(p.amount).toBeGreaterThan(0); }
  // What each player pays or receives in the payment list equals their standing.
  for (const n of result.net) {
    const flow = result.payments.reduce((sum, p) => sum + (p.to === n.name ? p.amount : 0) - (p.from === n.name ? p.amount : 0), 0);
    expect(Math.round(flow * 100)).toBe(Math.round(n.amount * 100));
  }
});

test('money: a round with no games shows no money, and dollars read plainly', () => {
  expect(money(snapshot({}, { games: [] }))).toEqual({ pending: false, net: [], payments: [] });
  expect([formatDollars(5), formatDollars(-12.5), formatDollars(0)]).toEqual(['$5.00', '−$12.50', '$0.00']);
});

test('spectator board needs a well-formed token; the organizer list names a web scorer by the card they keep', async () => {
  const rpc = jest.fn(async (name, args) => ({ data: { name, args }, error: null }));
  await expect(playerLinkApi(rpc).board('short')).rejects.toThrow('no longer active');
  expect(rpc).not.toHaveBeenCalled();
  expect(await playerLinkApi(rpc).board('b'.repeat(64))).toEqual({ name: 'spectator_board', args: { p_token: 'b'.repeat(64) } });
  expect(await playerLinkApi(rpc).assign('c1', 'u1', 'p1')).toEqual({ name: 'assign_player_link_member', args: { p_contest_id: 'c1', p_member_id: 'u1', p_player_id: 'p1' } });
  expect(await playerLinkApi(rpc).remove('c1', 'u1')).toEqual({ name: 'revoke_membership', args: { contest_id: 'c1', member_id: 'u1' } });
  expect(memberLabel({ member_id: 'u1', player_id: 'p1', player_name: 'Matt', joined_at: '', groups: [{ round_id: 'r1', group_id: 'gA', name: 'Group A' }] })).toBe('Web scorer on Group A (picked Matt)');
  expect(playerLinkMessage({ code: '42501', message: 'HOST_REQUIRED' })).toBe('Only the organizer can do that.');
});

test('links point at the public site by default, and the two kinds use different paths', () => {
  expect(webOrigin(undefined, undefined)).toBe('https://snapscore.autumn8.me');
  expect(webOrigin('https://staging.example/', undefined)).toBe('https://staging.example');
  expect(webOrigin('not a url', {})).toBe('https://snapscore.autumn8.me');
  expect(webOrigin('https://configured.example', { origin: 'https://opened.example' })).toBe('https://opened.example');
  expect(linkUrl('https://snapscore.autumn8.me/', 'player', 'a'.repeat(64))).toBe(`https://snapscore.autumn8.me/p/${'a'.repeat(64)}`);
  expect(linkUrl('https://snapscore.autumn8.me', 'spectator', 'b'.repeat(64))).toBe(`https://snapscore.autumn8.me/r/${'b'.repeat(64)}`);
});
