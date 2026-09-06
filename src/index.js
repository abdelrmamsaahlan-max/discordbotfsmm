require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID environment variables.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if FSMM bot is online.'),
  new SlashCommandBuilder().setName('help').setDescription('Show FSMM bot features.'),
  new SlashCommandBuilder().setName('server-stats').setDescription('Show FSMM server statistics.'),
  new SlashCommandBuilder().setName('setup').setDescription('Create the FSMM bot setup panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(command => command.toJSON());

// Keep the bot on non-privileged intents for now. This avoids Discord's
// "Used disallowed intents" error and is enough for slash-command features.
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`Registered ${commands.length} slash commands.`);
}

client.once('ready', () => {
  console.log(`FSMM bot online as ${client.user.tag}`);
  client.user.setActivity('FSMM | Trading & Middleman', { type: 3 });
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    return interaction.reply({ content: `🏓 Pong! ${client.ws.ping}ms`, ephemeral: true });
  }

  if (interaction.commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('FSMM Bot')
      .setDescription('Your FSMM community assistant.')
      .addFields(
        { name: '🎫 Tickets', value: 'Trade, Middleman and Support tickets.' },
        { name: '🤝 Middleman', value: 'Request and manage safe trades.' },
        { name: '⭐ Vouches', value: 'Track trusted trade feedback.' },
        { name: '📊 Server', value: 'View server statistics.' }
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (interaction.commandName === 'server-stats') {
    const guild = interaction.guild;
    const embed = new EmbedBuilder()
      .setTitle('FSMM Server Stats')
      .addFields(
        { name: '👥 Members', value: String(guild.memberCount), inline: true },
        { name: '💬 Channels', value: String(guild.channels.cache.size), inline: true }
      );
    return interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'setup') {
    const embed = new EmbedBuilder()
      .setTitle('FSMM Bot Setup')
      .setDescription('Core bot is connected successfully. Ticket, Middleman, Vouch and logging modules will be added to this panel next.')
      .addFields(
        { name: 'Status', value: '🟢 Online', inline: true },
        { name: 'Server', value: interaction.guild.name, inline: true }
      );
    return interaction.reply({ embeds: [embed] });
  }
});

(async () => {
  try {
    await registerCommands();
    await client.login(TOKEN);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
