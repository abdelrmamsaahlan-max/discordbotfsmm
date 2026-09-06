require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) { console.error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID environment variables.'); process.exit(1); }

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const defaults = { config: { ticketCategoryId: null, logChannelId: null, mmRoleId: null, staffRoleId: null }, users: {}, vouches: [], tickets: {}, warnings: {} };
function loadStore() { try { return fs.existsSync(DATA_FILE) ? { ...structuredClone(defaults), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } : structuredClone(defaults); } catch { return structuredClone(defaults); } }
let store = loadStore();
function saveStore() { fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2)); }
function profileFor(id) { if (!store.users[id]) store.users[id] = { trades: 0, vouches: 0, ratingTotal: 0 }; return store.users[id]; }
function isStaff(member) { return member.permissions.has(PermissionFlagsBits.ManageGuild) || (store.config.staffRoleId && member.roles.cache.has(store.config.staffRoleId)); }

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if FSMM bot is online.'),
  new SlashCommandBuilder().setName('help').setDescription('Show FSMM bot features.'),
  new SlashCommandBuilder().setName('server-stats').setDescription('Show FSMM server statistics.'),
  new SlashCommandBuilder().setName('setup').setDescription('Create the FSMM ticket panel.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('profile').setDescription('Show an FSMM profile.').addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder().setName('vouch').setDescription('Leave a trade vouch.').addUserOption(o => o.setName('user').setDescription('User you traded with').setRequired(true)).addIntegerOption(o => o.setName('rating').setDescription('Rating 1-5').setMinValue(1).setMaxValue(5)).addStringOption(o => o.setName('comment').setDescription('Feedback').setMaxLength(500)),
  new SlashCommandBuilder().setName('warnings').setDescription('View warning count.').addUserOption(o => o.setName('user').setDescription('User').setRequired(false)),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member.').setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers).addUserOption(o => o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('ticket').setDescription('Open an FSMM ticket.').addStringOption(o => o.setName('type').setDescription('Ticket type').setRequired(true).addChoices({ name: 'Trade', value: 'trade' }, { name: 'Middleman', value: 'middleman' }, { name: 'Support', value: 'support' }))
].map(c => c.toJSON());

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
async function registerCommands() { const rest = new REST({ version: '10' }).setToken(TOKEN); await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands }); console.log(`Registered ${commands.length} slash commands.`); }

function panelEmbed() { return new EmbedBuilder().setTitle('FSMM • Trading Center').setDescription('**Safe trading starts here.**\nOpen a Trade, Middleman, or Support ticket below.\n\n⚠️ Never share passwords, tokens, or private account information.').addFields({ name: '🎫 Tickets', value: 'Trade • Middleman • Support', inline: true }, { name: '🤝 Middleman', value: 'Request trusted MM help', inline: true }, { name: '⭐ Vouches', value: 'Build your trade reputation', inline: true }).setFooter({ text: 'FSMM • Steal a Brainrot Trading' }); }
function panelRows() { return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ticket_trade').setLabel('Trade Ticket').setEmoji('🎫').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('ticket_mm').setLabel('Middleman').setEmoji('🤝').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId('ticket_support').setLabel('Support').setEmoji('🛟').setStyle(ButtonStyle.Secondary)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('my_profile').setLabel('My Profile').setEmoji('👤').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('vouch_modal').setLabel('Leave Vouch').setEmoji('⭐').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('server_stats').setLabel('Server Stats').setEmoji('📊').setStyle(ButtonStyle.Secondary))]; }
async function sendLog(guild, text) { const ch = store.config.logChannelId ? guild.channels.cache.get(store.config.logChannelId) : null; if (ch?.isTextBased()) await ch.send({ embeds: [new EmbedBuilder().setDescription(text).setFooter({ text: 'FSMM Logs' })] }).catch(() => {}); }

async function createTicket(interaction, type) {
  const guild = interaction.guild;
  const existing = Object.values(store.tickets).find(t => t.guildId === guild.id && t.userId === interaction.user.id && t.open);
  if (existing) { const ch = guild.channels.cache.get(existing.channelId); return interaction.reply({ content: `❌ You already have an open ticket: ${ch || 'ticket'}`, ephemeral: true }); }
  const category = store.config.ticketCategoryId ? guild.channels.cache.get(store.config.ticketCategoryId) : null;
  const safeName = `${type}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 70) || `${type}-ticket`;
  const channel = await guild.channels.create({ name: safeName, type: ChannelType.GuildText, parent: category?.type === ChannelType.GuildCategory ? category.id : undefined, topic: `FSMM ${type} ticket • ${interaction.user.id}`, permissionOverwrites: [{ id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }, { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] });
  if (store.config.staffRoleId) await channel.permissionOverwrites.create(store.config.staffRoleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  if (type === 'middleman' && store.config.mmRoleId) await channel.permissionOverwrites.create(store.config.mmRoleId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true }).catch(() => {});
  store.tickets[channel.id] = { guildId: guild.id, userId: interaction.user.id, type, open: true, createdAt: Date.now() }; profileFor(interaction.user.id); saveStore();
  const embed = new EmbedBuilder().setTitle(`${type === 'middleman' ? '🤝' : type === 'trade' ? '🎫' : '🛟'} FSMM ${type[0].toUpperCase() + type.slice(1)} Ticket`).setDescription(`Welcome <@${interaction.user.id}>!\n\nExplain your request clearly. Staff will assist you.\n\n**Safety:** FSMM staff will never ask for your Discord password or bot token.`).addFields({ name: 'Owner', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Type', value: type, inline: true });
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`close_ticket:${channel.id}`).setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));
  await channel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
  await interaction.reply({ content: `✅ Ticket created: ${channel}`, ephemeral: true });
  await sendLog(guild, `🎫 Ticket opened by <@${interaction.user.id}> • **${type}** • ${channel}`);
}
async function closeTicket(interaction, channelId) { const t = store.tickets[channelId]; if (!t?.open) return interaction.reply({ content: 'This ticket is already closed.', ephemeral: true }); if (interaction.user.id !== t.userId && !isStaff(interaction.member)) return interaction.reply({ content: '❌ Only the owner or staff can close this ticket.', ephemeral: true }); t.open = false; t.closedAt = Date.now(); saveStore(); await sendLog(interaction.guild, `🔒 Ticket closed by <@${interaction.user.id}> • <#${channelId}>`); await interaction.reply({ content: '🔒 Ticket closed. Deleting in 5 seconds.' }); setTimeout(() => interaction.channel.delete('FSMM ticket closed').catch(() => {}), 5000); }
async function showProfile(interaction, user) { const p = profileFor(user.id); const avg = p.vouches ? (p.ratingTotal / p.vouches).toFixed(1) : 'N/A'; return interaction.reply({ embeds: [new EmbedBuilder().setTitle(`👤 ${user.username} • FSMM Profile`).setThumbnail(user.displayAvatarURL()).addFields({ name: '⭐ Vouches', value: String(p.vouches), inline: true }, { name: '🌟 Rating', value: avg === 'N/A' ? avg : `${avg}/5`, inline: true }, { name: '🤝 Recorded Trades', value: String(p.trades), inline: true })] }); }
async function showStats(interaction) { const guild = interaction.guild; const openTickets = Object.values(store.tickets).filter(t => t.guildId === guild.id && t.open).length; return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📊 FSMM Server Stats').addFields({ name: '👥 Members', value: String(guild.memberCount), inline: true }, { name: '💬 Channels', value: String(guild.channels.cache.size), inline: true }, { name: '🎫 Open Tickets', value: String(openTickets), inline: true }, { name: '⭐ Vouches', value: String(store.vouches.length), inline: true })] }); }

client.once('ready', () => { console.log(`FSMM bot online as ${client.user.tag}`); client.user.setActivity('FSMM | Trading & Middleman', { type: 3 }); });
client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('ticket_')) return createTicket(interaction, interaction.customId === 'ticket_mm' ? 'middleman' : interaction.customId.replace('ticket_', ''));
      if (interaction.customId === 'my_profile') return showProfile(interaction, interaction.user);
      if (interaction.customId === 'server_stats') return showStats(interaction);
      if (interaction.customId === 'vouch_modal') { const modal = new ModalBuilder().setCustomId('vouch_form').setTitle('FSMM Vouch'); modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('User ID you traded with').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rating').setLabel('Rating 1-5').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('comment').setLabel('Trade feedback').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500))); return interaction.showModal(modal); }
      if (interaction.customId.startsWith('close_ticket:')) return closeTicket(interaction, interaction.customId.split(':')[1]);
    }
    if (interaction.isModalSubmit() && interaction.customId === 'vouch_form') { const userId = interaction.fields.getTextInputValue('user_id').trim(); const rating = Number(interaction.fields.getTextInputValue('rating').trim()); const comment = interaction.fields.getTextInputValue('comment').trim() || 'No comment'; if (!/^\d{17,20}$/.test(userId) || rating < 1 || rating > 5) return interaction.reply({ content: '❌ Invalid user ID or rating. Rating must be 1–5.', ephemeral: true }); if (userId === interaction.user.id) return interaction.reply({ content: '❌ You cannot vouch yourself.', ephemeral: true }); const target = await interaction.guild.members.fetch(userId).catch(() => null); if (!target) return interaction.reply({ content: '❌ That user is not in this server.', ephemeral: true }); const p = profileFor(userId); p.vouches++; p.ratingTotal += rating; store.vouches.push({ from: interaction.user.id, to: userId, rating, comment, createdAt: Date.now() }); saveStore(); await interaction.reply({ embeds: [new EmbedBuilder().setTitle('⭐ Vouch Added').setDescription(`<@${interaction.user.id}> vouched for <@${userId}>\n\n**Rating:** ${'⭐'.repeat(rating)}\n**Feedback:** ${comment}`)] }); return sendLog(interaction.guild, `⭐ <@${interaction.user.id}> vouched for <@${userId}> • ${rating}/5`); }
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === 'ping') return interaction.reply({ content: `🏓 Pong! ${client.ws.ping}ms`, ephemeral: true });
    if (interaction.commandName === 'help') return interaction.reply({ embeds: [new EmbedBuilder().setTitle('FSMM Bot').setDescription('FSMM trading community assistant.').addFields({ name: '🎫 Tickets', value: '/ticket or use the panel' }, { name: '🤝 Middleman', value: 'Open a Middleman ticket' }, { name: '⭐ Vouches', value: '/vouch or use the panel' }, { name: '👤 Profiles', value: '/profile' }, { name: '🛡️ Moderation', value: '/warn and /warnings' }, { name: '📊 Stats', value: '/server-stats' })], ephemeral: true });
    if (interaction.commandName === 'server-stats') return showStats(interaction);
    if (interaction.commandName === 'profile') return showProfile(interaction, interaction.options.getUser('user') || interaction.user);
    if (interaction.commandName === 'vouch') { const user = interaction.options.getUser('user'); const rating = interaction.options.getInteger('rating') || 5; const comment = interaction.options.getString('comment') || 'No comment'; if (user.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot vouch yourself.', ephemeral: true }); const p = profileFor(user.id); p.vouches++; p.ratingTotal += rating; store.vouches.push({ from: interaction.user.id, to: user.id, rating, comment, createdAt: Date.now() }); saveStore(); await interaction.reply({ content: `⭐ Vouch added for ${user}: ${rating}/5 — ${comment}` }); return sendLog(interaction.guild, `⭐ <@${interaction.user.id}> vouched for <@${user.id}> • ${rating}/5`); }
    if (interaction.commandName === 'warnings') { const user = interaction.options.getUser('user') || interaction.user; return interaction.reply({ content: `🛡️ <@${user.id}> has **${store.warnings[user.id]?.length || 0}** warning(s).`, ephemeral: true }); }
    if (interaction.commandName === 'warn') { const user = interaction.options.getUser('user'); const reason = interaction.options.getString('reason'); if (!store.warnings[user.id]) store.warnings[user.id] = []; store.warnings[user.id].push({ moderator: interaction.user.id, reason, createdAt: Date.now() }); saveStore(); await interaction.reply({ content: `⚠️ <@${user.id}> has been warned.\n**Reason:** ${reason}` }); return sendLog(interaction.guild, `⚠️ <@${user.id}> warned by <@${interaction.user.id}> • ${reason}`); }
    if (interaction.commandName === 'ticket') return createTicket(interaction, interaction.options.getString('type'));
    if (interaction.commandName === 'setup') { const guild = interaction.guild; let category = store.config.ticketCategoryId ? guild.channels.cache.get(store.config.ticketCategoryId) : null; if (!category) { category = await guild.channels.create({ name: 'FSMM TICKETS', type: ChannelType.GuildCategory }); store.config.ticketCategoryId = category.id; } const panel = await guild.channels.create({ name: 'fsmm-ticket-panel', type: ChannelType.GuildText }); await panel.send({ embeds: [panelEmbed()], components: panelRows() }); saveStore(); return interaction.reply({ content: `✅ FSMM panel created in ${panel}.\nTicket category: ${category}`, ephemeral: true }); }
  } catch (error) { console.error(error); if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Something went wrong. Check Railway logs.', ephemeral: true }).catch(() => {}); }
});

(async () => { try { await registerCommands(); await client.login(TOKEN); } catch (error) { console.error(error); process.exit(1); } })();
