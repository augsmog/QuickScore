const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const run = body => execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', `
import assert from 'node:assert/strict';
const model = await import('./src/services/chat-moderation-model.ts');
const filter = await import('./src/services/chat-filter.ts');
const {emptyPreferences, readPreferences, blockParticipant, unblockParticipant, hideReportedMessage, visibleMessages} = model.default ?? model;
const {hasObjectionableWords, maskChatText, requireCleanChat} = filter.default ?? filter;
${body}`], { encoding: 'utf8' });
test('block uses stable identity, persists, hides all messages, and unblocks', () => run(`
const a={id:'a',participant_id:'stable',is_own:false,display_name:'Sam',body:'Hello',created_at:'2026-10-31'};
const b={...a,id:'b',display_name:'New name'};
const c={...a,id:'c',participant_id:'other'};
const empty=emptyPreferences();
const blocked=readPreferences(JSON.stringify(blockParticipant(empty,a)));
assert.deepEqual(visibleMessages([a,b,c],blocked),[c]);
assert.deepEqual(visibleMessages([a,b,c],unblockParticipant(blocked,'stable')),[a,b,c]);
assert.deepEqual(blockParticipant(empty,{...a,is_own:true}),empty);
assert.deepEqual(empty,emptyPreferences());
assert.throws(()=>readPreferences('{"blocked":[],"reported":[]}'));
assert.throws(()=>readPreferences('bad'));
`));
test('reported message remains hidden on refresh without hiding other messages', () => run(`
const a={id:'a',participant_id:'stable',is_own:false,display_name:'Sam',body:'Hello',created_at:'2026-10-31'};
const state=hideReportedMessage(hideReportedMessage(emptyPreferences(),'a'),'a');
assert.deepEqual(state.reported,['a']);
assert.deepEqual(visibleMessages([a,{...a,id:'b'}],readPreferences(JSON.stringify(state))).map(m=>m.id),['b']);
`));
test('filter rejects names and sends, masks display, and preserves innocent words', () => run(`
assert(hasObjectionableWords('SHIT!'));
assert(hasObjectionableWords('ｓｈｉｔ'));
assert.equal(maskChatText('Hello SHIT!'),'Hello ••••!');
assert.throws(()=>requireCleanChat('Sam','fuck'),/Please change/);
assert.throws(()=>requireCleanChat('shit','Hello'),/Please change/);
for (const word of ['Scunthorpe','class','shirt','hello']) { requireCleanChat(word,word); assert.equal(maskChatText(word),word); }
`));
test('RPCs validate capability, scope reports, keep private tables, and avoid exposing raw identity', () => {
  const sql=readFileSync('supabase/migrations/20261031180000_chat_report_block.sql','utf8');
  expect(sql).toMatch(/alter table public.chat_reports enable row level security/);
  expect(sql).toMatch(/revoke all on public.chat_reports from public, anon, authenticated/);
  expect(sql).not.toMatch(/create policy/i);
  expect(sql).toMatch(/reporter_session_hash,reporter_user_id,contest_id,message_id,reason/);
  expect(sql).toMatch(/m.id=p_message_id and m.contest_id=cid/);
  expect(sql).toMatch(/m.sender_session_hash<>reporter/);
  expect(sql).toMatch(/on conflict \(reporter_session_hash,message_id\) do nothing/);
  expect(sql).toMatch(/public.chat_contest\(p_token\)/);
  expect(sql).toMatch(/r.owner_id=auth.uid\(\) and c.owner_id=auth.uid\(\)/);
  expect(sql).toMatch(/cid::text \|\| ':' \|\| m.sender_session_hash/);
  expect(sql.match(/security definer set search_path = pg_catalog/g)).toHaveLength(3);
});
