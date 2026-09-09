const { SlashCommandBuilder } = require('discord.js');

module.exports = function setupGiveaways({ client, store, saveStore }) {
  store.giveaways ||= [];
  const command = new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Create an FSMM giveaway.')
    .toJSON();

  client.on('ready', () => {
    console.log('[FSMM] Giveaway system loaded.');
  });

  return command;
};
