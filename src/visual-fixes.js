const { EmbedBuilder } = require('discord.js');

// Discord cannot render the old guessed Fandom filenames used by the bot.
// Normalize all ten mutation-base previews to the canonical MediaWiki names.
const BASE_FILES = {
  Candy: 'Candy_Base.png',
  Lava: 'Lava_Base.png',
  Galaxy: 'Galaxy_Base.png',
  'Yin Yang': 'Yin_Yang_Base.png',
  Radioactive: 'Radioactive_Base.png',
  Cursed: 'Cursed_Base.png',
  Divine: 'Divine_Base.png',
  Cyber: 'Cyber_Base.png',
  Phantom: 'Phantom_Base.png',
  Crystal: 'Crystal_Base.png',
};

const originalSetImage = EmbedBuilder.prototype.setImage;
const originalSetDescription = EmbedBuilder.prototype.setDescription;
const originalSetTitle = EmbedBuilder.prototype.setTitle;

EmbedBuilder.prototype.setImage = function setImage(url) {
  if (typeof url === 'string' && url.includes('stealabrainrot.fandom.com/wiki/Special:Redirect/file/')) {
    const match = decodeURIComponent(url).match(/\/file\/([^/?#]+)$/i);
    if (match) {
      const oldName = match[1].replace(/Base\.png$/i, '').replace(/[_-]+/g, ' ').trim();
      const base = Object.keys(BASE_FILES).find((name) => name.toLowerCase() === oldName.toLowerCase());
      if (base) {
        url = `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(BASE_FILES[base])}`;
      }
    }
  }
  return originalSetImage.call(this, url);
};

EmbedBuilder.prototype.setTitle = function setTitle(title) {
  const result = originalSetTitle.call(this, title);
  if (typeof title === 'string' && title.includes('FSMM GIVEAWAY')) {
    this.setColor(0x8b5cf6);
    this.setTimestamp();
  }
  return result;
};

EmbedBuilder.prototype.setDescription = function setDescription(description) {
  if (typeof description === 'string' && this.data?.title?.includes('FSMM GIVEAWAY')) {
    const text = description.trim();

    // Keep ended giveaways readable and preserve their existing entry count.
    if (this.data.title === '🎉 FSMM GIVEAWAY' && !text.includes('FSMM GIVEAWAY EVENT')) {
      const prize = text.match(/\*\*Prize:\*\*\s*([^\n]+)/)?.[1] || 'Not provided';
      const winners = text.match(/\*\*Winners:\*\*\s*([^\n]+)/)?.[1] || 'Not provided';
      const ends = text.match(/\*\*Ends:\*\*\s*([^\n]+)/)?.[1] || 'Not provided';

      description = '━━━━━━━━━━━━━━━━━━━━\n🎉 **FSMM GIVEAWAY EVENT**\n━━━━━━━━━━━━━━━━━━━━\n\nEnter using the button below. Good luck!';
      originalSetDescription.call(this, description);
      this.addFields(
        { name: '🎁 Prize', value: prize.slice(0, 1024), inline: false },
        { name: '🏆 Winners', value: winners, inline: true },
        { name: '👥 Entries', value: '0', inline: true },
        { name: '⏰ Ends', value: ends, inline: false },
      );
      return this;
    }
  }
  return originalSetDescription.call(this, description);
};

module.exports = { BASE_FILES };
