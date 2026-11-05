interface Auth {
  startAutoRefresh(): void; stopAutoRefresh(): void;
  getSession(): Promise<{ error: unknown }>;
}
export function authLifecycle(auth: Auth, apply: () => Promise<void>, report: (error: unknown) => void) {
  let generation = 0;
  return {
    change(state: string) {
      const current = ++generation;
      if (state !== 'active') { auth.stopAutoRefresh(); return; }
      auth.startAutoRefresh();
      void (async () => {
        const { error } = await auth.getSession(); if (error) throw error;
        if (generation === current) await apply();
      })().catch(report);
    },
    stop() { generation++; auth.stopAutoRefresh(); },
  };
}
