'use strict';

const { EmbedBuilder } = require('discord.js');

const INDEX_TICKET_MESSAGE = `Welcome to the Index Ticket. This ticket is used to request the full index bases.\n\n> * **📦 Available Bases & Prices**\nBelow are the bases currently available for indexing. Prices are listed per base:\n\n* <:crused:1467657830202081367> Cursed base — Price: [5-6 GARAMAS]\n* <:rainbow:1467657664879136934> Rainbow base — Price: [9-10 GARAMAS]\n* <:diamond:1467657568313806919> Diamond base — Price: [9 GARAMAS]\n* <:lava:1467657736920764705> Lava base — Price: [2-3 GARAMAS]\n* <:candy:1467657700958539968> Candy base — Price [1-2 GARAMAS]\n* <:galaxy:1467657768084443166> Galaxy base — price [3 GARAMAS]\n* <:yinying:1467657798363119832> Ying-yang base — price [4 GARAMAS]\n\n> * **📝 How to Use This Ticket**\nState which base you want to index.\nConfirm you agree to the listed price.\nProvide clear proof (screenshots or video).\nDo not rush or spam messages.\n\n⚠️ Important Notes\nFake or edited payment will result in denial.\nPrices are final once indexing begins.\nBe respectful and patient with index staff.\nIndex staff have the final decision.`;

const originalSetDescription = EmbedBuilder.prototype.setDescription;
EmbedBuilder.prototype.setDescription = function(description) {
  if (this.data?.title === '🎨 FSMM BASE PAINTING') {
    return originalSetDescription.call(this, INDEX_TICKET_MESSAGE);
  }
  return originalSetDescription.call(this, description);
};
