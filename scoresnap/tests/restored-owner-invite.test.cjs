const fs = require('node:fs');
const load = require('./helpers/load-ts.cjs')();
const { snapshotOwnerInviteCode, ownerInviteCode } = load('src/services/owner-invite.ts');
const { restoreOwnerContest } = load('src/services/restore-owner-contest.ts');
const { enrollNewRound } = load('src/services/online-enrollment.ts');
const cap = { api_version: 1, contract: 'snapscore-sync-v1', protocol: 1, enabled: true, revision: 1, channel: { private: true, event: 'revision', topic: 'snapscore:c' } };
const snapshot = (patch = {}) => ({ contest_id: 'c', protocol: 1, revision: 1, name: 'Restored', completed: false, invite_code: 'DGTWEW', capabilities: cap, games: ['skins'], game_settings: { betUnit: 7, hasTeams: true }, course: { name: 'Course', holes: [] }, rounds: [], id_map: [], ...patch });
const member = { role: 'host', status: 'approved', player_id: null };

test.each(['DGTWEW', 'ABC234', 'ZZZ999', '234567'])('canonical join codes use existing alphabet: %s', code => {
  expect(snapshotOwnerInviteCode('c', snapshot({ invite_code: code }))).toBe(code);
});
test.each([undefined, null, '', 'abc234', ' ABC234 ', 'ABC23', 'ABC2345', 'ABCOI1', 123456, {}, ['ABC234']])('old or malformed field never becomes a local code: %p', code => {
  expect(snapshotOwnerInviteCode('c', snapshot({ invite_code: code }))).toBeUndefined();
  expect(restoreOwnerContest(snapshot({ invite_code: code })).joinCode).toBeUndefined();
});
test.each([
  { contest_id: 'other' }, { protocol: 0 }, { completed: true },
  { capabilities: { ...cap, enabled: false } }, { capabilities: { ...cap, channel: { ...cap.channel, topic: 'snapscore:other' } } },
])('foreign, paused, completed or unsupported snapshots never share: %p', patch => {
  expect(snapshotOwnerInviteCode('c', snapshot(patch))).toBeUndefined();
});
test.each(['player', 'scorer', 'viewer'])('a %s snapshot is not owner code authority', role => {
  expect(ownerInviteCode('c', { membership: { ...member, role }, snapshot: snapshot() })).toBeUndefined();
});
test('revoked, absent and unrelated current views do not authorize a persisted code', () => {
  expect(ownerInviteCode('c', undefined)).toBeUndefined();
  expect(ownerInviteCode('c', { membership: { ...member, status: 'revoked' }, snapshot: snapshot() })).toBeUndefined();
  expect(ownerInviteCode('other', { membership: member, snapshot: snapshot() })).toBeUndefined();
  expect(ownerInviteCode('c', { membership: member, snapshot: snapshot() })).toBe('DGTWEW');
});
test('restore serializes canonical code without losing game settings; reload alone is not proof', () => {
  const restored = JSON.parse(JSON.stringify(restoreOwnerContest(snapshot())));
  expect(restored).toMatchObject({ remoteRestored: true, joinCode: 'DGTWEW', games: ['skins'], betUnit: 7, hasTeams: true });
  expect(ownerInviteCode(restored.id, undefined)).toBeUndefined();
});
test('a restored round cannot be enrolled again even if it has no scores', async () => {
  const api = { create: jest.fn(), rpc: jest.fn() };
  await expect(enrollNewRound(restoreOwnerContest(snapshot()), 'owner', api)).rejects.toThrow('Could not check online sharing');
  expect(api.create).not.toHaveBeenCalled(); expect(api.rpc).not.toHaveBeenCalled();
});
test('offline SQL proposal retains exact predecessor fields and rollback, outside active migrations', () => {
  const predecessor = fs.readFileSync('supabase/proposed/20261031230000_restore_game_settings.sql', 'utf8');
  const body = predecessor.slice(predecessor.indexOf('CREATE OR REPLACE FUNCTION public.fetch_snapshot'), predecessor.lastIndexOf('COMMIT;'));
  const proposed = fs.readFileSync('supabase/proposed/20261101190000_owner_invite_snapshot.sql', 'utf8');
  const rollback = fs.readFileSync('supabase/rollbacks/20261101190000_owner_invite_snapshot.sql', 'utf8');
  expect(rollback).toContain(body);
  const withoutAddition = proposed.replace(/ -- Owner-only extension\.[\s\S]*? END IF;\n/, '');
  expect(withoutAddition).toContain(body);
  expect(proposed).toContain("IF c.owner_id=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false)");
  expect(proposed).not.toMatch(/\b(?:GRANT|REVOKE|DROP FUNCTION|UPDATE public.contests)\b/);
  expect(fs.existsSync('supabase/migrations/20261101190000_owner_invite_snapshot.sql')).toBe(false);
});
