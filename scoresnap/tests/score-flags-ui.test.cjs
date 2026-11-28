// The app's list of score changes waiting: who gets buttons, what a decision does, and what a dropped signal must not do.
const React = require('react');
const { create, act } = require('react-test-renderer');
const { create: createStore } = require('zustand');
const loader = require('./helpers/load-ts.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { jest.spyOn(console, 'error').mockImplementation((...args) => { if (!String(args[0]).startsWith('react-test-renderer is deprecated')) throw Error(args.join(' ')); }); });
afterEach(() => jest.restoreAllMocks());

const flag = (over = {}) => ({ id: 'f1', round_id: 'sr1', group_id: 'sg1', player_id: 'sp1', player_name: 'Matt', hole: 4, current_strokes: 4, proposed_strokes: 6, mine: false, can_resolve: true, created_at: '', ...over });

async function mount({ list = [flag()], protocol = 1, online = true, failResolve = false } = {}) {
  const server = { list, calls: [] };
  const rpc = jest.fn(async (name, args) => {
    server.calls.push([name, args]);
    if (name === 'list_score_flags') return server.list === 'down' ? { data: null, error: { message: 'fetch failed' } } : { data: server.list, error: null };
    if (name === 'resolve_score_flag') { if (failResolve) return { data: null, error: { code: '42501', message: 'FORBIDDEN' } }; server.list = []; return { data: { status: 'accepted' }, error: null }; }
    return { data: null, error: null };
  });
  const client = { discover: jest.fn(async () => {}) };
  const useOnlineStore = createStore(() => ({ events: { c1: { membership: { role: 'player' }, snapshot: { protocol, revision: 1, id_map: [{ kind: 'player', local_id: 'lp1', server_id: 'sp1' }] } } } }));
  const modules = {
    '../db/supabase': { supabase: { rpc } },
    '../services/cross-device': { onlineEnabled: online, client },
    '../stores/online-store': { useOnlineStore },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: s => s } },
    './theme': { COLORS: {}, FONTS: {} },
  };
  const load = loader(modules);
  const { useFlagStore } = load('src/stores/flag-store.ts');
  modules['../stores/flag-store'] = { useFlagStore };
  const { ScoreFlags } = load('src/ui/ScoreFlags.tsx');
  let root;
  await act(async () => { root = create(React.createElement(ScoreFlags, { contest: { id: 'c1' } })); });
  const text = () => JSON.stringify(root.toJSON());
  const press = async id => { await act(async () => { await root.root.findByProps({ testID: id }).props.onPress(); }); };
  const bump = async () => { await act(async () => { useOnlineStore.setState(s => ({ events: { c1: { ...s.events.c1, snapshot: { ...s.events.c1.snapshot, revision: s.events.c1.snapshot.revision + 1 } } } })); }); };
  return { root, text, press, bump, rpc, client, server, useFlagStore };
}

test('the group scorekeeper sees the change, which score counts, and two buttons', async () => {
  const h = await mount();
  expect(h.text()).toContain('1 score change waiting');
  expect(h.text()).toContain('Matt, hole 4: 4 was entered, 6 was asked for. 4 counts until you decide.');
  expect(h.root.root.findByProps({ testID: 'score-flag-accept-Matt-4' }).props.accessibilityLabel).toBe('Use 6 for Matt on hole 4');
  expect(h.root.root.findByProps({ testID: 'score-flag-deny-Matt-4' }).props.accessibilityLabel).toBe('Keep 4 for Matt on hole 4');
  // The badge store holds this phone's player id, not the server's.
  expect(h.useFlagStore.getState().flags.c1[0].player_id).toBe('lp1');
});

test('Use: the server is told to accept, the card is refreshed, and the flag goes', async () => {
  const h = await mount();
  await h.press('score-flag-accept-Matt-4');
  expect(h.server.calls).toContainEqual(['resolve_score_flag', { flag_id: 'f1', accept: true }]);
  expect(h.client.discover).toHaveBeenCalledTimes(1);
  expect(h.text()).not.toContain('Matt, hole 4');
  expect(h.text()).toContain('Score changed.');
  expect(h.useFlagStore.getState().flags.c1).toEqual([]);
});

test('Keep: the server is told to deny and the flag goes', async () => {
  const h = await mount();
  await h.press('score-flag-deny-Matt-4');
  expect(h.server.calls).toContainEqual(['resolve_score_flag', { flag_id: 'f1', accept: false }]);
  expect(h.text()).toContain('Score kept.');
});

test('the person who asked, and anyone else, see it waiting with no buttons', async () => {
  const h = await mount({ list: [flag({ can_resolve: false, mine: true }), flag({ id: 'f2', can_resolve: false, player_name: 'Dave', hole: 7 })] });
  expect(h.text()).toContain('2 score changes waiting');
  expect(h.text()).toContain('you asked to change 4 to 6');
  expect(h.text()).toContain('Dave, hole 7: a change from 4 to 6 is waiting');
  expect(h.root.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
});

test('a refused decision says why and the flag stays', async () => {
  const h = await mount({ failResolve: true });
  await h.press('score-flag-accept-Matt-4');
  expect(h.text()).toContain('You can no longer decide this change. Ask the organizer.');
  expect(h.text()).toContain('Matt, hole 4');
  expect(h.client.discover).not.toHaveBeenCalled();
});

test('a dropped signal keeps the flag on screen', async () => {
  const h = await mount();
  h.server.list = 'down';
  await h.bump();
  expect(h.text()).toContain('Matt, hole 4');
});

test('nothing is shown, and the server is not asked, for a round that is not shared', async () => {
  for (const options of [{ online: false }, { protocol: 0 }]) {
    const h = await mount(options);
    expect(h.root.toJSON()).toBeNull();
    expect(h.rpc).not.toHaveBeenCalled();
  }
  expect((await mount({ list: [] })).root.toJSON()).toBeNull();
});

test('while a decision is being saved the buttons give way to "Saving…", so it cannot be sent twice', async () => {
  const h = await mount();
  let release; const held = new Promise(r => { release = r; });
  h.rpc.mockImplementationOnce(async () => { await held; return { data: { status: 'accepted' }, error: null }; });
  let pressed;
  await act(async () => { pressed = h.root.root.findByProps({ testID: 'score-flag-accept-Matt-4' }).props.onPress(); await Promise.resolve(); });
  expect(h.text()).toContain('Saving…');
  expect(h.root.root.findAllByProps({ accessibilityRole: 'button' })).toHaveLength(0);
  await act(async () => { release(); await pressed; });
});
