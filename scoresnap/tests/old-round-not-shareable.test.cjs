// A round made before online sharing has a local-format id. The server answers
// 400 for it, which the app used to report as an outage. It must say so plainly
// and never ask the server.
const React = require('react');
const { create, act } = require('react-test-renderer');
const { create: createStore } = require('zustand');
const loader = require('./helpers/load-ts.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(() => { jest.spyOn(console, 'error').mockImplementation((...args) => { if (!String(args[0]).startsWith('react-test-renderer is deprecated')) throw Error(args.join(' ')); }); });
afterEach(() => jest.restoreAllMocks());

async function mount(id) {
  const client = { rejoinHost: jest.fn(async () => { throw Object.assign(Error('invalid input syntax for type uuid'), { code: '22P02' }); }), discover: jest.fn(async () => {}) };
  const contest = { id, remoteRestored: false, joinCode: 'ABC234' };
  const load = loader({
    '../services/cross-device': { onlineEnabled: true, client },
    '../services/online-enrollment': { enrollNewRound: jest.fn() }, '../db/supabase': {},
    '../stores/online-store': { useOnlineStore: createStore(() => ({ events: {} })) },
    '../stores/auth-store': { useAuthStore: createStore(() => ({ remoteUserId: 'owner' })) },
    '../stores/contest-store': { useContestStore: createStore(() => ({ contests: [contest], updateContest() {} })) },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'ios' }, Share: { share: jest.fn() } },
    './theme': { COLORS: {} }, './LocalJoinLimitationBanner': { LocalJoinLimitationBanner: () => null },
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true, NATIVE_LINKS_ENABLED: false },
  });
  const { ContestJoinCode } = load('src/ui/ContestJoinCode.tsx');
  let root;
  await act(async () => { root = create(React.createElement(ContestJoinCode, { contest })); });
  const text = JSON.stringify(root.toJSON());
  await act(() => root.unmount());
  return { client, text };
}

test('old-format round: plain message, no enable button, no server call', async () => {
  const h = await mount('1793314256130-d3svkci');
  expect(h.client.rejoinHost).not.toHaveBeenCalled();
  expect(h.client.discover).not.toHaveBeenCalled();
  expect(h.text).toContain('This round was made before online sharing. Start a new round to share it.');
  expect(h.text).not.toContain('Enable online sharing');
  expect(h.text).not.toContain('Could not check online sharing');
});

test('new-format round still checks the server and offers sharing', async () => {
  const h = await mount('11111111-1111-4111-8111-111111111111');
  expect(h.client.rejoinHost).toHaveBeenCalledTimes(1);
  expect(h.text).not.toContain('made before online sharing');
});

test('Online sync panel is not offered for an old-format round', () => {
  const load = loader({
    './TournamentCompletion': { TournamentCompletion: () => null },
    '../services/cross-device': { client: {}, onlineEnabled: true },
    '../stores/online-store': { useOnlineStore: createStore(() => ({ events: {} })) },
    '../stores/auth-store': { useAuthStore: createStore(() => ({ remoteUserId: 'owner', isAnonymous: false })) },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Platform: { OS: 'ios' }, Alert: {}, AppState: {} },
    './theme': { COLORS: {} },
  });
  const { OnlineSyncPanel } = load('src/ui/OnlineSyncPanel.tsx');
  let root;
  act(() => { root = create(React.createElement(OnlineSyncPanel, { contest: { id: '1793314256130-d3svkci' } })); });
  expect(root.toJSON()).toBeNull();
  act(() => root.unmount());
});

// Owner decision 16 (AUG-1601): sharing is on by default for a new round when the organizer is signed in.
async function mountNew({ isAnonymous, scores = [0, 0], status = 'active' }) {
  const id = '22222222-2222-4222-8222-222222222222';
  const client = { rejoinHost: jest.fn(async () => { throw Object.assign(Error('FORBIDDEN'), { code: '42501' }); }), discover: jest.fn(async () => {}) };
  const enroll = jest.fn(async () => 'ABC234');
  const contest = { id, remoteRestored: false, joinCode: 'ABC234', status, groups: [{ id: 'g', name: 'G', players: [{ id: 'p', name: 'P', scores }] }] };
  const load = loader({
    '../services/cross-device': { onlineEnabled: true, client },
    '../services/online-enrollment': { enrollNewRound: enroll },
    '../db/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'owner', is_anonymous: isAnonymous } } } }) } } },
    '../stores/online-store': { useOnlineStore: createStore(() => ({ events: {} })) },
    '../stores/auth-store': { useAuthStore: createStore(() => ({ remoteUserId: 'owner', isAnonymous })) },
    '../stores/contest-store': { useContestStore: createStore(() => ({ contests: [contest], updateContest() {} })) },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: 'ios' }, Share: { share: jest.fn() } },
    './theme': { COLORS: {} }, './LocalJoinLimitationBanner': { LocalJoinLimitationBanner: () => null },
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true, NATIVE_LINKS_ENABLED: false },
  });
  const { ContestJoinCode } = load('src/ui/ContestJoinCode.tsx');
  let root;
  await act(async () => { root = create(React.createElement(ContestJoinCode, { contest })); });
  await act(async () => {});
  const text = JSON.stringify(root.toJSON());
  await act(() => root.unmount());
  return { enroll, text };
}

test('a signed-in organizer opening a new, unscored round gets sharing switched on without tapping', async () => {
  const h = await mountNew({ isAnonymous: false });
  expect(h.enroll).toHaveBeenCalledTimes(1);
});

test.each([
  ['a guest (not signed in)', { isAnonymous: true }],
  ['a round that already has a score', { isAnonymous: false, scores: [4, 0] }],
  ['a finished round', { isAnonymous: false, status: 'completed' }],
])('sharing is not switched on automatically for %s', async (_name, options) => {
  const h = await mountNew(options);
  expect(h.enroll).not.toHaveBeenCalled();
  expect(h.text).not.toContain('Sign in with email or Apple to enable');
});
