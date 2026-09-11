const { EmbedBuilder } = require('discord.js');

// Keep public embeds clean. Internal bot versioning stays in logs/package metadata,
// never in user-facing embed footers.
const originalSetFooter = EmbedBuilder.prototype.setFooter;
EmbedBuilder.prototype.setFooter = function(data) {
  if (data && typeof data === 'object' && typeof data.text === 'string' && /^FSMM\s*[•|·-]\s*v?\d/i.test(data.text.trim())) {
    return originalSetFooter.call(this, { ...data, text: 'FSMM' });
  }
  return originalSetFooter.call(this, data);
};
