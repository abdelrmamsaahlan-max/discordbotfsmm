const { EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');

const FOOTER_ICON_URL = 'https://cdn.discordapp.com/attachments/1436074247725383710/1470434524881096816/1770649288038.png?ex=6aa6121e&is=6aa4c09e&hm=fd54c47226a79c68d96f0df59ed485c756ad0a689cc0ad9c85133d1da69c540c';

// Keep public embeds clean and use the FSMM artwork in every FSMM footer.
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

// Actual FSMM server base emojis.
// Select menus must use the emoji field instead of <:name:id> inside labels.
const BASE_EMOJIS = {
  cursed: { id: '1467657830202081367', name: 'crused' },
  rainbow: { id: '1467657664879136934', name: 'rainbow' },
  diamond: { id: '1467657568313806919', name: 'diamond' },
  lava: { id: '1467657736920764705', name: 'lava' },
  candy: { id: '1467657700958539968', name: 'candy' },
  galaxy: { id: '1467657768084443166', name: 'galaxy' },
  yinyang: { id: '1467657798363119832', name: 'yinying' }
};

const originalAddOptions = StringSelectMenuBuilder.prototype.addOptions;
const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const emojiForLabel = label => {
  const key = normalize(label);
  if (key === 'cursed') return BASE_EMOJIS.cursed;
  if (key === 'rainbow') return BASE_EMOJIS.rainbow;
  if (key === 'diamond') return BASE_EMOJIS.diamond;
  if (key === 'lava') return BASE_EMOJIS.lava;
  if (key === 'candy') return BASE_EMOJIS.candy;
  if (key === 'galaxy') return BASE_EMOJIS.galaxy;
  if (key === 'yinyang' || key === 'yinying') return BASE_EMOJIS.yinyang;
  return null;
};

StringSelectMenuBuilder.prototype.addOptions = function(...args) {
  const patch = option => {
    if (Array.isArray(option)) return option.map(patch);
    if (!option || typeof option !== 'object' || !option.label || option.emoji) return option;
    const emoji = emojiForLabel(option.label);
    return emoji ? { ...option, emoji } : option;
  };
  return originalAddOptions.apply(this, args.map(patch));
};
