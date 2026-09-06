require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const VOUCH_CHANNEL_ID = '1466095232281088185';

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID.');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const defaults = {
  config: { ownerRoleId: null, ticketCategoryId: null, logChannelId: null, mmRoleId: null, staffRoleId: null, panelChannelId: null, vouchChannelId: VOUCH_CHANNEL_ID },
  users: {}, vouches: [], tickets: {}, warnings: {}
};

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return structuredClone(defaults);
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { ...structuredClone(defaults), ...saved, config: { ...defaults.config, ...(saved.config || {}) } };
  } catch (e) {
    console.error('Store load failed:', e);
    return structuredClone(defaults);
  }
}
let store = loadStore();
function saveStore() { try { fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2)); } catch (e) { console.error('Store save failed:', e); } }
function profileFor(id) {
  if (!store.users[id]) store.users[id] = { trades: 0, vouches: 0, ratingTotal: 0 };
  return store.users[id];
}
function isOwner(member) { return Boolean(member && store.config.ownerRoleId && member.roles?.cache.has(store.config.ownerRoleId)); }
function isStaff(member) { return Boolean(member && (member.permissions.has(PermissionFlagsBits.ManageGuild) || (store.config.staffRoleId && member.roles.cache.has(store.config.staffRoleId)) || isOwner(member))); }

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if FSMM bot is online.'),
  new SlashCommandBuilder().setName('help').setDescription('Show FSMM bot features.'),
  new SlashCommandBuilder().setName('server-stats').setDescription('Show FSMM server statistics.'),
  new SlashCommandBuilder().setName('setup').setDescription('Create the complete FSMM system.'),
  new SlashCommandBuilder().setName('profile').setDescription('View an FSMM profile.').addUserOption(o => o.setName('user').setDescription('Select any member').setRequired(false)),
  new SlashCommandBuilder().setName('vouch').setDescription('Leave a trade vouch.').addUserOption(o => o.setName('user').setDescription('User you traded with').setRequired(true)).addIntegerOption(o => o.setName('rating').setDescription('Rating 1-5').setMinValue(1).setMaxValue(5).setRequired(true)).addStringOption(o => o.setName('comment').setDescription('Feedback').setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('warnings').setDescription('View warning count.').addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('ticket').setDescription('Open an FSMM ticket.').addStringOption(o => o.setName('type').setDescription('Ticket type').setRequired(true).addChoices({ name: 'Trade', value: 'trade' }, { name: 'Middleman', value: 'middleman' }, { name: 'Support', value: 'support' }))
].map(c => c.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log(`Registered ${commands.length} slash commands.`);
}

function panelEmbed() {
  return new EmbedBuilder().setTitle('FSMM • Trading Center').setDescription('**Welcome to FSMM.**\nChoose a service below. Tickets are private and handled by the appropriate FSMM team.\n\n⚠️ **Safety:** Never share passwords, bot tokens, recovery codes, or private account information.').addFields(
    { name: '🎫 Trade', value: 'Open a private trade ticket.', inline: true },
    { name: '🤝 Middleman', value: 'Request an FSMM middleman.', inline: true },
    { name: '🛟 Support', value: 'Get help from staff.', inline: true },
    { name: '⭐ Reputation', value: 'Use `/profile @user` to view a profile and `/vouch @user` to leave feedback.', inline: false }
  ).setFooter({ text: 'FSMM • Steal a Brainrot Trading' });
}
function panelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_trade').setLabel('Trade Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ticket_mm').setLabel('Middleman').setEmoji('🤝').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ticket_support').setLabel('Support').setEmoji('🛟').setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('vouch_modal').setLabel('Leave Vouch').setEmoji('⭐').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('server_stats').setLabel('Server Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary)
    )
  ];
}
async function sendLog(guild, text) {
  const ch = store.config.logChannelId ? guild.channels.cache.get(store.config.logChannelId) : null;
  if (ch?.isTextBased()) await ch.send({ embeds: [new EmbedBuilder().setDescription(text).setFooter({ text: 'FSMM Logs' })] }).catch(() => {});
}

async function ensureSetup(guild) {
  let ownerRole = store.config.ownerRoleId ? guild.roles.cache.get(store.config.ownerRoleId) : null;
  if (!ownerRole) {
    ownerRole = await guild.roles.create({ name: 'FSMM Owners', reason: 'FSMM owner control role' });
    store.config.ownerRoleId = ownerRole.id;
  }
  const ownerMember = await guild.members.fetch(guild.ownerId).catch(() => null);
  if (ownerMember && !ownerMember.roles.cache.has(ownerRole.id)) await ownerMember.roles.add(ownerRole).catch(() => {});

  let category = store.config.ticketCategoryId ? guild.channels.cache.get(store.config.ticketCategoryId) : null;
  if (!category) { category = await guild.channels.create({ name: 'FSMM TICKETS', type: ChannelType.GuildCategory }); store.config.ticketCategoryId = category.id; }
  let staffRole = store.config.staffRoleId ? guild.roles.cache.get(store.config.staffRoleId) : null;
  if (!staffRole) { staffRole = await guild.roles.create({ name: 'FSMM Staff', reason: 'FSMM bot setup' }); store.config.staffRoleId = staffRole.id; }
  let mmRole = store.config.mmRoleId ? guild.roles.cache.get(store.config.mmRoleId) : null;
  if (!mmRole) { mmRole = await guild.roles.create({ name: 'FSMM Middleman', reason: 'FSMM bot setup' }); store.config.mmRoleId = mmRole.id; }
  let logs = store.config.logChannelId ? guild.channels.cache.get(store.config.logChannelId) : null;
  if (!logs) { logs = await guild.channels.create({ name: 'fsmm-logs', type: ChannelType.GuildText }); store.config.logChannelId = logs.id; }
  let panel = store.config.panelChannelId ? guild.channels.cache.get(store.config.panelChannelId) : null;
  if (!panel) { panel = await guild.channels.create({ name: 'fsmm-ticket-panel', type: ChannelType.GuildText }); store.config.panelChannelId = panel.id; await panel.send({ embeds: [panelEmbed()], components: panelRows() }); }
  store.config.vouchChannelId = VOUCH_CHANNEL_ID;
  saveStore();
  return { ownerRole, category, staffRole, mmRole, logs, panel };
}

async function createTicket(interaction, type) {
  if (!interaction.deferred && !interaction.replied) await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;
  const existing = Object.values(store.tickets).find(t => t.guildId === guild.id && t.userId === interaction.user.id && t.open);
  if (existing) { const ch = guild.channels.cache.get(existing.channelId); return interaction.editReply({ content: `❌ You already have an open ticket: ${ch || 'your ticket'}` }); }
  const setup = await ensureSetup(guild);
  const safeName = `${type}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 70) || `${type}-ticket`;
  const channel = await guild.channels.create({
    name: safeName, type: ChannelType.GuildText, parent: setup.category.id,
    topic: `FSMM ${type} ticket • owner ${interaction.user.id}`,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: setup.staffRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: setup.ownerRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ]
  });
  if (type === 'middleman') await channel.permissionOverwrites.create(setup.mmRole.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  store.tickets[channel.id] = { guildId: guild.id, userId: interaction.user.id, type, open: true, createdAt: Date.now() };
  profileFor(interaction.user.id); saveStore();
  const icon = type === 'middleman' ? '🤝' : type === 'trade' ? '🎫' : '🛟';
  const embed = new EmbedBuilder().setTitle(`${icon} FSMM ${type[0].toUpperCase() + type.slice(1)} Ticket`).setDescription(`Welcome <@${interaction.user.id}>!\n\nPlease explain your request clearly. The FSMM team will help you here.\n\n**Safety:** FSMM staff will never ask for your Discord password, bot token, or recovery code.`).addFields({ name: 'Owner', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Type', value: type, inline: true });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`close_ticket:${channel.id}`).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Your ${type} ticket is ready: ${channel}` });
  await sendLog(guild, `🎫 Ticket opened by <@${interaction.user.id}> • **${type}** • ${channel}`);
}

async function closeTicket(interaction, channelId) {
  const t = store.tickets[channelId];
  if (!t?.open) return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true });
  if (interaction.user.id !== t.userId && !isStaff(interaction.member)) return interaction.reply({ content: '❌ Only the ticket owner, staff, or owner can close this ticket.', ephemeral: true });
  t.open = false; t.closedAt = Date.now(); saveStore();
  await sendLog(interaction.guild, `🔒 Ticket closed by <@${interaction.user.id}> • <#${channelId}>`);
  await interaction.reply({ content: '🔒 Ticket closed. This channel will be deleted in 5 seconds.' });
  setTimeout(() => interaction.channel.delete('FSMM ticket closed').catch(() => {}), 5000);
}

async function showProfile(interaction, user) {
  const p = profileFor(user.id);
  const avg = p.vouches ? (p.ratingTotal / p.vouches).toFixed(1) : 'N/A';
  const recent = store.vouches.filter(v => v.to === user.id).slice(-5).reverse();
  const recentText = recent.length ? recent.map(v => `⭐ ${v.rating}/5 — ${v.comment.slice(0, 90)} • <@${v.from}>`).join('\n') : 'No vouches yet.';
  return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${user.username} • FSMM Profile`).setThumbnail(user.displayAvatarURL()).setDescription(`**Member:** <@${user.id}>\n**Reputation:** ${avg === 'N/A' ? 'No rating yet' : `${avg}/5`}`).addFields(
    { name: '⭐ Vouches', value: String(p.vouches), inline: true },
    { name: '🌟 Rating', value: avg === 'N/A' ? avg : `${avg}/5`, inline: true },
    { name: '🤝 Recorded Trades', value: String(p.trades), inline: true },
    { name: '📝 Recent Vouches', value: recentText.slice(0, 1024) }
  ).setFooter({ text: 'FSMM Reputation System' })] });
}

async function postVouch(guild, vouch, targetUser) {
  const ch = guild.channels.cache.get(VOUCH_CHANNEL_ID);
  if (!ch?.isTextBased()) { console.log(`Vouch channel ${VOUCH_CHANNEL_ID} not found or not text based.`); return; }
  const stars = '⭐'.repeat(vouch.rating) + '☆'.repeat(5 - vouch.rating);
  const embed = new EmbedBuilder().setTitle('⭐ New FSMM Vouch').setDescription(`**${targetUser.username}** received a new vouch.`).addFields(
    { name: 'Trader', value: `<@${vouch.from}>`, inline: true },
    { name: 'Received By', value: `<@${vouch.to}>`, inline: true },
    { name: 'Rating', value: `${stars} **${vouch.rating}/5**`, inline: true },
    { name: 'Feedback', value: vouch.comment || 'No comment' }
  ).setThumbnail(targetUser.displayAvatarURL()).setTimestamp(vouch.createdAt).setFooter({ text: 'FSMM • Verified Trade Reputation' });
  await ch.send({ embeds: [embed] }).catch(e => console.error('Vouch channel send failed:', e.message));
}

async function addVouch(interaction, user, rating, comment) {
  if (user.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot vouch yourself.', ephemeral: true });
  const target = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!target) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true });
  const p = profileFor(user.id);
  p.vouches++; p.ratingTotal += rating;
  const vouch = { from: interaction.user.id, to: user.id, rating, comment, createdAt: Date.now() };
  store.vouches.push(vouch); saveStore();
  await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⭐ Vouch Added').setDescription(`<@${interaction.user.id}> vouched for <@${user.id}>\n\n**Rating:** ${'⭐'.repeat(rating)}\n**Feedback:** ${comment}`)] });
  await postVouch(interaction.guild, vouch, user);
  await sendLog(interaction.guild, `⭐ <@${interaction.user.id}> vouched for <@${user.id}> • ${rating}/5`);
}

async function showStats(interaction) {
  const guild = interaction.guild;
  const openTickets = Object.values(store.tickets).filter(t => t.guildId === guild.id && t.open).length;
  return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 FSMM Server Stats').addFields(
    { name: '👥 Members', value: String(guild.memberCount), inline: true },
    { name: '💬 Channels', value: String(guild.channels.cache.size), inline: true },
    { name: '🎫 Open Tickets', value: String(openTickets), inline: true },
    { name: '⭐ Total Vouches', value: String(store.vouches.length), inline: true }
  )] });
}

client.once('ready', () => {
  console.log(`FSMM bot online as ${client.user.tag}`);
  client.user.setActivity('FSMM | Trading & Middleman', { type: 3 });
});
client.on('error', err => console.error('Discord client error:', err));

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === 'ticket_trade') return createTicket(interaction, 'trade');
      if (interaction.customId === 'ticket_mm') return createTicket(interaction, 'middleman');
      if (interaction.customId === 'ticket_support') return createTicket(interaction, 'support');
      if (interaction.customId === 'server_stats') return showStats(interaction);
      if (interaction.customId === 'vouch_modal') {
        const modal = new ModalBuilder().setCustomId('vouch_form').setTitle('FSMM Vouch');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('User ID you traded with').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rating').setLabel('Rating 1-5').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('comment').setLabel('Trade feedback').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500))
        );
        return interaction.showModal(modal);
      }
      if (interaction.customId.startsWith('close_ticket:')) return closeTicket(interaction, interaction.customId.split(':')[1]);
    }

    if (interaction.isModalSubmit() && interaction.customId === 'vouch_form') {
      const userId = interaction.fields.getTextInputValue('user_id').trim();
      const rating = Number(interaction.fields.getTextInputValue('rating').trim());
      const comment = interaction.fields.getTextInputValue('comment').trim() || 'No comment';
      if (!/^\d{17,20}$/.test(userId) || !Number.isInteger(rating) || rating < 1 || rating > 5) return interaction.reply({ content: '❌ Invalid user ID or rating. Rating must be 1–5.', ephemeral: true });
      const user = await client.users.fetch(userId).catch(() => null);
      if (!user) return interaction.reply({ content: '❌ I could not find that Discord user.', ephemeral: true });
      return addVouch(interaction, user, rating, comment);
    }

    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'ping') return interaction.reply({ content: `🏓 Pong! ${client.ws.ping}ms`, ephemeral: true });
    if (interaction.commandName === 'help') return interaction.reply({ embeds: [new EmbedBuilder().setTitle('FSMM Bot').setDescription('Professional FSMM trading community assistant.').addFields(
      { name: '🎫 Tickets', value: '/ticket or use the panel' },
      { name: '🤝 Middleman', value: 'Open a Middleman ticket' },
      { name: '⭐ Vouches', value: '/vouch @user' },
      { name: '👤 Profiles', value: '/profile @user' },
      { name: '🛡️ Moderation', value: '/warn and /warnings' },
      { name: '📊 Stats', value: '/server-stats' },
      { name: '👑 Owner Control', value: 'Owner controls are restricted to the FSMM Owners role' }
    )], ephemeral: true });

    if (interaction.commandName === 'server-stats') return showStats(interaction);
    if (interaction.commandName === 'profile') return showProfile(interaction, interaction.options.getUser('user') || interaction.user);
    if (interaction.commandName === 'vouch') return addVouch(interaction, interaction.options.getUser('user'), interaction.options.getInteger('rating'), interaction.options.getString('comment'));
    if (interaction.commandName === 'warnings') {
      const user = interaction.options.getUser('user') || interaction.user;
      return interaction.reply({ content: `🛡️ <@${user.id}> has **${store.warnings[user.id]?.length || 0}** warning(s).`, ephemeral: true });
    }
    if (interaction.commandName === 'warn') {
      const user = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason');
      if (!store.warnings[user.id]) store.warnings[user.id] = [];
      store.warnings[user.id].push({ moderator: interaction.user.id, reason, createdAt: Date.now() });
      saveStore();
      await interaction.reply({ content: `⚠️ <@${user.id}> has been warned.\n**Reason:** ${reason}` });
      return sendLog(interaction.guild, `⚠️ <@${user.id}> warned by <@${interaction.user.id}> • ${reason}`);
    }
    if (interaction.commandName === 'ticket') return createTicket(interaction, interaction.options.getString('type'));

    if (interaction.commandName === 'setup') {
      if (interaction.user.id !== interaction.guild.ownerId && !isOwner(interaction.member)) return interaction.reply({ content: '🔒 Only the server owner or an existing FSMM Owner can run the initial setup.', ephemeral: true });
      await interaction.deferReply({ ephemeral: true });
      const setup = await ensureSetup(interaction.guild);
      return interaction.editReply({ content: `✅ **FSMM PRO system is set up.**\n👑 Owners: ${setup.ownerRole}\n🎫 Panel: ${setup.panel}\n📁 Tickets: ${setup.category}\n🤝 MM Role: ${setup.mmRole}\n🛡️ Staff Role: ${setup.staffRole}\n📜 Logs: ${setup.logs}\n⭐ Vouches: <#${VOUCH_CHANNEL_ID}>` });
    }
  } catch (error) {
    console.error('Interaction error:', error);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Something went wrong. Check Railway logs.', ephemeral: true }).catch(() => {});
    else if (interaction.deferred) await interaction.editReply({ content: '❌ Something went wrong. Check Railway logs.' }).catch(() => {});
  }
});

(async () => {
  try { await registerCommands(); await client.login(TOKEN); }
  catch (error) { console.error(error); process.exit(1); }
})();
