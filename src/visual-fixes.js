const { EmbedBuilder } = require('discord.js');

// Canonical MediaWiki filenames used by the SAB Fandom file redirects.
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

const normalizeBaseName = value => String(value || '')
  .replace(/\.png$/i, '')
  .replace(/[_-]?Base$/i, '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

const originalSetImage = EmbedBuilder.prototype.setImage;
const originalSetTitle = EmbedBuilder.prototype.setTitle;

EmbedBuilder.prototype.setImage = function setImage(url) {
  if (typeof url === 'string' && url.includes('stealabrainrot.fandom.com/wiki/Special:Redirect/file/')) {
    try {
      const rawFile = decodeURIComponent(url).split('/file/').pop().split(/[?#]/)[0];
      const normalized = normalizeBaseName(rawFile);
      const base = Object.keys(BASE_FILES).find(name => normalizeBaseName(name) === normalized);
      if (base) {
        url = `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(BASE_FILES[base])}`;
      }
    } catch {
      // Keep the original URL if it cannot be parsed.
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

module.exports = { BASE_FILES };
