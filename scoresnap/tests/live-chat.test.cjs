const { execFileSync } = require('node:child_process');
const run = body => void execFileSync(process.execPath, ['--import','tsx','--input-type=module','-e', `
import assert from 'node:assert/strict';
const mod = await import('./src/services/live-chat-model.ts');
const {validateMessage, chatError, sanitizeMessages, CHAT_POLL_MS} = mod.default ?? mod;
${body}`], {encoding:'utf8'});
test('chat trims names and bodies and accepts boundary lengths',()=>run(`
assert.deepEqual(validateMessage(' Sam ', ' Hi '),{name:'Sam',body:'Hi'});
assert.equal(validateMessage('a'.repeat(30),'x'.repeat(500)).body.length,500);
assert.equal([...validateMessage('😀'.repeat(30),'😀'.repeat(500)).body].length,500);
assert.equal(CHAT_POLL_MS,5000);`));
test('chat rejects empty and overlong names and messages',()=>run(`
for(const name of ['', '   ', 'a'.repeat(31)]) assert.throws(()=>validateMessage(name,'Hi'),/display name/);
for(const body of ['', '\\n ', 'x'.repeat(501)]) assert.throws(()=>validateMessage('Sam',body),/message/);`));
test('rate limits have a safe retry message and server details are never reflected',()=>run(`
assert.match(chatError('chat rate limit').message,/Wait 30 seconds/);
assert.match(chatError('revoked link').message,/revoked/);
assert.match(chatError('expired link').message,/expired/);
assert.equal(chatError('invalid link').message,'Invalid share link.');
assert(!chatError('private SQL details').message.includes('private'));`));
test('public chat allowlist drops IDs and session hashes and preserves literal markup',()=>run(`
const markup='<img src=x onerror=alert(1)><script>alert(1)</script>';
const rows=sanitizeMessages([{display_name:'<b>Sam</b>',body:markup,created_at:'2026-10-22T12:00:00Z',id:'private',contest_id:'private',sender_session_hash:'private',removed_at:null}]);
assert.deepEqual(Object.keys(rows[0]).sort(),['body','created_at','display_name']);
assert.equal(rows[0].body,markup); assert.equal(rows[0].display_name,'<b>Sam</b>');`));
test('chat fails closed on malformed network responses',()=>run(`
for(const data of [null,{},[{}],[{display_name:'Sam',body:'ok',created_at:'bad'}],[{display_name:'Sam',body:'x'.repeat(501),created_at:'2026-10-22'}]]) assert.throws(()=>sanitizeMessages(data));`));
