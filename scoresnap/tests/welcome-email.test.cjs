const assert = require('node:assert/strict');
const test = globalThis.test || require('node:test');
const lib = require('../scripts/render-welcome-email.cjs');
const banned = /\b(?:bets?|betting|wager\w*|gambl\w*|side-bet|unlock\w*|winnings|payout\w*)\b|!|\p{Extended_Pictographic}/iu;
test('ledger email has exact copy, one game count per part, and no referral promise', () => {
  for (const APP_URL of [undefined, 'https://example.test/round?a=1&b=2']) {
    const settings = lib.emailSettings({ APP_URL });
    const welcome = lib.buildWelcomeEmail('sample@example.test', 'SECRET-CODE', settings);
    assert.equal(welcome.subject, "Welcome to SnapScore — let's set up your first round");
    for (const part of [welcome.html.replace(/<br>/g, ' '), welcome.text]) {
      for (const copy of ['SnapScore', 'Welcome to SnapScore', "Score your round, play side games, and see who owes what when it's done.", "Now your group can sort out who owes what before you reach the parking lot.", 'Add your players and pick your games — choose from 50+ game modes, including Skins, Nassau and Wolf.', 'Score your round, hole by hole or from a photo.', 'Settle up.', 'Share it with your group.', 'Start a round', "SnapScore doesn't hold or move money. Your group settles up directly.", 'Autumn8me, Inc.', 'Questions? Just reply.', 'Unsubscribe']) assert.ok(part.includes(copy), copy);
      assert.equal(part.split('50+ game modes').length - 1, 1);
      assert.doesNotMatch(part.replace('50+ game modes', ''), /\b\d+\+?\s+(?:game|mode)/i);
      assert.doesNotMatch(part, /Premium|free month|SECRET-CODE/i);
    }
    assert.ok(welcome.html.includes(`href="${lib.escapeHtml(settings.appUrl)}"`));
    assert.ok(welcome.text.includes(settings.appUrl));
    for (const payload of [welcome, lib.buildRewardEmail('sample@example.test', settings)]) {
      assert.ok(payload.text);
      assert.doesNotMatch(payload.html + payload.text + payload.subject, banned);
      assert.ok(payload.html.includes(`href="${lib.escapeHtml(settings.unsubscribeUrl)}"`));
      assert.ok(payload.text.includes(settings.unsubscribeUrl));
      assert.equal(payload.headers['List-Unsubscribe'], `<${settings.unsubscribeUrl}>`);
    }
    const reward = lib.buildRewardEmail('sample@example.test', settings);
    assert.equal(reward.subject, 'You earned a free month of Pro.');
    for (const part of [reward.html, reward.text]) assert.ok(part.includes('Three friends signed up with your code, so your free month of Pro is active.'));
    assert.equal(lib.referralRewardEnabled(undefined), false);
    assert.equal(settings.from, 'SnapScore <hello@scoresnap.app>');
    assert.doesNotMatch(welcome.html + welcome.text, /SECRET-CODE|invite code|join with code|free month/i);
  }
});
