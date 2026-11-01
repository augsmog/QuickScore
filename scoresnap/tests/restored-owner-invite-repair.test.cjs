const { create } = require('zustand');
const loader = require('./helpers/load-ts.cjs');
const cap = { api_version: 1, contract: 'snapscore-sync-v1', protocol: 1, enabled: true, revision: 2, channel: { private: true, event: 'revision', topic: 'snapscore:c' } };
const snapshot = (patch = {}) => ({ contest_id: 'c', protocol: 1, revision: 2, name: 'Restored', completed: false, invite_code: 'DGTWEW', capabilities: cap, games: ['skins'], game_settings: { betUnit: 7 }, course: { name: 'Course', holes: [] }, rounds: [], id_map: [], ...patch });
const member = { role: 'host', status: 'approved', player_id: null };
function harness(contests = []) {
  const online = loader()('src/stores/online-store.ts').useOnlineStore;
  const local = create(() => ({ contests }));
  const load = loader({
    '../stores/persisted-keys': { persistGate: {} }, './tournament-completion': { tournamentCompletion: () => ({}) },
    './online-client': { onlineClient: (_rpc, repair) => ({ repair }), foregroundRetry: () => () => {} },
    'react-native': { Platform: { OS: 'web' } }, 'expo-crypto': {}, '../db/supabase': { supabase: {} }, '../db/outbox-storage': {},
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true }, '../config/auth': { REAL_AUTH_CONFIGURED: true },
    './captcha': {}, './score-outbox': {}, '../stores/online-store': { useOnlineStore: online }, '../stores/contest-store': { useContestStore: local },
  });
  const client = load('src/services/cross-device.ts').client;
  return { client, local, online };
}
test('initial owner repair persists canonical code; serialization carries remote origin across reload', () => {
  const h = harness(); h.client.repair('c', member, snapshot());
  const saved = JSON.parse(JSON.stringify(h.local.getState().contests));
  expect(saved[0]).toMatchObject({ remoteRestored: true, joinCode: 'DGTWEW', games: ['skins'], betUnit: 7 });
  h.online.getState().reset();
  expect(loader()('src/services/owner-invite.ts').ownerInviteCode(saved[0].id, h.online.getState().events.c)).toBeUndefined();
});
test.each([undefined, null, 'abc234', 'WRONG1', 'NEW234'])('repair of existing restored cache replaces or clears fabricated code: %p', code => {
  const before = loader()('src/services/restore-owner-contest.ts').restoreOwnerContest(snapshot());
  const h = harness([{ ...before, joinCode: 'BAD234' }]);
  h.client.repair('c', member, snapshot({ invite_code: code }));
  expect(h.local.getState().contests[0].joinCode).toBe(code === 'NEW234' ? code : undefined);
  expect(h.local.getState().contests[0].games).toEqual(['skins']);
});
test('slower older revision never overwrites accepted canonical code or restores its scores', () => {
  const h = harness(); const newest = snapshot({ revision: 7, invite_code: 'NEW234' });
  h.client.repair('c', member, newest);
  h.client.repair('c', member, snapshot({ revision: 6, invite_code: 'OLD234', games: [] }));
  expect(h.online.getState().events.c.snapshot).toBe(newest);
  expect(h.local.getState().contests[0]).toMatchObject({ joinCode: 'NEW234', games: ['skins'] });
});
test('accepted old-server response clears an existing restored code, and denial removes the restored cache', () => {
  const h = harness(); h.client.repair('c', member, snapshot());
  h.client.repair('c', member, snapshot({ revision: 3, invite_code: undefined }));
  expect(h.local.getState().contests[0].joinCode).toBeUndefined();
  h.client.repair('c', null, null);
  expect(h.online.getState().events.c).toBeUndefined(); expect(h.local.getState().contests).toEqual([]);
});
test('member repair does not create owner cache, and ordinary local rounds keep their generated codes', () => {
  const empty = harness(); empty.client.repair('c', { ...member, role: 'player' }, snapshot());
  expect(empty.local.getState().contests).toEqual([]);
  const h = harness([{ id: 'c', joinCode: 'LOCAL2' }]);
  h.client.repair('c', member, snapshot());
  expect(h.local.getState().contests[0]).toEqual({ id: 'c', joinCode: 'LOCAL2' });
});
