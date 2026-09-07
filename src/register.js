require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID.');

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if the FSMM bot is online.'),
  new SlashCommandBuilder().setName('setup').setDescription('Create the three FSMM service panels.'),
  new SlashCommandBuilder().setName('ticket').setDescription('Open one of the FSMM services directly.')
    .addStringOption(o => o.setName('type').setDescription('Service').setRequired(true).addChoices(
      { name: 'Middleman', value: 'middleman' },
      { name: 'Support', value: 'support' },
      { name: 'Base Painting', value: 'basepainting' }
    ))
].map(c => c.toJSON());

(async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  console.log(`[FSMM] Registering ${commands.length} commands to guild ${GUILD_ID} for app ${CLIENT_ID}...`);
  const result = await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`[FSMM] Discord guild commands updated: ${result.map(c => `/${c.name}`).join(', ')}`);
})();
