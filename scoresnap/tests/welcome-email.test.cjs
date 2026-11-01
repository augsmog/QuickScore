const assert = require('node:assert/strict');
const test = globalThis.test || require('node:test');
const lib = require('../scripts/render-welcome-email.cjs');
const banned = /\b(?:bets?|betting|wager\w*|unlock\w*|winnings|payout\w*)\b|!|\p{Extended_Pictographic}/iu;
test('ledger email has exact copy, one game count per part, and no referral promise', () => {
  for (const APP_URL of [undefined, 'https://example.test/round?a=1&b=2']) {
    const settings = lib.emailSettings({ APP_URL });
    const welcome = lib.buildWelcomeEmail('sample@example.test', 'SECRET-CODE', settings);
    assert.equal(welcome.subject, 'Welcome to SnapScore');
    for (const part of [welcome.html.replace(/<br>/g, ' '), welcome.text]) {
      for (const copy of ['SnapScore', 'Welcome to SnapScore', "Score your round, play side games, and see who owes what when it's done.", 'Scan your scorecard.', "Take a photo and we'll turn it into a scorecard.", 'Pick your games.', 'From 50+ game modes.', 'Settle up with your group.', 'See who owes what when the round ends.', 'Start a round', "SnapScore doesn't hold or move money. Your group settles up directly.", 'Autumn8me, Inc.', 'Questions? Just reply.', 'Unsubscribe']) assert.ok(part.includes(copy), copy);
      assert.equal(part.split('50+ game modes').length - 1, 1);
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
    assert.equal(reward.subject, 'Your SnapScore referral reward');
    assert.ok(reward.text.startsWith('Three friends joined SnapScore with your code. Your reward is now active.\n\nAutumn8me, Inc.'));
  }
});
