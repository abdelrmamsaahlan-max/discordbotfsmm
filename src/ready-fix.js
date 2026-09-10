const { Client } = require('discord.js');

// Discord.js v14+ uses clientReady. Translate legacy ready registrations so
// older helper modules do not trigger the Node deprecation warning.
const originalOnce = Client.prototype.once;
Client.prototype.once = function (event, listener) {
  if (event === 'ready') event = 'clientReady';
  return originalOnce.call(this, event, listener);
};

const originalOn = Client.prototype.on;
Client.prototype.on = function (event, listener) {
  if (event === 'ready') event = 'clientReady';
  return originalOn.call(this, event, listener);
};

console.log('[FSMM READY] legacy ready listeners redirected to clientReady');
