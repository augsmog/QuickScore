const React = require('react');
const { create, act } = require('react-test-renderer');
const { create: createStore } = require('zustand');
const loader = require('./helpers/load-ts.cjs');
global.IS_REACT_ACT_ENVIRONMENT = true;
const id = '11111111-1111-4111-8111-111111111111';
const member = { role: 'host', status: 'approved', player_id: null };
const snapshot = (patch = {}) => ({ contest_id: id, protocol: 1, revision: 1, completed: false, invite_code: 'DGTWEW', capabilities: { api_version: 1, contract: 'snapscore-sync-v1', protocol: 1, enabled: true, revision: 1, channel: { private: true, event: 'revision', topic: `snapscore:${id}` } }, ...patch });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const roots = [];
beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation((...args) => {
    if (!String(args[0]).startsWith('react-test-renderer is deprecated')) throw Error(args.join(' '));
  });
});
afterEach(async () => { for (const root of roots.splice(0)) await act(() => root.unmount()); jest.restoreAllMocks(); });
async function mount({ online = true, actor = 'owner', restored = true, joinCode = 'BAD234', initial, response = snapshot(), platform = 'web' } = {}) {
  let next = response;
  const onlineStore = createStore(() => ({ events: initial ? { [id]: { membership: member, snapshot: initial } } : {} }));
  const authStore = createStore(() => ({ remoteUserId: actor }));
  const contestStore = createStore((set) => ({ contests: [{ id, remoteRestored: restored, joinCode }], updateContest: (key, patch) => set(s => ({ contests: s.contests.map(c => c.id === key ? { ...c, ...patch } : c) })) }));
  const accept = (value, membership = member) => onlineStore.setState({ events: value ? { [id]: { membership, snapshot: value } } : {} });
  const client = {
    rejoinHost: jest.fn(async () => {
      const value = await (typeof next === 'function' ? next() : next);
      if (value instanceof Error || value?.code === '42501') { if (value?.code === '42501') accept(null); throw value; }
      accept(value); return { snapshot: value };
    }),
    discover: jest.fn(async () => {}),
  };
  const clipboard = jest.fn(async () => {}), nativeShare = jest.fn(async () => {}), enroll = jest.fn();
  global.window = { location: { origin: 'https://local.test' } };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { clipboard: { writeText: clipboard } } });
  const load = loader({
    '../services/cross-device': { onlineEnabled: online, client },
    '../services/online-enrollment': { enrollNewRound: enroll }, '../db/supabase': {},
    '../stores/online-store': { useOnlineStore: onlineStore }, '../stores/auth-store': { useAuthStore: authStore },
    '../stores/contest-store': { useContestStore: contestStore },
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Platform: { OS: platform }, Share: { share: nativeShare } },
    './theme': { COLORS: {} }, './LocalJoinLimitationBanner': { LocalJoinLimitationBanner: () => null },
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true },
  });
  const { ContestJoinCode } = load('src/ui/ContestJoinCode.tsx');
  function Screen() { const contest = contestStore(s => s.contests[0]); return React.createElement(ContestJoinCode, { contest }); }
  let root;
  await act(async () => { root = create(React.createElement(Screen)); }); roots.push(root);
  const codes = () => root.root.findAll(n => n.props.testID === 'organizer-join-code');
  const shares = () => root.root.findAllByType('Pressable').filter(n => String(n.props.children.props.children).includes('Copy / share'));
  return { root, accept, codes, shares, client, clipboard, nativeShare, enroll, onlineStore, authStore, contestStore, setResponse: value => { next = value; } };
}

test.each([undefined, null, '', 'abc234', ' ABC234 ', 'ABCOI1'])('restored missing/invalid canonical field hides fabricated persisted code and enable/share: %p', async code => {
  const h = await mount({ response: snapshot({ invite_code: code }) });
  expect(h.codes()).toHaveLength(0); expect(h.shares()).toHaveLength(0);
  expect(h.root.root.findAllByType('Pressable')).toHaveLength(0);
  expect(h.contestStore.getState().contests[0].joinCode).toBe('BAD234'); // UI does not turn cache into authority.
  expect(h.enroll).not.toHaveBeenCalled(); expect(h.clipboard).not.toHaveBeenCalled();
});
test.each([{ online: false }, { actor: null }])('restored offline/unsigned rows never display, generate or share cached codes: %p', async options => {
  const h = await mount({ ...options, joinCode: '', initial: snapshot() });
  expect(h.codes()).toHaveLength(0); expect(h.shares()).toHaveLength(0); expect(h.client.rejoinHost).not.toHaveBeenCalled();
  expect(h.contestStore.getState().contests[0].joinCode).toBe('');
});
test('reload waits for proof even with a previously canonical persisted code and cached event', async () => {
  const pending = deferred(); const h = await mount({ joinCode: 'DGTWEW', initial: snapshot(), response: pending.promise });
  expect(h.codes()).toHaveLength(0);
  await act(async () => pending.resolve(snapshot()));
  expect(h.codes()).toHaveLength(1); expect(h.codes()[0].props.children).toContain('DGTWEW');
});
test.each(['web', 'ios'])('share rechecks server and uses fresh rotated code, never persisted/rendered old code: %s', async platform => {
  const h = await mount({ platform });
  expect(h.codes()[0].props.children).toContain('DGTWEW');
  h.setResponse(snapshot({ invite_code: 'NEW234', revision: 2 }));
  await act(async () => h.shares()[0].props.onPress());
  expect(h.client.rejoinHost).toHaveBeenCalledTimes(2);
  if (platform === 'web') expect(h.clipboard).toHaveBeenCalledWith('https://local.test/join/NEW234');
  else expect(h.nativeShare).toHaveBeenCalledWith({ message: 'Sign in with email or Apple. Join with code NEW234: snapscore://join/NEW234' });
});
test('double share while verification is pending produces one request and one copy', async () => {
  const h = await mount(), pending = deferred(); h.setResponse(pending.promise);
  const onPress = h.shares()[0].props.onPress; let first, second;
  await act(async () => { first = onPress(); second = onPress(); });
  expect(h.client.rejoinHost).toHaveBeenCalledTimes(2);
  await act(async () => { pending.resolve(snapshot()); await Promise.all([first, second]); });
  expect(h.clipboard).toHaveBeenCalledTimes(1);
});
test.each([Error('network'), { code: '42501' }, snapshot({ invite_code: undefined }), snapshot({ completed: true })])('failed or no-longer-shareable refresh never copies an old code: %p', async result => {
  const h = await mount(); h.setResponse(result);
  await act(async () => h.shares()[0].props.onPress());
  expect(h.clipboard).not.toHaveBeenCalled(); expect(h.codes()).toHaveLength(0);
});
test.each(['identity', 'unmount'])('pending share is canceled by %s change', async change => {
  const h = await mount(), pending = deferred(); h.setResponse(pending.promise); let work;
  await act(async () => { work = h.shares()[0].props.onPress(); });
  if (change === 'identity') await act(async () => h.authStore.setState({ remoteUserId: null }));
  else { await act(async () => h.root.unmount()); roots.splice(roots.indexOf(h.root), 1); }
  await act(async () => { pending.resolve(snapshot()); await work; });
  expect(h.clipboard).not.toHaveBeenCalled(); expect(h.nativeShare).not.toHaveBeenCalled();
});
test('failed check can recover through Online sync accepted refresh without remount', async () => {
  const h = await mount({ initial: snapshot(), response: Error('network') });
  expect(h.codes()).toHaveLength(0);
  await act(async () => h.accept(snapshot({ revision: 2 })));
  expect(h.codes()).toHaveLength(1); expect(h.shares()).toHaveLength(1);
  expect(h.root.root.findAllByType('Text').some(n => n.props.children === 'Could not check online sharing. Open Online sync to retry.')).toBe(false);
});
test('local-only new and legacy rounds still allocate and share a local code', async () => {
  const h = await mount({ online: false, actor: null, restored: false, joinCode: '' });
  const code = h.contestStore.getState().contests[0].joinCode;
  expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  expect(h.codes()[0].props.children).toContain(code);
  await act(async () => h.shares()[0].props.onPress());
  expect(h.clipboard).toHaveBeenCalledWith(`https://local.test/join/${code}`);
  expect(h.client.rejoinHost).not.toHaveBeenCalled();
});
test('new local online round retains enrollment control and no invite until enrollment', async () => {
  const h = await mount({ restored: false, response: { code: '42501' } });
  expect(h.codes()).toHaveLength(0); expect(h.shares()).toHaveLength(0);
  expect(h.root.root.findAllByType('Pressable')).toHaveLength(1);
});
