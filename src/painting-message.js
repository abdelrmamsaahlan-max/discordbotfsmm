'use strict';

const { EmbedBuilder } = require('discord.js');

const INDEX_TICKET_MESSAGE = `Welcome to the Index Ticket. This ticket is used to request the full index bases.

> * **📦 Available Bases & Prices**
Below are the bases currently available for indexing. Prices are listed per base:

* <:crused:1467657830202081367> Cursed base — Price: [5-6 GARAMAS]
* <:rainbow:1467657664879136934> Rainbow base — Price: [9-10 GARAMAS]
* <:diamond:1467657568313806919> Diamond base — Price: [9 GARAMAS]
* <:lava:1467657736920764705> Lava base — Price: [2-3 GARAMAS]
* <:candy:1467657700958539968> Candy base — Price [1-2 GARAMAS]
* <:galaxy:1467657768084443166> Galaxy base — price [3 GARAMAS]
* <:yinying:1467657798363119832> Ying-yang base — price [4 GARAMAS]

> * **📝 How to Use This Ticket**
State which base you want to index.
Confirm you agree to the listed price.
Provide clear proof (screenshots or video).
Do not rush or spam messages.

⚠️ Important Notes
Fake or edited payment will result in denial.
Prices are final once indexing begins.
Be respectful and patient with index staff.
Index staff have the final decision.`;

const originalSetDescription = EmbedBuilder.prototype.setDescription;
EmbedBuilder.prototype.setDescription = function(description) {
  if (this.data?.title === '🎨 FSMM BASE PAINTING' || this.data?.title === '🎫 FSMM BASE-PAINTING TICKET') {
    return originalSetDescription.call(this, INDEX_TICKET_MESSAGE);
  }
  return originalSetDescription.call(this, description);
};
