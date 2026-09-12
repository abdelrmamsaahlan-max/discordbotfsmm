const { EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');
const https = require('https');

const FOOTER_ICON_URL = 'https://cdn.discordapp.com/attachments/1436074247725383710/1470434524881096816/1770649288038.png?ex=6aa6121e&is=6aa4c09e&hm=fd54c47226a79c68d96f0df59ed485c756ad0a689cc0ad9c85133d1da69c540c&';

// Always use the real FSMM server emojis instead of hard-coded IDs.
// Hard-coded IDs were the reason the base-menu emojis were showing as broken.
const emojiByName = new Map();
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  candy: ['candy'],
  lava: ['lava'],
  galaxy: ['galaxy'],
  yinyang: ['yinyang', 'yinying', 'yinyangbase'],
  radioactive: ['radioactive', 'radiation', 'radioactivebase'],
  cursed: ['cursed', 'crused', 'cursedbase'],
  divine: ['divine', 'divinebase'],
  cyber: ['cyber', 'cyberbase'],
  phantom: ['phantom', 'phantombase'],
  crystal: ['crystal', 'crystalbase']
};

function loadGuildEmojis() {
  const token = process.env.DISCORD_TOKEN;
  const guildId = process.env.GUILD_ID;
  if (!token || !guildId) return;
  const req = https.get(`https://discord.com/api/v10/guilds/${guildId}/emojis`, {
    headers: { Authorization: `Bot ${token}` }
  }, res => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => {
      try {
        if (res.statusCode !== 200) throw new Error(`Discord emoji API HTTP ${res.statusCode}`);
        const emojis = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        for (const emoji of emojis) {
          if (!emoji?.name || !emoji?.id) continue;
          emojiByName.set(normalize(emoji.name), {
            id: emoji.id,
            name: emoji.name,
            animated: Boolean(emoji.animated)
          });
        }
        console.log(`[FSMM] Loaded ${emojiByName.size} server emojis for menus`);
      } catch (e) {
        console.error('[FSMM EMOJIS]', e.message);
      }
    });
  });
  req.on('error', e => console.error('[FSMM EMOJIS]', e.message));
  req.setTimeout(10000, () => req.destroy(new Error('emoji API timeout')));
}

function findEmoji(label) {
  const key = normalize(label);
  const candidates = aliases[key] || [key];
  for (const candidate of candidates) {
    const emoji = emojiByName.get(normalize(candidate));
    if (emoji) return emoji;
  }
  // Also allow names that contain the requested base name.
  for (const [name, emoji] of emojiByName) {
    if (candidates.some(candidate => name === normalize(candidate) || name.includes(normalize(candidate)))) return emoji;
  }
  return undefined;
}

const originalSetFooter = EmbedBuilder.prototype.setFooter;
EmbedBuilder.prototype.setFooter = function(data) {
  if (data && typeof data === 'object' && typeof data.text === 'string' && /^FSMM\s*[•|·-]\s*v?\d/i.test(data.text.trim())) {
    return originalSetFooter.call(this, { ...data, text: 'FSMM', iconURL: FOOTER_ICON_URL });
  }
  if (data && typeof data === 'object' && data.text === 'FSMM') {
    return originalSetFooter.call(this, { ...data, iconURL: data.iconURL || FOOTER_ICON_URL });
  }
  return originalSetFooter.call(this, data);
};

const originalAddOptions = StringSelectMenuBuilder.prototype.addOptions;
StringSelectMenuBuilder.prototype.addOptions = function(...args) {
  const patch = option => {
    if (Array.isArray(option)) return option.map(patch);
    if (!option || typeof option !== 'object' || !option.label || option.emoji) return option;
    const emoji = findEmoji(option.label);
    return emoji ? { ...option, emoji } : option;
  };
  return originalAddOptions.apply(this, args.map(patch));
};

// Start loading the server's real emojis immediately. This runs before the bot starts
// serving interactions because this file is loaded with Node's -r preload option.
loadGuildEmojis();
