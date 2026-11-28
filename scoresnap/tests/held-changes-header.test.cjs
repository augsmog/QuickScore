// Review finding 3: only an app that can show "waiting for approval" asks the server to hold a
// change. The app says so with one header; the server reads exactly that header.
const fs = require('fs');
const client = fs.readFileSync('src/db/supabase.ts', 'utf8');
const server = fs.readFileSync('supabase/proposed/20261128010000_web_score_rules.sql', 'utf8');

test('the app and the server agree on the header name and value', () => {
  expect(client).toContain('export const HELD_CHANGES_HEADER = { "x-snapscore-holds": "1" } as const;');
  expect(server).toContain("(current_setting('request.headers',true)::jsonb->>'x-snapscore-holds')='1'");
});

test('the iPhone app sends it on every request; a browser does not', () => {
  expect(client).toContain('...(Platform.OS === "web" ? {} : { global: { headers: HELD_CHANGES_HEADER } }),');
});

test('the screens that show a held change exist in this build', () => {
  // The header is a promise that these are present. If one is removed, stop sending the header.
  expect(fs.existsSync('src/ui/ScoreFlags.tsx')).toBe(true);
  expect(fs.readFileSync('app/contest/[id]/_layout.tsx', 'utf8')).toContain('<ScoreFlags contest={contest} />');
});

test('web guests are held to the rule without the header', () => {
  expect(server).toContain('public.client_shows_held_changes() OR EXISTS(SELECT 1 FROM public.player_link_members j WHERE j.contest_id=$1 AND j.user_id=uid)');
});
