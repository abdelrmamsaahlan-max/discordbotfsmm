const { EmbedBuilder, StringSelectMenuBuilder, Client, ActivityType } = require('discord.js');
const https = require('https');

const BRAND_IMAGE_URL = 'https://cdn.discordapp.com/attachments/1436074247725383710/1470434524881096816/1770649288038.png?ex=6aa6121e&is=6aa4c09e&hm=fd54c47226a79c68d96f0df59ed485c756ad0a689cc0ad9c85133d1da69c540c&';

// Emoji IDs are loaded from the live FSMM server so the bot always uses the
// current custom emojis instead of stale/hard-coded IDs.
const emojiByName = new Map();
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = {
  candy: ['candy'],
  lava: ['lava'],
  galaxy: ['galaxy'],
  yinyang: ['yinyang', 'yinying', 'yin yang', 'yinyangbase'],
  radioactive: ['radioactive', 'radiation', 'radioactivebase'],
  cursed: ['cursed', 'crused', 'cursedbase'],
  rainbow: ['rainbow'],
  diamond: ['diamond'],
  divine: ['divine', 'divinebase'],
  cyber: ['cyber', 'cyberbase'],
  phantom: ['phantom', 'phantombase'],
  crystal: ['crystal', 'crystalbase']
};

function storeEmoji(emoji) {
  if (!emoji?.name || !emoji?.id) return;
  emojiByName.set(normalize(emoji.name), {
    id: emoji.id,
    name: emoji.name,
    animated: Boolean(emoji.animated)
  });
}

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
        for (const emoji of emojis) storeEmoji(emoji);
        console.log(`[FSMM] Loaded ${emojiByName.size} live server emojis`);
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
  const candidates = (aliases[key] || [key]).map(normalize);

  for (const candidate of candidates) {
    const emoji = emojiByName.get(candidate);
    if (emoji) return emoji;
  }

  for (const [name, emoji] of emojiByName) {
    if (candidates.some(candidate => name === candidate || name.includes(candidate) || candidate.includes(name))) {
      return emoji;
    }
  }

  return undefined;
}

// Middleman ticket branding/content.
const MIDDLEMAN_TITLE = '🗂️ {MIDDLE MAN SERVICE}';
const MIDDLEMAN_DESCRIPTION = `REQUEST A MIDDLE MAN FOR A - SMOOTH AND QUICK TRADE

**Our middlemen ensure both traders complete their side of the deal safely and fairly.**

- [📍](https://discord.com/assets/0da00b0fec31ced4.svg) When opening a ticket.

> * Wait for a middleman to claim your ticket. Do **not** ping middlemen.
>
> - Follow the middleman’s instructions carefully.
>
> - Vouch the middleman in the **Text⁠《✅》vouches** channel once the trade is done. <:emoji_49:1466347975562363003>`;

const originalSetTitle = EmbedBuilder.prototype.setTitle;
EmbedBuilder.prototype.setTitle = function(title) {
  if (title === '🎫 FSMM MIDDLEMAN TICKET') {
    this.__fsmmMiddlemanTicket = true;
    originalSetTitle.call(this, MIDDLEMAN_TITLE);
    return this.setImage(BRAND_IMAGE_URL);
  }
  return originalSetTitle.call(this, title);
};

const originalSetDescription = EmbedBuilder.prototype.setDescription;
EmbedBuilder.prototype.setDescription = function(description) {
  if (this.__fsmmMiddlemanTicket) return originalSetDescription.call(this, MIDDLEMAN_DESCRIPTION);
  return originalSetDescription.call(this, description);
};

const originalSetFooter = EmbedBuilder.prototype.setFooter;
EmbedBuilder.prototype.setFooter = function(data) {
  if (this.__fsmmMiddlemanTicket) {
    return originalSetFooter.call(this, { text: 'POWERED BY FSMM' });
  }
  if (data && typeof data === 'object' && typeof data.text === 'string' && (/^FSMM\s*[•|·-]\s*v?\d/i.test(data.text.trim()) || data.text.trim() === 'FSMM')) {
    return this.setImage(BRAND_IMAGE_URL);
  }
  return originalSetFooter.call(this, data);
};

// Patch select-menu options with the actual current server emoji IDs.
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

const originalToJSON = StringSelectMenuBuilder.prototype.toJSON;
StringSelectMenuBuilder.prototype.toJSON = function(...args) {
  const data = originalToJSON.apply(this, args);
  if (Array.isArray(data.options)) {
    data.options = data.options.map(option => {
      if (!option?.label || option.emoji) return option;
      const emoji = findEmoji(option.label);
      return emoji ? { ...option, emoji } : option;
    });
  }
  return data;
};

const originalLogin = Client.prototype.login;
Client.prototype.login = async function(...args) {
  const result = await originalLogin.apply(this, args);
  try {
    const guildId = process.env.GUILD_ID;
    const guild = guildId ? this.guilds.cache.get(guildId) : null;
    if (guild?.emojis?.cache) {
      for (const emoji of guild.emojis.cache.values()) storeEmoji(emoji);
      console.log(`[FSMM] Synced ${guild.emojis.cache.size} live guild emojis from cache`);
    }

    this.user?.setPresence({
      activities: [{ name: 'FSMM', type: ActivityType.Watching }],
      status: 'online'
    });
    console.log('[FSMM] Presence set to Watching FSMM');
  } catch (e) {
    console.error('[FSMM PRESENCE]', e.message);
  }
  return result;
};

loadGuildEmojis();
