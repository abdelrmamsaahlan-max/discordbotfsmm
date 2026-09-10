const { EmbedBuilder } = require('discord.js');

const originalSetFooter = EmbedBuilder.prototype.setFooter;
EmbedBuilder.prototype.setFooter = function setFooter(footer) {
  const text = typeof footer === 'string' ? footer : footer?.text;
  if (typeof text === 'string' && /\bv\d+(?:\.\d+){1,2}\b/i.test(text)) {
    return originalSetFooter.call(this, { text: 'FSMM' });
  }
  return originalSetFooter.call(this, footer);
};

console.log('[FSMM UI] version footers cleaned');
