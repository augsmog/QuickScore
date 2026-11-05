interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
/** Copy-on-write chunks: publish the manifest only after every chunk reads back.
 * A failed write leaves the previous session readable. Never fall back to plaintext.
 */
export function secureSessionStorage(storage: SecureStorage, unique: () => string) {
  let serial: Promise<unknown> = Promise.resolve();
  function run<T>(work: () => Promise<T>): Promise<T> {
    const next = serial.then(work); serial = next.catch(() => undefined); return next;
  }
  const manifest = (key: string) => `${key}.chunks`;
  const chunk = (key: string, id: string, n: number) => `${key}.${id}.${n}`;
  async function metadata(key: string): Promise<{ id: string; count: number } | null> {
    const raw = await storage.getItemAsync(manifest(key));
    if (raw === null) return null;
    const value = JSON.parse(raw);
    if (!/^[a-zA-Z0-9-]+$/.test(value.id) || !Number.isInteger(value.count) || value.count < 1 || value.count > 10000) throw Error('Invalid secure session manifest');
    return value;
  }
  return {
    getItem: (key: string) => run(async () => {
      const meta = await metadata(key);
      if (!meta) return storage.getItemAsync(key); // migrate the existing SecureStore key
      let result = '';
      for (let i = 0; i < meta.count; i++) {
        const part = await storage.getItemAsync(chunk(key, meta.id, i));
        if (part === null) throw Error('Incomplete secure session');
        result += part;
      }
      return result;
    }),
    setItem: (key: string, value: string) => run(async () => {
      const old = await metadata(key);
      const id = unique();
      // 400 Unicode codepoints fit under 2048 bytes even with surrogate pairs.
      const characters = Array.from(value);
      const parts: string[] = [];
      for (let i = 0; i < characters.length; i += 400) parts.push(characters.slice(i, i + 400).join(''));
      if (!parts.length) parts.push('');
      for (let i = 0; i < parts.length; i++) {
        await storage.setItemAsync(chunk(key, id, i), parts[i]);
        if (await storage.getItemAsync(chunk(key, id, i)) !== parts[i]) throw Error('Secure session read-back failed');
      }
      const raw = JSON.stringify({ id, count: parts.length });
      await storage.setItemAsync(manifest(key), raw);
      if (await storage.getItemAsync(manifest(key)) !== raw) throw Error('Secure session manifest read-back failed');
      await storage.deleteItemAsync(key);
      if (old) for (let i = 0; i < old.count; i++) await storage.deleteItemAsync(chunk(key, old.id, i));
    }),
    removeItem: (key: string) => run(async () => {
      const old = await metadata(key);
      // Remove legacy value first so sign-out cannot resurrect it.
      await storage.deleteItemAsync(key);
      await storage.deleteItemAsync(manifest(key));
      if (old) for (let i = 0; i < old.count; i++) await storage.deleteItemAsync(chunk(key, old.id, i));
    }),
  };
}
