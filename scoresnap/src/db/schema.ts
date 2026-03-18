import * as SQLite from "expo-sqlite";

const MIGRATIONS = [
  // v1: Initial schema
  `CREATE TABLE IF NOT EXISTS contests (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    course_name TEXT,
    course_pars TEXT NOT NULL,
    course_handicaps TEXT,
    course_yards TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    bet_unit REAL NOT NULL DEFAULT 1,
    has_teams INTEGER NOT NULL DEFAULT 0,
    team_a_name TEXT,
    team_b_name TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,

  `CREATE TABLE IF NOT EXISTS contest_groups (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS contest_players (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    group_id TEXT REFERENCES contest_groups(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    handicap REAL NOT NULL DEFAULT 0,
    team TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );`,

  `CREATE TABLE IF NOT EXISTS contest_games (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}'
  );`,

  `CREATE TABLE IF NOT EXISTS hole_scores (
    contest_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    hole INTEGER NOT NULL CHECK(hole BETWEEN 1 AND 18),
    strokes INTEGER NOT NULL DEFAULT 0,
    putts INTEGER NOT NULL DEFAULT 0,
    fairway TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (contest_id, player_id, hole)
  );`,

  `CREATE TABLE IF NOT EXISTS settlements (
    id TEXT PRIMARY KEY,
    contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
    from_player_id TEXT NOT NULL,
    to_player_id TEXT NOT NULL,
    amount REAL NOT NULL,
    game_type TEXT NOT NULL,
    settled INTEGER NOT NULL DEFAULT 0,
    settled_at TEXT
  );`,

  `CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );`,

  `INSERT OR IGNORE INTO schema_version (version) VALUES (1);`,
];

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync("scoresnap.db");

  // Enable WAL mode for better performance
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync("PRAGMA foreign_keys = ON;");

  // Run migrations
  for (const migration of MIGRATIONS) {
    await db.execAsync(migration);
  }

  return db;
}

export type Database = SQLite.SQLiteDatabase;
