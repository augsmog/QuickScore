// Review finding 3: only an app that can show "waiting for approval" asks the server to hold a
// change. The app says so with one header; the server reads exactly that header.
const fs = require('fs');
const client = fs.readFileSync('src/db/supabase.ts', 'utf8');
const server = fs.readFileSync('supabase/proposed/20261128010000_web_score_rules.sql', 'utf8');

test('the app and the server agree on the header name and value', () => {
  expect(client).toContain('export const HELD_CHANGES_HEADER = { "X-Client-Info": "snapscore-app snapscore-holds-1" } as const;');
  expect(server).toContain("position('snapscore-holds-1' in (current_setting('request.headers',true)::jsonb->>'x-client-info'))>0");
});

test('the app and the website both send it on every request', () => {
  expect(client).toContain('global: { headers: HELD_CHANGES_HEADER },');
  expect(client).not.toContain('Platform.OS === "web" ? {} : { global');
});

test('the screens that show a held change exist in this build', () => {
  // The header is a promise that these are present. If one is removed, stop sending the header.
  expect(fs.existsSync('src/ui/ScoreFlags.tsx')).toBe(true);
  expect(fs.readFileSync('app/contest/[id]/_layout.tsx', 'utf8')).toContain('<ScoreFlags contest={contest} />');
});

test('the server goes by the requesting app only, never by how the account once joined', () => {
  expect(server).toContain('AND public.client_shows_held_changes() THEN');
  expect(server).not.toMatch(/client_shows_held_changes\(\) OR EXISTS/);
});
