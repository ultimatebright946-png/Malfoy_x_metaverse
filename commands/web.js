const reg = require('../lib/registry');
const W = require('../lib/webcore');
const PREFIX = process.env.PREFIX || '.';
// Discord: no passwords or codes are typed into Discord. You get a private, single-use sign-in link instead.
function discordWeb(c) {
  const l = require('../lib/identity').webLoginLink(c.sender, c.u.name);
  return (c.replyPrivate || c.reply)('🌐 *MALFOY WEBSITE*\n\nYour private sign-in link (single use, valid ' + l.expiresInMin + ' minutes):\n' + l.url + '\n\nTo share one profile with WhatsApp, open Settings > Linked accounts on the website and use /link with the code it shows.\n⚠️ Do not share this link.');
}
reg.add(['weblogin', 'website', 'site', 'signup'], 'ECONOMY', c => c.platform === 'discord' ? discordWeb(c) : c.reply('🌐 *MALFOY WEBSITE*\n\n' + W.baseUrl() + '\n\n1. Open the website and tap *Register*\n2. Type your number, a username and a password\n3. I send a 6 digit code to this WhatsApp. Type it on the site.\n\nForgot your password? Tap *Forgot password* and I will send a new code here.\n\n⚠️ Never share your codes or password with anyone.'));

reg.add(['minigame', 'arena'], 'ECONOMY', c => {
  const i = W.gameInfo(c.u);
  return c.reply('🎮 *IMPERIUM ARENA*\n\nPlay a 60 second gladiator run on the website and earn XP and Denarii.\n🔗 ' + W.baseUrl() + '/#/play\n\n🎟️ Runs left today: *' + i.runsLeft + '/' + i.maxRuns + '*\n✨ XP earned today: *' + i.xpToday + '/' + i.xpCap + '*\n🏆 Best run: *' + i.best + ' kills*\n\nSign in on the website first (Register or Sign in). Your blade damage and masks come from your gear, so buy upgrades in the shop!');
});

// .code: if the bot could not push your sign-up or reset code, ask for it here (DM only, only for your own number)
reg.add(['code', 'otp'], 'ECONOMY', c => {
  if (c.isGroup) return c.reply('Send this in a private chat with me.');
  const p = require('../lib/auth').pendingFor(c.u);
  return c.reply(p ? '🔐 *MALFOY CODE*\n\nYour ' + (p.purpose === 'reset' ? 'password reset' : 'sign up') + ' code is:\n\n*' + p.code + '*\n\nIt works for a few minutes. Never share it.' : 'You have no code waiting. Ask for one on the website first (Register or Forgot password).');
});

// Discord account linking (website creates the code; this redeems it). Codes are hashed, single use and expire.
reg.add('linkaccount', 'ACCOUNT', c => {
  if (c.platform !== 'discord') return c.reply('Use /link on Discord. Get the code on the website: Settings > Linked accounts.');
  const r = require('../lib/identity').completeDiscordLink(c.sender, c.args[0], /^(confirm|yes|true)$/i.test(c.args[1] || ''));
  return c.reply((r.ok ? '✅ ' : r.needsConfirm ? '⚠️ ' : '❌ ') + r.msg + (r.needsConfirm ? '\nRepeat with: /link args:' + (c.args[0] || 'CODE') + ' confirm' : ''));
}, 'Link Discord to your website account', { platforms: ['discord'], usage: 'linkaccount <code> [confirm]' });
reg.add('unlinkaccount', 'ACCOUNT', c => {
  const r = require('../lib/identity').unlinkDiscord(c.u, c.sender); return c.reply((r.ok ? '✅ ' : '❌ ') + r.msg);
}, 'Unlink Discord from your website account', { platforms: ['discord'] });
