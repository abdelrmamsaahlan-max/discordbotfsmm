require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  throw new Error('Missing required environment variables: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');
}

const VERSION = '11.0.0';
const STAFF_ROLE = 'FSMM Staff';
const MM_ROLE = 'FSMM Middleman';
const BASE_PAINTER_ROLE = 'FSMM Base Painter';
const OWNER_ROLE = 'Owner';
const CATEGORY_NAME = '🎫 FSMM SERVICES';
const LOG_CHANNEL_NAME = 'fsmm-logs';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'store.json');
const MAX_OPEN_TICKETS = 3;

const BASES = ['Candy', 'Lava', 'Galaxy', 'Yin Yang', 'Radioactive', 'Cursed', 'Divine', 'Cyber', 'Phantom', 'Crystal'];
const BASE_EMOJIS = {
  Candy: '🍬', Lava: '🌋', Galaxy: '🌌', 'Yin Yang': '☯️', Radioactive: '☢️',
  Cursed: '😈', Divine: '✨', Cyber: '🤖', Phantom: '👻', Crystal: '💎',
};
const BASE_FILES = {
  Candy: 'CandyBase.png', Lava: 'LavaBase.png', Galaxy: 'GalaxyBase.png', 'Yin Yang': 'YinYangBase.png',
  Radioactive: 'RadioactiveBase.png', Cursed: 'CursedBase.png', Divine: 'DivineBase.png',
  Cyber: 'CyberBase.png', Phantom: 'PhantomBase.png', Crystal: 'CrystalBase.png',
};
const MM_VALUES = [
  ['10M - 250M', 'Trades from 10M to 250M', '💰'],
  ['250M - 500M', 'Trades from 250M to 500M', '💵'],
  ['500M - 1B', 'Trades from 500M to 1B', '💎'],
  ['1B - 5B', 'Trades from 1B to 5B', '🔥'],
  ['5B+', 'Trades worth 5B or more', '🚀'],
  ['OG / Rare Items', 'OG, rare or unusual items', '👑'],
];
const SUPPORT_VALUES = [
  ['Host a Giveaway', 'host_gw', '🎉', 'Request FSMM to host a giveaway'],
  ['Claim a Giveaway', 'claim_gw', '🎁', 'Get help claiming a giveaway'],
  ['Report', 'report', '🚨', 'Report a problem or user'],
  ['Apply for a Role', 'role_apply', '📋', 'Apply for an FSMM role'],
];

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

function clean(value, max = 900) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/@everyone|@here/gi, '@ mention')
    .trim()
    .slice(0, max) || 'Not provided';
}

function embed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(0x5865f2)
    .setFooter({ text: 'FSMM' });
}

function row(component) {
  return new ActionRowBuilder().addComponents(component);
}

function isOwner(interaction) {
  return interaction.guild?.ownerId === interaction.user.id ||
    Boolean(interaction.member?.roles?.cache?.some((role) => role.name === OWNER_ROLE));
}

function isStaff(interaction) {
  return isOwner(interaction) ||
    Boolean(interaction.member?.roles?.cache?.some((role) => role.name === STAFF_ROLE));
}

function defaultStore() {
  return { users: {}, warnings: [], config: {}, giveaways: {} };
}

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return defaultStore();
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return { ...defaultStore(), ...parsed };
  } catch (error) {
    console.error('[FSMM DATA] Failed to load store:', error.message);
    return defaultStore();
  }
}

function saveStore() {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    const temp = `${DATA_FILE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(temp, DATA_FILE);
  } catch (error) {
    console.error('[FSMM DATA] Failed to save store:', error.message);
  }
}

let store = loadStore();

async function ensureRolesAndCategory(guild) {
  const findRole = (name) => guild.roles.cache.find((role) => role.name === name);
  let staff = findRole(STAFF_ROLE);
  let mm = findRole(MM_ROLE);
  let basePainter = findRole(BASE_PAINTER_ROLE);
  let owner = findRole(OWNER_ROLE);

  if (!staff) staff = await guild.roles.create({ name: STAFF_ROLE, reason: 'FSMM bot setup' });
  if (!mm) mm = await guild.roles.create({ name: MM_ROLE, reason: 'FSMM bot setup' });
  if (!basePainter) basePainter = await guild.roles.create({ name: BASE_PAINTER_ROLE, reason: 'FSMM bot setup' });
  if (!owner) owner = await guild.roles.create({ name: OWNER_ROLE, reason: 'FSMM bot setup' });

  let category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === CATEGORY_NAME);
  if (!category) category = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory, reason: 'FSMM bot setup' });

  let logs = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildText && channel.name === LOG_CHANNEL_NAME);
  if (!logs) {
    logs = await guild.channels.create({
      name: LOG_CHANNEL_NAME,
      type: ChannelType.GuildText,
      reason: 'FSMM moderation and ticket logs',
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: owner.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ],
    });
  }

  return { staff, mm, basePainter, owner, category, logs };
}

async function logEvent(guild, type, details) {
  try {
    const { logs } = await ensureRolesAndCategory(guild);
    await logs.send({ embeds: [embed(`🛡️ FSMM ${type}`, details)] });
    console.log(`[FSMM LOG] ${type}`);
  } catch (error) {
    console.error(`[FSMM LOG] ${type} failed:`, error.message);
  }
}

function middlemanMenu() {
  return row(new StringSelectMenuBuilder().setCustomId('fsmm_mm_pick').setPlaceholder('🤝 Select trade value...').addOptions(MM_VALUES.map(([label, description, emoji]) => ({ label, value: label, description, emoji }))));
}
function supportMenu() {
  return row(new StringSelectMenuBuilder().setCustomId('fsmm_support_pick').setPlaceholder('🛟 Select support type...').addOptions(SUPPORT_VALUES.map(([label, value, emoji, description]) => ({ label, value, emoji, description }))));
}
function baseMenu() {
  return row(new StringSelectMenuBuilder().setCustomId('fsmm_base_pick').setPlaceholder('🎨 Select a base to preview...').addOptions(BASES.map((base) => ({ label: base, value: base, description: `${base} Base Painting`, emoji: BASE_EMOJIS[base] }))));
}
function panelConfigs() {
  return [
    ['🤝・middleman', embed('🤝 FSMM MIDDLEMAN', 'Need a safe middleman?\n\nChoose the trade value below. You will answer a few questions before a private ticket is created.'), middlemanMenu()],
    ['🛟・support', embed('🛟 FSMM SUPPORT', 'Choose what you need:\n\n🎉 **Host a Giveaway**\n🎁 **Claim a Giveaway**\n🚨 **Report**\n📋 **Apply for a Role**'), supportMenu()],
    ['🎨・base-painting', embed('🎨 FSMM BASE PAINTING', 'Select a base to preview it first, then continue to the request form.'), baseMenu()],
  ];
}
async function upsertPanel(channel, panelEmbed, components) {
  const messages = await channel.messages.fetch({ limit: 20 });
  const existing = messages.find((message) => message.author.id === client.user.id && message.embeds.length > 0);
  if (existing) return existing.edit({ embeds: [panelEmbed], components: [components] });
  return channel.send({ embeds: [panelEmbed], components: [components] });
}
async function syncPanels(guild) {
  const { category } = await ensureRolesAndCategory(guild);
  let ready = 0;
  for (const [channelName, panelEmbed, components] of panelConfigs()) {
    let channel = guild.channels.cache.find((item) => item.type === ChannelType.GuildText && item.name === channelName);
    if (!channel) channel = await guild.channels.create({ name: channelName, type: ChannelType.GuildText, parent: category.id, reason: 'FSMM panel setup' });
    await upsertPanel(channel, panelEmbed, components);
    ready += 1;
    console.log(`[FSMM PANELS] edited #${channelName}`);
  }
  console.log(`[FSMM PANELS] READY ${ready}/3`);
}
function input(id, label, style = TextInputStyle.Short, required = true, max = 900, placeholder) {
  const component = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);
  if (placeholder) component.setPlaceholder(placeholder);
  return component;
}
function mmModal(value) {
  return new ModalBuilder().setCustomId(`fsmm_mm_modal:${encodeURIComponent(value)}`).setTitle('FSMM Middleman Request').addComponents(
    row(input('giving', 'What are YOU giving?', TextInputStyle.Paragraph)),
    row(input('receiving', 'What is the OTHER TRADER giving?', TextInputStyle.Paragraph)),
    row(input('other', 'Other trader username', TextInputStyle.Short, true, 100, '@username')),
    row(input('tip', 'What are you tipping?', TextInputStyle.Short, false, 300, 'Optional')),
  );
}
function supportModal(kind) {
  const names = Object.fromEntries(SUPPORT_VALUES.map(([label, value]) => [value, label]));
  const question = kind === 'role_apply' ? 'Why should we accept your application?' : 'Tell us what you need';
  return new ModalBuilder().setCustomId(`fsmm_support_modal:${kind}`).setTitle(names[kind] || 'FSMM Support').addComponents(
    row(input('details', question, TextInputStyle.Paragraph)),
    row(input('roblox', 'Roblox username', TextInputStyle.Short, false, 100, 'Optional')),
  );
}
function paintModal(base) {
  return new ModalBuilder().setCustomId(`fsmm_paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`).addComponents(
    row(input('roblox', 'Roblox username')),
    row(input('payment', 'What is your payment?', TextInputStyle.Paragraph, true, 500)),
    row(input('collateral', 'What is your collateral?', TextInputStyle.Paragraph, true, 500)),
    row(input('extra', 'Extra details', TextInputStyle.Paragraph, false, 900, 'Optional')),
  );
}
function baseImage(base) {
  const file = BASE_FILES[base] || `${base}Base.png`;
  return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(file)}`;
}
function basePreview(base) {
  const preview = embed(`${BASE_EMOJIS[base] || '🎨'} ${base} BASE PREVIEW`, `**Base:** ${base}\n\nIf this is the base you want painted, press **Continue to Request** below.`);
  preview.setImage(baseImage(base));
  return preview;
}
function baseContinueButton(base) {
  return row(new ButtonBuilder().setCustomId(`fsmm_base_continue:${encodeURIComponent(base)}`).setLabel('Continue to Request').setEmoji('🎨').setStyle(ButtonStyle.Primary));
}
function ticketCount(guild, userId) {
  const category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === CATEGORY_NAME);
  if (!category) return 0;
  return category.children.cache.filter((channel) => channel.type === ChannelType.GuildText && channel.topic?.includes(`FSMM_USER:${userId}`)).size;
}
function ticketTypeFromTopic(topic = '') {
  return topic.match(/TYPE:([^\s]+)/)?.[1] || 'unknown';
}
function claimedIdFromTopic(topic = '') {
  return topic.match(/CLAIMED_BY:(\d+)/)?.[1] || null;
}
function claimAllowed(interaction, type) {
  if (isOwner(interaction) || isStaff(interaction)) return true;
  if (type === 'middleman') return Boolean(interaction.member?.roles?.cache?.some((role) => role.name === MM_ROLE));
  if (type === 'base-painting') return Boolean(interaction.member?.roles?.cache?.some((role) => role.name === BASE_PAINTER_ROLE));
  return false;
}
function ticketButtons(type, claimedBy = null) {
  const claim = new ButtonBuilder().setCustomId('fsmm_claim').setLabel(claimedBy ? 'Ticket Claimed' : 'Claim Ticket').setEmoji(claimedBy ? '✅' : '🙋').setStyle(claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(Boolean(claimedBy));
  const close = new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger);
  return row(claim, close);
}
function typeLabel(type) {
  return type === 'middleman' ? 'Middleman' : type === 'support' ? 'Support' : type === 'base-painting' ? 'Base Painting' : 'Ticket';
}
async function fetchTranscript(channel) {
  const messages = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (!batch.size) break;
    messages.push(...batch.values());
    if (batch.size < 100) break;
    before = batch.last().id;
  }
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = ['FSMM TICKET TRANSCRIPT', `Channel: #${channel.name}`, `Ticket Type: ${typeLabel(ticketTypeFromTopic(channel.topic || ''))}`, `Created: ${new Date(channel.createdTimestamp).toISOString()}`, ''];
  for (const message of messages) {
    const text = message.content?.trim() || '[embed/component/attachment]';
    const attachments = message.attachments.size ? ` | Attachments: ${[...message.attachments.values()].map((a) => a.url).join(', ')}` : '';
    lines.push(`[${new Date(message.createdTimestamp).toISOString()}] ${message.author.tag}: ${text}${attachments}`);
  }
  return Buffer.from(lines.join('\n'), 'utf8');
}
async function sendTranscriptAndClose(channel, closer) {
  const type = ticketTypeFromTopic(channel.topic || '');
  const openerId = channel.topic?.match(/FSMM_USER:(\d+)/)?.[1] || null;
  const claimedBy = claimedIdFromTopic(channel.topic || '');
  const transcript = await fetchTranscript(channel);
  const { logs } = await ensureRolesAndCategory(channel.guild);
  const closeEmbed = embed('🔒 TICKET CLOSED', [
    `**Ticket:** #${channel.name}`,
    `**Type:** ${typeLabel(type)}`,
    `**Opened by:** ${openerId ? `<@${openerId}>` : 'Unknown'}`,
    `**Closed by:** <@${closer.id}>`,
    `**Claimed by:** ${claimedBy ? `<@${claimedBy}>` : 'Unclaimed'}`,
    `**Closed:** <t:${Math.floor(Date.now() / 1000)}:F>`,
  ].join('\n'));
  await logs.send({ embeds: [closeEmbed], files: [{ attachment: transcript, name: `${channel.name}-transcript.txt` }] });
  await logs.send({ embeds: [embed('📄 TRANSCRIPT SENT', `Transcript for **#${channel.name}** was saved in mod logs.\n**Closed by:** <@${closer.id}>`)] });
  await channel.delete('FSMM ticket closed by staff');
  console.log(`[FSMM TICKETS] CLOSED + TRANSCRIPT ${channel.name} by ${closer.user.tag}`);
}
async function createTicket(interaction, type, data) {
  if (ticketCount(interaction.guild, interaction.user.id) >= MAX_OPEN_TICKETS) return interaction.reply({ content: `❌ You already have ${MAX_OPEN_TICKETS} open FSMM tickets. Close one before opening another.`, flags: MessageFlags.Ephemeral });
  const { staff, mm, basePainter, category } = await ensureRolesAndCategory(interaction.guild);
  const typeName = typeLabel(type);
  const slug = type === 'middleman' ? 'middleman' : type === 'support' ? 'support' : 'base-painting';
  const teamRole = type === 'middleman' ? mm : type === 'base-painting' ? basePainter : staff;
  const channel = await interaction.guild.channels.create({
    name: `${slug}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 90) || `${slug}-${interaction.user.id}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `FSMM_USER:${interaction.user.id} TYPE:${type}`,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: teamRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    ],
    reason: `FSMM ${typeName} ticket`,
  });
  const details = Object.entries(data).map(([key, value]) => `**${clean(key, 100)}:**\n${clean(value, 900)}`).join('\n\n');
  const ticketEmbed = embed(`🎫 FSMM ${typeName.toUpperCase()} TICKET`, [
    '**Status:** 🟢 OPEN',
    `**Opened by:** <@${interaction.user.id}>`,
    '', details, '',
    'A team member can claim this ticket using **Claim Ticket**.',
    'Only FSMM staff can close tickets.',
  ].join('\n'));
  await channel.send({ content: `<@${interaction.user.id}> <@&${teamRole.id}>`, allowedMentions: { users: [interaction.user.id], roles: [teamRole.id] }, embeds: [ticketEmbed], components: [ticketButtons(type)] });
  await logEvent(interaction.guild, 'TICKET OPENED', [`**Ticket:** ${channel}`, `**Type:** ${typeName}`, `**Opened by:** <@${interaction.user.id}>`, `**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`].join('\n'));
  return interaction.reply({ content: `✅ Your private ticket is ready: ${channel}`, flags: MessageFlags.Ephemeral });
}
function parseDuration(value) {
  const match = String(value).trim().match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return null;
  const duration = Number(match[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2].toLowerCase()];
  return duration >= 10000 && duration <= 604800000 ? duration : null;
}
function giveawayButton(id) {
  return row(new ButtonBuilder().setCustomId(`fsmm_gw_join:${id}`).setLabel('Enter Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Success));
}
async function finishGiveaway(id) {
  const giveaway = store.giveaways?.[id];
  if (!giveaway || giveaway.ended) return;
  giveaway.ended = true;
  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!message) return;
  const entries = Object.keys(giveaway.entries || {}), pool = [...entries], winners = [];
  for (let index = 0; index < Math.min(giveaway.winners, pool.length); index += 1) winners.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const winnerText = winners.length ? winners.map((idValue) => `<@${idValue}>`).join(', ') : 'No valid entries';
  const resultEmbed = embed('🎉 GIVEAWAY ENDED', `**Prize:** ${clean(giveaway.prize, 200)}\n**Winner${winners.length === 1 ? '' : 's'}:** ${winnerText}\n\nEntries: **${entries.length}**`);
  if (giveaway.image) resultEmbed.setImage(giveaway.image);
  await message.edit({ embeds: [resultEmbed], components: [] }).catch(() => null);
  saveStore();
}
function scheduleGiveaways() {
  for (const [id, giveaway] of Object.entries(store.giveaways || {})) {
    if (giveaway.ended) continue;
    const delay = Math.max(0, Number(giveaway.endsAt) - Date.now());
    setTimeout(() => finishGiveaway(id).catch((error) => console.error('[FSMM GIVEAWAY] Finish failed:', error.message)), Math.min(delay, 2147483647));
  }
}

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Show bot latency.'),
  new SlashCommandBuilder().setName('help').setDescription('Show FSMM bot commands.'),
  new SlashCommandBuilder().setName('membercount').setDescription('Show server member count.'),
  new SlashCommandBuilder().setName('setup').setDescription('Owner-only: sync the 3 FSMM service panels and ticket roles.'),
  new SlashCommandBuilder().setName('ticket').setDescription('Owner-only: sync the 3 FSMM service panels and ticket roles.'),
  new SlashCommandBuilder().setName('giveaway').setDescription('Staff-only: start an FSMM giveaway.')
    .addStringOption((option) => option.setName('duration').setDescription('Duration: 10s, 10m, 1h, or 1d').setRequired(true))
    .addIntegerOption((option) => option.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20).setRequired(true))
    .addStringOption((option) => option.setName('prize').setDescription('Giveaway prize').setMaxLength(200).setRequired(true))
    .addAttachmentOption((option) => option.setName('image').setDescription('Optional giveaway image').setRequired(false)),
].map((command) => command.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const route = Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID);
  const existing = await rest.get(route);
  const coreNames = new Set(commands.map((command) => command.name));
  const preserved = existing.filter((command) => !coreNames.has(command.name));
  const merged = [...preserved, ...commands];
  await rest.put(route, { body: merged });
  const verified = await rest.get(route);
  const verifiedNames = new Set(verified.map((command) => command.name));
  const missing = merged.filter((command) => !verifiedNames.has(command.name)).map((command) => command.name);
  if (missing.length) throw new Error(`Command verification failed. Missing: ${missing.join(', ')}`);
  console.log(`[FSMM COMMANDS] VERIFIED ${verified.length}/${merged.length} GUILD COMMANDS`);
  console.log(`[FSMM COMMANDS] PRESERVED ${preserved.length} ENHANCED COMMANDS`);
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ping') return interaction.reply({ content: `🏓 Pong! ${client.ws.ping}ms`, flags: MessageFlags.Ephemeral });
      if (interaction.commandName === 'help') return interaction.reply({ embeds: [embed('🤖 FSMM COMMANDS', ['**🎫 Tickets**','`/ticket` — sync the three service panels','','**🛡️ Staff**','`/giveaway` — start a giveaway','`/ticketstats` — ticket overview','`/transcript` — create a transcript manually','`/modlogs` — view moderation logs','','**📊 Community**','`/vouch` `/vouches` `/leaderboard`','`/stats` `/profile` `/activity` `/topmembers`','','**🔧 Moderation**','`/warn` `/warnings` `/unwarn` `/clear`','`/ban` `/unban` `/kick` `/timeout` `/untimeout`','`/lock` `/unlock` `/slowmode` `/nick` `/role`','','**⚙️ Utilities**','`/serverinfo` `/userinfo` `/avatar` `/servericon`','`/roleinfo` `/channelinfo` `/botinfo`','`/ping` `/membercount`'].join('\n'))], flags: MessageFlags.Ephemeral });
      if (interaction.commandName === 'membercount') return interaction.reply({ content: `👥 Members: **${interaction.guild.memberCount}**`, flags: MessageFlags.Ephemeral });
      if (interaction.commandName === 'setup' || interaction.commandName === 'ticket') {
        if (!isOwner(interaction)) return interaction.reply({ content: '❌ Owner only.', flags: MessageFlags.Ephemeral });
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await syncPanels(interaction.guild);
        return interaction.editReply('✅ FSMM panels and ticket roles are synced.');
      }
      if (interaction.commandName === 'giveaway') {
        if (!isStaff(interaction)) return interaction.reply({ content: '❌ Staff only.', flags: MessageFlags.Ephemeral });
        const duration = parseDuration(interaction.options.getString('duration', true));
        if (!duration) return interaction.reply({ content: '❌ Invalid duration. Use 10s–7d, for example `10m` or `2h`.', flags: MessageFlags.Ephemeral });
        const winners = interaction.options.getInteger('winners', true);
        const prize = clean(interaction.options.getString('prize', true), 200);
        const image = interaction.options.getAttachment('image');
        if (image && !image.contentType?.startsWith('image/')) return interaction.reply({ content: '❌ The giveaway attachment must be an image.', flags: MessageFlags.Ephemeral });
        const id = `${Date.now()}-${interaction.user.id}`;
        const giveaway = { channelId: interaction.channelId, messageId: null, prize, winners, endsAt: Date.now() + duration, ended: false, entries: {}, image: image?.url || null };
        const giveawayEmbed = embed('🎉 FSMM GIVEAWAY', `**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(giveaway.endsAt / 1000)}:R>\n\nClick the button below to enter.`);
        if (giveaway.image) giveawayEmbed.setImage(giveaway.image);
        const message = await interaction.channel.send({ embeds: [giveawayEmbed], components: [giveawayButton(id)] });
        giveaway.messageId = message.id;
        store.giveaways[id] = giveaway;
        saveStore();
        setTimeout(() => finishGiveaway(id).catch((error) => console.error('[FSMM GIVEAWAY] Finish failed:', error.message)), Math.min(duration, 2147483647));
        return interaction.reply({ content: '✅ Giveaway started.', flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'fsmm_mm_pick') return interaction.showModal(mmModal(interaction.values[0]));
      if (interaction.customId === 'fsmm_support_pick') return interaction.showModal(supportModal(interaction.values[0]));
      if (interaction.customId === 'fsmm_base_pick') {
        const base = interaction.values[0];
        if (!BASES.includes(base)) return interaction.reply({ content: '❌ Invalid base.', flags: MessageFlags.Ephemeral });
        return interaction.reply({ embeds: [basePreview(base)], components: [baseContinueButton(base)], flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId.startsWith('fsmm_base_continue:')) {
        const base = decodeURIComponent(interaction.customId.split(':').slice(1).join(':'));
        if (!BASES.includes(base)) return interaction.reply({ content: '❌ Invalid base.', flags: MessageFlags.Ephemeral });
        return interaction.showModal(paintModal(base));
      }
      if (interaction.customId === 'fsmm_claim') {
        const channel = interaction.channel;
        const topic = channel?.topic || '';
        const type = ticketTypeFromTopic(topic);
        if (!['middleman', 'support', 'base-painting'].includes(type)) return interaction.reply({ content: '❌ This is not an FSMM ticket.', flags: MessageFlags.Ephemeral });
        if (!claimAllowed(interaction, type)) return interaction.reply({ content: '❌ You are not part of the team allowed to claim this ticket.', flags: MessageFlags.Ephemeral });
        const existingClaim = claimedIdFromTopic(topic);
        if (existingClaim) return interaction.reply({ content: `❌ This ticket is already claimed by <@${existingClaim}>.`, flags: MessageFlags.Ephemeral });
        await channel.setTopic(`${topic} CLAIMED_BY:${interaction.user.id}`);
        const currentEmbed = interaction.message.embeds[0] ? EmbedBuilder.from(interaction.message.embeds[0]) : embed('🎫 FSMM TICKET', '');
        const oldDescription = currentEmbed.data.description || '';
        currentEmbed.setDescription(oldDescription.replace('**Status:** 🟢 OPEN', '**Status:** 🟡 CLAIMED') + `\n\n**Claimed by:** <@${interaction.user.id}>`);
        await interaction.message.edit({ embeds: [currentEmbed], components: [ticketButtons(type, interaction.user.id)] });
        await logEvent(interaction.guild, 'TICKET CLAIMED', [`**Ticket:** ${channel}`, `**Type:** ${typeLabel(type)}`, `**Claimed by:** <@${interaction.user.id}>`, `**Time:** <t:${Math.floor(Date.now() / 1000)}:F>`].join('\n'));
        return interaction.reply({ content: `✅ You claimed **${typeLabel(type)}** ticket.`, flags: MessageFlags.Ephemeral });
      }
      if (interaction.customId === 'fsmm_close') {
        const channel = interaction.channel;
        const type = ticketTypeFromTopic(channel?.topic || '');
        if (!['middleman', 'support', 'base-painting'].includes(type)) return interaction.reply({ content: '❌ This is not an FSMM ticket.', flags: MessageFlags.Ephemeral });
        if (!isStaff(interaction)) return interaction.reply({ content: '❌ Only **FSMM Staff / Owners** can close tickets.', flags: MessageFlags.Ephemeral });
        await interaction.reply({ content: '🔒 Creating transcript and closing ticket...', flags: MessageFlags.Ephemeral });
        await sendTranscriptAndClose(channel, interaction.member);
        return;
      }
      if (interaction.customId.startsWith('fsmm_gw_join:')) {
        const id = interaction.customId.slice('fsmm_gw_join:'.length);
        const giveaway = store.giveaways?.[id];
        if (!giveaway || giveaway.ended) return interaction.reply({ content: '❌ This giveaway has ended.', flags: MessageFlags.Ephemeral });
        giveaway.entries[interaction.user.id] = true;
        saveStore();
        return interaction.reply({ content: '🎉 You are entered!', flags: MessageFlags.Ephemeral });
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('fsmm_mm_modal:')) {
        const value = decodeURIComponent(interaction.customId.split(':').slice(1).join(':'));
        return createTicket(interaction, 'middleman', {
          'Trade value': value,
          'What YOU are giving': interaction.fields.getTextInputValue('giving'),
          'What the OTHER TRADER is giving': interaction.fields.getTextInputValue('receiving'),
          'Other trader username': interaction.fields.getTextInputValue('other'),
          Tip: interaction.fields.getTextInputValue('tip') || 'Not provided',
        });
      }
      if (interaction.customId.startsWith('fsmm_support_modal:')) {
        const kind = interaction.customId.split(':')[1];
        return createTicket(interaction, 'support', { 'Support type': kind, Details: interaction.fields.getTextInputValue('details'), 'Roblox username': interaction.fields.getTextInputValue('roblox') || 'Not provided' });
      }
      if (interaction.customId.startsWith('fsmm_paint_modal:')) {
        const base = decodeURIComponent(interaction.customId.split(':').slice(1).join(':'));
        return createTicket(interaction, 'base-painting', { Base: base, 'Roblox username': interaction.fields.getTextInputValue('roblox'), Payment: interaction.fields.getTextInputValue('payment'), Collateral: interaction.fields.getTextInputValue('collateral'), 'Extra details': interaction.fields.getTextInputValue('extra') || 'Not provided' });
      }
    }
  } catch (error) {
    console.error('[FSMM ERROR]', error.stack || error.message);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Something went wrong. Please try again.', flags: MessageFlags.Ephemeral }).catch(() => null);
  }
});

client.once('ready', async () => {
  console.log(`[FSMM ${VERSION}] ONLINE AS ${client.user.tag}`);
  try {
    await registerCommands();
    if (client.guilds.cache.has(GUILD_ID)) await syncPanels(client.guilds.cache.get(GUILD_ID));
    scheduleGiveaways();
    console.log('[FSMM] TICKET HANDLERS READY: claim + staff-close + auto-transcript + mod-logs');
    console.log('[FSMM] STARTUP SYNC COMPLETE');
  } catch (error) {
    console.error('[FSMM STARTUP] Sync failed:', error.stack || error.message);
  }
});

client.login(TOKEN).catch((error) => {
  console.error('[FSMM LOGIN] Failed:', error.stack || error.message);
  process.exit(1);
});
