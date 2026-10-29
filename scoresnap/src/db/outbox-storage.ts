import * as SQLite from 'expo-sqlite';
import type { EnvelopeStorage } from '../services/score-outbox';
let database: Promise<SQLite.SQLiteDatabase> | undefined;
async function db() {
  if (!database) database = (async () => {
    const result = await SQLite.openDatabaseAsync('snapscore-outbox.db');
    await result.execAsync('PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS envelopes (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    return result;
  })();
  return database;
}
export const outboxStorage: EnvelopeStorage = {
  async getItem(key) {
    return (await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM envelopes WHERE key = ?', key))?.value ?? null;
  },
  async setItem(key, value) {
    await (await db()).runAsync('INSERT INTO envelopes (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, value);
  },
};
