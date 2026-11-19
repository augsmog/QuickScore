const fs = require('node:fs'), ts = require('typescript');
function load(path, deps) {
  const m = { exports: {} };
  new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText)(name => {
    if (name in deps) return deps[name];
    throw Error(name);
  }, m, m.exports);
  return m.exports;
}

test('revoked reconnect removes the card once, retains denial across restart, and never retransmits', async () => {
  jest.useFakeTimers();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks: { request: async (_, work) => work() } } });
  const sync = load('src/services/sync-v1.ts', {});
  const online = load('src/services/online-client.ts', { './sync-v1': sync, './guest-join': {} });
  const { useOnlineStore: store } = load('src/stores/online-store.ts', { zustand: require('zustand') });
  const capability = { api_version: 1, contract: 'snapscore-sync-v1', protocol: 1, enabled: true,
    channel: { private: true, event: 'revision', topic: 'snapscore:c' } };
  const member = { contest_id: 'c', role: 'player', status: 'approved', player_id: 'p' };
  const snapshot = { contest_id: 'c', revision: 1, capabilities: capability, rounds: [] };
  const storage = new Map(), calls = [];
  let revoked = false, connected = true, uuid = 0;
  const rpc = async name => {
    calls.push(name);
    if (!connected) throw Error('offline');
    if (name === 'my_sync_status') return { data: { api_version: 1, memberships: revoked ? [] : [member], requests: [] } };
    if (name === 'sync_capabilities') return revoked ? { error: { code: '42501' } } : { data: capability };
    if (name === 'fetch_snapshot') return { data: snapshot };
    throw Error(name);
  };
  const deps = {
    '../stores/persisted-keys': { persistGate: {} }, './tournament-completion': { tournamentCompletion: () => ({}) },
    './sync-v1': sync, './online-client': online, 'react-native': { Platform: { OS: 'web' } },
    'expo-crypto': { randomUUID: () => String(++uuid) },
    '../db/supabase': { supabase: { rpc, auth: { getSession: async () => ({ data: { session: { user: { id: 'actor' } } } }) } } },
    '../db/outbox-storage': { outboxStorage: { getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v); } } },
    '../config/features': { CROSS_DEVICE_SHARING_ENABLED: true }, '../config/auth': { REAL_AUTH_CONFIGURED: true },
    './captcha': {}, './score-outbox': load('src/services/score-outbox.ts', {}), '../stores/online-store': { useOnlineStore: store },
  };
  let parent, card, unsubscribe;
  try {
    const service = load('src/services/cross-device.ts', deps);
    await service.client.discover();
    expect(store.getState().events.c).toBeDefined();
    connected = false; revoked = true;
    await service.queueOnlineScore({ contest_id: 'c', round_id: 'r', player_id: 'p', hole: 4, action: 'set', strokes: 15 }, 0);
    await expect(service.refreshOnline()).rejects.toThrow('offline');
    expect(store.getState().events.c).toBeDefined();
    expect((await service.onlineQueue()).entries[0].state).toBe('queued');
    connected = true;
    let removals = 0, reappearances = 0;
    // Model ApprovedScorecard's effect cleanup on removal from the real events store.
    unsubscribe = store.subscribe((state, previous) => {
      if (previous.events.c && !state.events.c) { removals++; card?.stop(); }
      if (!previous.events.c && state.events.c) reappearances++;
    });
    const errors = jest.fn();
    parent = online.foregroundSync(service.refreshOnline, errors);
    card = online.foregroundSync(service.refreshOnline, errors);
    await service.refreshOnline();
    expect(removals).toBe(1);
    expect(store.getState().events.c).toBeUndefined();
    const denied = (await service.onlineQueue()).entries;
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ state: 'denied', draft: { hole: 4, strokes: 15 } });
    const capabilityCalls = calls.filter(n => n === 'sync_capabilities').length;
    await jest.advanceTimersByTimeAsync(90000);
    expect(calls.filter(n => n === 'sync_capabilities')).toHaveLength(capabilityCalls);
    expect(calls).not.toContain('write_score');
    expect(removals).toBe(1); expect(reappearances).toBe(0); expect(errors).not.toHaveBeenCalled();
    expect((await service.onlineQueue()).entries).toEqual(denied);
    parent.stop(); card.stop();
    for (let restart = 0; restart < 2; restart++) {
      const restored = load('src/services/cross-device.ts', deps);
      // The root reload path discovers before replay; the guest path does the reverse.
      await online.rootRefresh(async () => 'actor', () => [], restored.client, restored.replayOnlineScores)();
      expect(store.getState().events.c).toBeUndefined();
      expect((await restored.onlineQueue()).entries).toEqual(denied);
    }
    expect(calls.filter(n => n === 'sync_capabilities')).toHaveLength(capabilityCalls);
    expect(jest.getTimerCount()).toBe(0);
  } finally {
    parent?.stop(); card?.stop(); unsubscribe?.(); jest.useRealTimers();
    if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator;
  }
});
