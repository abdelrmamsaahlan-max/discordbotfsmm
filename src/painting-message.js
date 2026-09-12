'use strict';

const { EmbedBuilder } = require('discord.js');

const PAINTING_MESSAGE = `> * **🎨 Available Base Paints**
Below are the bases currently available for painting:

* <:crused:1467657830202081367> Cursed base
* <:rainbow:1467657664879136934> Rainbow base
* <:diamond:1467657568313806919> Diamond base
* <:lava:1467657736920764705> Lava base
* <:candy:1467657700958539968> Candy base
* <:galaxy:1467657768084443166> Galaxy base
* <:yinying:1467657798363119832> Yin-Yang base

> * **📝 How to Use This Ticket**
Select the base you want to have painted.
Provide any details or preferences for the painting.
Wait for a staff member to claim your ticket.
Do not spam or rush the painter.

⚠️ **Important Notes**
Prices will be confirmed by staff before the painting begins.
Make sure you provide the correct base and details.
Be respectful and patient with the painting staff.
Staff have the final decision regarding painting requests.`;

const originalSetDescription = EmbedBuilder.prototype.setDescription;
EmbedBuilder.prototype.setDescription = function(description) {
  if (this.data?.title === '🎨 FSMM BASE PAINTING' || this.data?.title === '🎫 FSMM BASE-PAINTING TICKET') {
    return originalSetDescription.call(this, PAINTING_MESSAGE);
  }
  return originalSetDescription.call(this, description);
};
