// A finalized shared round in the app: final at once, Reopen for an hour on the server's clock, locked after.
const React = require('react');
const { create, act } = require('react-test-renderer');
const { create: createStore } = require('zustand');
const loader = require('./helpers/load-ts.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-11-28T12:00:00Z')); jest.spyOn(console, 'error').mockImplementation((...args) => { if (!String(args[0]).startsWith('react-test-renderer is deprecated')) throw Error(args.join(' ')); }); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

const snapshot = { contest_id: 'c1', protocol: 1, revision: 1, id_map: [], rounds: [{ id: 'r1', number: 1, players: [{ id: 'p1', cells: [{ hole: 3, version: 2, strokes: 5 }] }] }] };

// minutesAgo: how long ago, on the server's clock, the organizer finalized. null: the server has no read for it.
async function mount({ minutesAgo = 10, role = 'player', completed = true, online = true, serverAhead = 0, reopenFails = null, write = { status: 'accepted' } } = {}) {
  const calls = [];
  const serverNow = () => Date.now() + serverAhead;
  const finalized = minutesAgo === null ? null : new Date(serverNow() - minutesAgo * 60000).toISOString();
  const rpc = jest.fn(async (name, args) => {
    calls.push([name, args]);
    if (name === 'finalize_window') return finalized === null ? { data: null, error: { code: 'PGRST202', message: 'not found' } } : { data: { finalized_at: finalized, now: new Date(serverNow()).toISOString(), reopened_until: null }, error: null };
    if (name === 'reopen_card') return reopenFails ? { data: null, error: reopenFails } : { data: { status: 'reopened', until: new Date(Date.parse(finalized ?? new Date(serverNow()).toISOString()) + 3600000).toISOString() }, error: null };
    if (name === 'write_score') return write.error ? { data: null, error: write.error } : { data: { version: 3, strokes: args.strokes, ...write }, error: null };
    return { data: null, error: null };
  });
  const client = { discover: jest.fn(async () => {}) };
  const load = loader({
    '../db/supabase': { supabase: { rpc } },
    '../services/cross-device': { onlineEnabled: online, client },
    '../stores/online-store': { useOnlineStore: createStore(() => ({ events: { c1: { membership: { role }, snapshot } } })) },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: s => s } },
    './theme': { COLORS: {}, FONTS: {} },
    'expo-crypto': { randomUUID: () => 'op-1' },
  });
  const { useReopen, ReopenBanner } = load('src/ui/ReopenBanner.tsx');
  let api;
  const Screen = () => { api = useReopen('c1', completed); return React.createElement(ReopenBanner, { reopen: api }); };
  let root;
  await act(async () => { root = create(React.createElement(Screen)); });
  return { root, calls, client, text: () => JSON.stringify(root.toJSON()), get api() { return api; },
    press: () => act(async () => { await root.root.findByProps({ testID: 'reopen-button' }).props.onPress(); }),
    wait: minutes => act(async () => { jest.advanceTimersByTime(minutes * 60000); }) };
}

test('just finalized: it reads as final, with Reopen and the minutes left', async () => {
  const h = await mount({ minutesAgo: 10 });
  expect(h.api.state).toBe('final');
  expect(h.text()).toContain('Round final. You can reopen your card to fix a mistake. 50 min left.');
  expect(h.root.root.findAllByProps({ testID: 'reopen-button' }).length).toBeGreaterThan(0);
});

test('59 minutes: Reopen is still there. 61 minutes: locked, no button', async () => {
  expect((await mount({ minutesAgo: 59 })).api.state).toBe('final');
  const late = await mount({ minutesAgo: 61 });
  expect(late.api.state).toBe('locked');
  expect(late.text()).toContain('Round final. Scores are locked.');
  expect(late.root.root.findAllByProps({ testID: 'reopen-button' })).toHaveLength(0);
});

test('the clock is the server\'s: a phone 30 minutes slow still locks on time', async () => {
  // Finalized 61 server-minutes ago; by the phone's own clock that would look like 31.
  const h = await mount({ minutesAgo: 61, serverAhead: 30 * 60000 });
  expect(h.api.state).toBe('locked');
});

test('the screen locks by itself when the hour runs out', async () => {
  const h = await mount({ minutesAgo: 58 });
  expect(h.api.state).toBe('final');
  await h.wait(3);
  expect(h.api.state).toBe('locked');
});

test('Reopen, then a fix goes straight to the server with the cell\'s version, and the card is refreshed', async () => {
  const h = await mount({ minutesAgo: 10 });
  await h.press();
  expect(h.api.state).toBe('reopened');
  expect(h.text()).toContain('Reopened to fix a score. 50 min left.');
  await act(async () => { await h.api.fix(1, 'p1', 3, 4); });
  expect(h.calls).toContainEqual(['write_score', { contest_id: 'c1', round_id: 'r1', player_id: 'p1', hole: 3, action: 'set', strokes: 4, expected_version: 2, op_id: 'op-1', request_hash: 'web-fix:op-1' }]);
  expect(h.client.discover).toHaveBeenCalledTimes(1);
  expect(h.text()).toContain('Hole 3 fixed.');
});

test('a fix on someone else\'s score is held for the group scorekeeper, and says so', async () => {
  const h = await mount({ write: { status: 'conflict', flagged: true } });
  await h.press();
  await act(async () => { await h.api.fix(1, 'p1', 3, 4); });
  expect(h.text()).toContain('Hole 3: sent to the group scorekeeper to decide. The first score counts until then.');
});

test('no fix is sent before Reopen is tapped, or after the hour', async () => {
  const h = await mount({ minutesAgo: 10 });
  await act(async () => { await h.api.fix(1, 'p1', 3, 4); });
  await h.press();
  await h.wait(51);
  await act(async () => { await h.api.fix(1, 'p1', 3, 4); });
  expect(h.calls.filter(c => c[0] === 'write_score')).toHaveLength(0);
  expect(h.api.state).toBe('locked');
});

test('a fix with no signal says it was not saved', async () => {
  const h = await mount({ write: { error: { message: 'fetch failed' } } });
  await h.press();
  await act(async () => { await h.api.fix(1, 'p1', 3, 4); });
  expect(h.text()).toContain('Not saved. Could not reach the round. Check your connection and try again.');
  expect(h.api.state).toBe('reopened');
});

test('server without the finalize-time read: Reopen is offered and the server\'s refusal locks the screen', async () => {
  const h = await mount({ minutesAgo: null, reopenFails: { code: '55000', message: 'REOPEN_CLOSED' } });
  expect(h.api.state).toBe('final');
  expect(h.text()).toContain('Round final. You can reopen your card to fix a mistake.');
  await h.press();
  expect(h.api.state).toBe('locked');
});

test('no reopen for a watcher, an unfinished round, or a round that is not shared', async () => {
  for (const options of [{ role: 'viewer' }, { completed: false }, { online: false }]) {
    const h = await mount(options);
    expect(h.api.state).toBeNull();
    expect(h.root.toJSON()).toBeNull();
    expect(h.calls).toHaveLength(0);
  }
});
