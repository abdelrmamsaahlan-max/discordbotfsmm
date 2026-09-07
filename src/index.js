require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Missing required environment variables.');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if the FSMM bot is online.'),
  new SlashCommandBuilder().setName('setup').setDescription('Create the NEW FSMM ticket system.'),
  new SlashCommandBuilder().setName('ticket').setDescription('Open a ticket directly.')
    .addStringOption(o => o.setName('type').setDescription('Ticket type').setRequired(true).addChoices(
      { name: 'Middleman', value: 'middleman' },
      { name: 'Trade', value: 'trade' },
      { name: 'Support', value: 'support' }
    ))
];

const STAFF_ROLE = 'FSMM Staff';
const MM_ROLE = 'FSMM Middleman';
const CATEGORY = '🎫 FSMM TICKETS';
const PANEL = '🎫・ticket-center';

function panelEmbed() {
  return new EmbedBuilder()
    .setTitle('FSMM TICKET CENTER')
    .setDescription('**Need help with a trade?**\n\nUse the menu below to open the service you need. Each ticket is private and only visible to you and the FSMM team.\n\n**Available Services**\n🤝 **Middleman** — secure your trade with an FSMM middleman\n💱 **Trade** — open a private trade request\n🛟 **Support** — contact FSMM staff\n\n> 🔐 Never share passwords, tokens, or recovery codes.')
    .setFooter({ text: 'FSMM • Trusted Trading' });
}

function mainMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('new_service_menu')
      .setPlaceholder('Select a service...')
      .addOptions(
        { label: 'Middleman', value: 'middleman', description: 'Request a trusted middleman', emoji: '🤝' },
        { label: 'Trade', value: 'trade', description: 'Open a private trade ticket', emoji: '💱' },
        { label: 'Support', value: 'support', description: 'Get help from FSMM staff', emoji: '🛟' }
      )
  );
}

function valueMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('new_mm_value')
      .setPlaceholder('Select your trade value...')
      .addOptions(
        { label: '10M - 250M', value: '10M - 250M', description: 'Trade value between 10M and 250M', emoji: '💰' },
        { label: '250M - 500M', value: '250M - 500M', description: 'Trade value between 250M and 500M', emoji: '💰' },
        { label: '1B+', value: '1B+', description: 'Trade value of 1B or more', emoji: '💎' },
        { label: 'OG', value: 'OG', description: 'OG middleman request', emoji: '⭐' }
      )
  );
}

async function getRolesAndCategory(guild) {
  let staff = guild.roles.cache.find(r => r.name === STAFF_ROLE);
  if (!staff) staff = await guild.roles.create({ name: STAFF_ROLE, reason: 'FSMM ticket system' });
  let mm = guild.roles.cache.find(r => r.name === MM_ROLE);
  if (!mm) mm = await guild.roles.create({ name: MM_ROLE, reason: 'FSMM ticket system' });
  let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === CATEGORY);
  if (!category) category = await guild.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory, reason: 'FSMM ticket system' });
  return { staff, mm, category };
}

async function createTicket(interaction, type, value, details = {}) {
  const { staff, mm, category } = await getRolesAndCategory(interaction.guild);
  const prefix = type === 'middleman' ? 'mm' : type;
  const baseName = `${prefix}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 70) || `${prefix}-ticket`;
  const existing = interaction.guild.channels.cache.find(c => c.parentId === category.id && c.topic === `FSMM_OWNER:${interaction.user.id}`);
  if (existing) return interaction.reply({ content: `⚠️ You already have an open ticket: ${existing}`, ephemeral: true });

  const overwrites = [
    { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
  ];
  if (type === 'middleman') overwrites.push({ id: mm.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });

  const channel = await interaction.guild.channels.create({
    name: baseName,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `FSMM_OWNER:${interaction.user.id}`,
    permissionOverwrites: overwrites
  });

  const embed = new EmbedBuilder()
    .setTitle(type === 'middleman' ? '🤝 MIDDLEMAN REQUEST' : `🎫 ${type.toUpperCase()} REQUEST`)
    .setDescription(type === 'middleman' ? 'A member of the FSMM Middleman team will assist with your trade.' : 'Please describe what you need and a member of FSMM staff will help you.')
    .addFields(
      { name: '👤 Requester', value: `<@${interaction.user.id}>`, inline: true },
      { name: '📌 Service', value: type === 'middleman' ? 'Middleman' : type, inline: true }
    );
  if (value) embed.addFields({ name: '💰 Trade Value', value, inline: true });
  if (details.other) embed.addFields({ name: '👤 Other Trader', value: details.other, inline: false });
  if (details.trade) embed.addFields({ name: '🔄 Trade Details', value: details.trade, inline: false });
  if (details.tip) embed.addFields({ name: '🎁 Tip', value: details.tip, inline: false });

  const closeRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('new_close_ticket').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: type === 'middleman' ? `<@${interaction.user.id}> <@&${mm.id}>` : `<@${interaction.user.id}>`,
    embeds: [embed],
    components: [closeRow]
  });
  return interaction.reply({ content: `✅ Your ticket is ready: ${channel}`, ephemeral: true });
}

function middlemanModal(value) {
  const modal = new ModalBuilder().setCustomId(`new_mm_modal:${value}`).setTitle('FSMM Middleman Request');
  const other = new TextInputBuilder().setCustomId('other').setLabel('Other trader username').setPlaceholder('Roblox / Discord username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
  const trade = new TextInputBuilder().setCustomId('trade').setLabel('What are you trading?').setPlaceholder('Tell us what both sides are trading').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
  const tip = new TextInputBuilder().setCustomId('tip').setLabel('Tip (optional)').setPlaceholder('Example: 1M / 2% / Not sure').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100);
  modal.addComponents(new ActionRowBuilder().addComponents(other), new ActionRowBuilder().addComponents(trade), new ActionRowBuilder().addComponents(tip));
  return modal;
}

async function resetPanel(guild) {
  const { category } = await getRolesAndCategory(guild);
  const oldPanels = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && (c.name === 'fsmm-ticket-panel' || c.name === PANEL || c.name === 'ticket-center'));
  for (const ch of oldPanels.values()) {
    await ch.delete('Replace old FSMM ticket panel with new system').catch(() => {});
  }
  const channel = await guild.channels.create({
    name: PANEL,
    type: ChannelType.GuildText,
    topic: 'FSMM NEW TICKET CENTER',
    reason: 'FSMM new ticket system'
  });
  await channel.send({ embeds: [panelEmbed()], components: [mainMenu()] });
  return channel;
}

client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands.map(c => c.toJSON()) });
  console.log(`FSMM NEW SYSTEM ONLINE AS ${client.user.tag}`);
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ping') return interaction.reply({ content: '🏓 FSMM NEW SYSTEM IS ONLINE.', ephemeral: true });
      if (interaction.commandName === 'setup') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ You need Manage Server to run setup.', ephemeral: true });
        const panel = await resetPanel(interaction.guild);
        return interaction.reply({ content: `✅ OLD PANEL DELETED. NEW TICKET CENTER CREATED: ${panel}`, ephemeral: true });
      }
      if (interaction.commandName === 'ticket') {
        const type = interaction.options.getString('type');
        if (type === 'middleman') return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🤝 MIDDLEMAN').setDescription('Choose the total trade value below.')], components: [valueMenu()], ephemeral: true });
        return createTicket(interaction, type);
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'new_service_menu') {
        const choice = interaction.values[0];
        if (choice === 'middleman') return interaction.reply({ embeds: [new EmbedBuilder().setTitle('🤝 MIDDLEMAN SERVICE').setDescription('First, choose the total value of your trade.')], components: [valueMenu()], ephemeral: true });
        return createTicket(interaction, choice);
      }
      if (interaction.customId === 'new_mm_value') return interaction.showModal(middlemanModal(interaction.values[0]));
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('new_mm_modal:')) {
      const value = interaction.customId.slice('new_mm_modal:'.length);
      return createTicket(interaction, 'middleman', value, {
        other: interaction.fields.getTextInputValue('other'),
        trade: interaction.fields.getTextInputValue('trade'),
        tip: interaction.fields.getTextInputValue('tip') || 'Not specified'
      });
    }

    if (interaction.isButton() && interaction.customId === 'new_close_ticket') {
      const canClose = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) || interaction.member.roles.cache.some(r => r.name === STAFF_ROLE);
      if (!canClose) return interaction.reply({ content: '❌ Only FSMM staff can close tickets.', ephemeral: true });
      await interaction.reply({ content: '🔒 Closing ticket...' });
      setTimeout(() => interaction.channel.delete('FSMM ticket closed').catch(() => {}), 1200);
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Something went wrong. Check the bot logs.', ephemeral: true }).catch(() => {});
  }
});

client.login(TOKEN);
