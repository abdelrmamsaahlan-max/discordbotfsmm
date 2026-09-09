const { EmbedBuilder } = require('discord.js');

// FSMM UI compatibility patch. Loaded before src/index.js so the existing
// bot flow stays intact while fixing external base preview URLs and making
// giveaway embeds easier to read.

const originalSetImage = EmbedBuilder.prototype.setImage;
EmbedBuilder.prototype.setImage = function setImagePatched(url) {
  if (typeof url === 'string' && url.includes('stealabrainrot.fandom.com/wiki/Special:Redirect/file/')) {
    const match = url.match(/\/file\/([^/?#]+)$/);
    if (match) {
      const decoded = decodeURIComponent(match[1]);
      const knownBase = decoded.replace(/Base\.png$/i, '').replace(/\s+/g, ' ').trim();
      if (knownBase) {
        const canonical = `${knownBase} Base.png`;
        url = `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(canonical)}`;
      }
    }
  }
  return originalSetImage.call(this, url);
};

const originalSetDescription = EmbedBuilder.prototype.setDescription;
EmbedBuilder.prototype.setDescription = function setDescriptionPatched(description) {
  if (this.data?.title === '🎉 FSMM GIVEAWAY' && typeof description === 'string') {
    const prize = description.match(/\*\*Prize:\*\*\s*([^\n]+)/)?.[1] || 'Not provided';
    const winners = description.match(/\*\*Winners:\*\*\s*([^\n]+)/)?.[1] || 'Not provided';
    const ends = description.match(/\*\*Ends:\*\*\s*([^\n]+)/)?.[1] || 'Not provided';

    originalSetDescription.call(this, '🎉 **FSMM GIVEAWAY**\n\nEnter using the button below. Good luck!');
    this.addFields(
      { name: '🎁 Prize', value: prize.slice(0, 1024), inline: false },
      { name: '🏆 Winners', value: winners, inline: true },
      { name: '👥 Entries', value: '0', inline: true },
      { name: '⏰ Ends', value: ends, inline: false },
    );
    return this;
  }
  return originalSetDescription.call(this, description);
};
