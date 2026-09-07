require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID.');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if FSMM bot is online.'),
  new SlashCommandBuilder().setName('setup').setDescription('Create or refresh the FSMM ticket panel.'),
  new SlashCommandBuilder().setName('ticket').setDescription('Open an FSMM ticket.')
    .addStringOption(o => o.setName('type').setDescription('Ticket type').setRequired(true).addChoices(
      { name: 'Trade', value: 'trade' }, { name: 'Middleman', value: 'middleman' }, { name: 'Support', value: 'support' }))
];

let config = { panelChannelId: null, categoryId: null, staffRoleId: null, mmRoleId: null };

function mainEmbed() {
  return new EmbedBuilder()
    .setTitle('FSMM • TICKETS')
    .setDescription('Choose the service you need from the menu below.\n\n🔒 Tickets are private and handled by the FSMM team.\n\n⚠️ Never share passwords, tokens, or recovery codes.')
    .addFields(
      { name: '🤝 Middleman', value: 'Request a trusted middleman and choose your trade value.', inline: true },
      { name: '🎫 Trade', value: 'Open a private trade ticket.', inline: true },
      { name: '🛟 Support', value: 'Get help from FSMM staff.', inline: true }
    )
    .setFooter({ text: 'FSMM • Steal a Brainrot Trading' });
}
function serviceMenu() {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('service_menu').setPlaceholder('🎫 Choose a ticket type').addOptions(
    { label: 'Middleman', value: 'middleman', description: 'Request a trusted FSMM middleman', emoji: '🤝' },
    { label: 'Trade', value: 'trade', description: 'Open a private trade ticket', emoji: '🎫' },
    { label: 'Support', value: 'support', description: 'Get help from FSMM staff', emoji: '🛟' }
  ));
}
function middlemanMenu() {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('mm_value_menu').setPlaceholder('💰 Choose your trade value').addOptions(
    { label: '10M - 250M', value: '10M - 250M', description: 'Trades from 10M to 250M', emoji: '💰' },
    { label: '250M - 500M', value: '250M - 500M', description: 'Trades from 250M to 500M', emoji: '💰' },
    { label: '1B+', value: '1B+', description: 'Trades worth 1B or more', emoji: '💎' },
    { label: 'OG', value: 'OG', description: 'OG middleman service', emoji: '⭐' }
  ));
}
async function ensureChannels(guild) {
  let category = config.categoryId ? guild.channels.cache.get(config.categoryId) : null;
  if (!category) { category = await guild.channels.create({ name: 'FSMM TICKETS', type: ChannelType.GuildCategory }); config.categoryId = category.id; }
  let staff = config.staffRoleId ? guild.roles.cache.get(config.staffRoleId) : null;
  if (!staff) { staff = await guild.roles.create({ name: 'FSMM Staff', reason: 'FSMM ticket system' }); config.staffRoleId = staff.id; }
  let mm = config.mmRoleId ? guild.roles.cache.get(config.mmRoleId) : null;
  if (!mm) { mm = await guild.roles.create({ name: 'FSMM Middleman', reason: 'FSMM ticket system' }); config.mmRoleId = mm.id; }
  return { category, staff, mm };
}
async function createTicket(interaction, type, value = null, details = null) {
  const { category, staff, mm } = await ensureChannels(interaction.guild);
  const name = `${type === 'middleman' ? 'mm' : type}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90);
  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];
  if (type === 'middleman') overwrites.push({ id: mm.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
  const channel = await interaction.guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id, permissionOverwrites: overwrites });
  const embed = new EmbedBuilder().setTitle(type === 'middleman' ? '🤝 MIDDLEMAN SERVICE' : `🎫 ${type.toUpperCase()} TICKET`).setDescription(type === 'middleman' ? '**A trusted FSMM middleman will help keep the trade organized.**' : 'Please explain what you need help with.').addFields({ name: 'Owner', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Type', value: type, inline: true });
  if (value) embed.addFields({ name: '💰 Trade Value', value, inline: true });
  if (details) embed.addFields({ name: '👤 Other Trader', value: details.other }, { name: '🔄 Trade', value: details.trade }, { name: '🎁 Tip', value: details.tip });
  const close = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
  await channel.send({ content: type === 'middleman' ? `<@${interaction.user.id}> <@&${mm.id}>` : `<@${interaction.user.id}>`, embeds: [embed], components: [close] });
  return interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
}
async function showMiddlemanModal(interaction, value) {
  const modal = new ModalBuilder().setCustomId(`mm_modal:${value}`).setTitle('Middleman Request');
  const other = new TextInputBuilder().setCustomId('other').setLabel('Other trader username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
  const trade = new TextInputBuilder().setCustomId('trade').setLabel('What is the trade?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
  const tip = new TextInputBuilder().setCustomId('tip').setLabel('What are you tipping?').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500);
  modal.addComponents(new ActionRowBuilder().addComponents(other), new ActionRowBuilder().addComponents(trade), new ActionRowBuilder().addComponents(tip));
  return interaction.showModal(modal);
}
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands.map(c => c.toJSON()) });
  console.log(`FSMM online as ${client.user.tag}`);
});
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ping') return interaction.reply({ content: '🏓 Pong! FSMM is online.', ephemeral: true });
      if (interaction.commandName === 'setup') {
        await ensureChannels(interaction.guild);
        let panel = config.panelChannelId ? interaction.guild.channels.cache.get(config.panelChannelId) : null;
        if (!panel) { panel = await interaction.guild.channels.create({ name: 'fsmm-ticket-panel', type: ChannelType.GuildText }); config.panelChannelId = panel.id; }
        const messages = await panel.messages.fetch({ limit: 100 });
        for (const m of messages.filter(m => m.author.id === client.user.id).values()) await m.delete().catch(() => {});
        await panel.send({ embeds: [mainEmbed()], components: [serviceMenu()] });
        return interaction.reply({ content: `✅ FSMM ticket panel reset in ${panel}.`, ephemeral: true });
      }
      if (interaction.commandName === 'ticket') return createTicket(interaction, interaction.options.getString('type'));
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'service_menu') {
        const choice = interaction.values[0];
        if (choice === 'middleman') return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🤝 MIDDLEMAN SERVICE').setDescription('Choose your trade value below.')], components: [middlemanMenu()], ephemeral: true });
        return createTicket(interaction, choice);
      }
      if (interaction.customId === 'mm_value_menu') return showMiddlemanModal(interaction, interaction.values[0]);
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('mm_modal:')) {
      const value = interaction.customId.slice('mm_modal:'.length);
      return createTicket(interaction, 'middleman', value, {
        other: interaction.fields.getTextInputValue('other'),
        trade: interaction.fields.getTextInputValue('trade'),
        tip: interaction.fields.getTextInputValue('tip') || 'Not specified'
      });
    }
    if (interaction.isButton() && interaction.customId === 'close_ticket') {
      if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({ content: '❌ Only staff can close tickets.', ephemeral: true });
      await interaction.reply({ content: '🔒 Closing ticket...' });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 1500);
    }
  } catch (e) {
    console.error(e);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Something went wrong. Check Railway logs.', ephemeral: true }).catch(() => {});
  }
});
client.login(TOKEN);
