require('dotenv').config();
const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder,
  PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Missing required environment variables.');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if the FSMM bot is online.'),
  new SlashCommandBuilder().setName('setup').setDescription('Create the three FSMM service panels.'),
  new SlashCommandBuilder().setName('ticket').setDescription('Open one of the FSMM services directly.')
    .addStringOption(o => o.setName('type').setDescription('Service').setRequired(true).addChoices(
      { name: 'Middleman', value: 'middleman' },
      { name: 'Support', value: 'support' },
      { name: 'Base Painting', value: 'basepainting' }
    ))
];

const STAFF_ROLE = 'FSMM Staff';
const MM_ROLE = 'FSMM Middleman';
const CATEGORY = '🎫 FSMM TICKETS';
const PANEL_NAMES = ['🤝・middleman', '🛟・support', '🎨・base-painting', '🎫・ticket-center', 'ticket-center', 'fsmm-ticket-panel'];

const VALUE_IMAGES = {
  '10M - 250M': 'https://static.u7buy.com/2026/03/05/13f59a8a77664b9ba7c3881370a3dbb9.png',
  '250M - 500M': 'https://i.ebayimg.com/images/g/3-0AAeSw23NpZcT0/s-l1200.png',
  '1B+': 'https://i.ebayimg.com/images/g/3-0AAeSw23NpZcT0/s-l1200.png',
  'OG': 'https://www.eldorado.gg/blog/wp-content/uploads/2025/12/Meowl.webp'
};

// Fandom's Special:Redirect/file endpoint lets Discord fetch the real wiki image.
function baseImage(name) {
  const fileNames = {
    'Default': 'DefaultBase.png', 'Gold': 'GoldBase.png', 'Diamond': 'DiamondBase.png', 'Rainbow': 'RainbowBase.png',
    'Candy': 'CandyBase.png', 'Lava': 'LavaBase.png', 'Galaxy': 'GalaxyBase.png', 'Yin Yang': 'YinYangBase.png',
    'Radioactive': 'RadioactiveBase.png', 'Cursed': 'CursedBase.png', 'Divine': 'DivineBase.png', 'Cyber': 'CyberBase.png',
    'Phantom': 'PhantomBase.png', 'Crystal': 'CrystalBase.png',
    'Halloween': 'HalloweenBase.png', 'Aquatic': 'AquaticBase.png', 'Christmas': 'ChristmasBase.png',
    'Gingerbread': 'GingerbreadBase.png', 'Taco': 'TacoBase.png', "Valentine's": 'ValentinesBase.png',
    'Rose': 'RoseBase.png', 'Lucky': 'LuckyBase.png', 'Easter': 'EasterBase.png', 'Summer': 'SummerBase.png',
    'Pot of Gold': 'PotOfGoldBase.png', 'Red Octo': 'RedOctoBase.png',
    'Strawberry': 'StrawberryBase.png', 'Meowl': 'MeowlBase.png', 'Skibidi': 'SkibidiBase.png',
    'Smurf Cat': 'SmurfCatBase.png', 'John Pork': 'JohnPorkBase.png', 'Headless Horseman': 'HeadlessHorsemanBase.png',
    'Spyder': 'SpyderBase.png', '1 of 1': '1of1Base.png', 'Tralalero': 'TralaleroBase.png',
    "SpyderSammy's Base": 'SpyderSammysBase.png'
  };
  return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(fileNames[name] || `${name}Base.png`)}`;
}

const BASE_GROUPS = {
  classic: ['Default', 'Gold', 'Diamond', 'Rainbow'],
  mutation: ['Candy', 'Lava', 'Galaxy', 'Yin Yang', 'Radioactive', 'Cursed', 'Divine', 'Cyber', 'Phantom', 'Crystal'],
  seasonal: ['Halloween', 'Aquatic', 'Christmas', 'Gingerbread', 'Taco', "Valentine's", 'Rose', 'Lucky', 'Easter', 'Summer', 'Pot of Gold', 'Red Octo'],
  og: ['Strawberry', 'Meowl', 'Skibidi', 'Smurf Cat', 'John Pork', 'Headless Horseman', 'Spyder'],
  admin: ["SpyderSammy's Base", 'Tralalero', '1 of 1']
};

const BASE_LABELS = {
  classic: 'Classic Bases', mutation: 'Mutation Bases', seasonal: 'Seasonal Bases', og: 'OG Bases', admin: 'Admin / Special Bases'
};

function closeRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fsmm_close_ticket').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)
  );
}

function panelEmbed(title, description) {
  return new EmbedBuilder().setTitle(title).setDescription(description).setFooter({ text: 'FSMM • Trusted Trading & Services' });
}

function middlemanMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('fsmm_mm_value').setPlaceholder('Select your trade value...').addOptions(
      { label: '10M - 250M', value: '10M - 250M', description: 'Lower-value middleman request' },
      { label: '250M - 500M', value: '250M - 500M', description: 'Mid-value middleman request' },
      { label: '1B+', value: '1B+', description: '1B or higher middleman request' },
      { label: 'OG', value: 'OG', description: 'OG / ultra-high-value request' }
    )
  );
}

function supportMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('fsmm_support_type').setPlaceholder('Choose what you need...').addOptions(
      { label: 'Host a Giveaway', value: 'host_gw', description: 'Request FSMM help hosting a giveaway' },
      { label: 'Claim a Giveaway', value: 'claim_gw', description: 'Claim or resolve a giveaway issue' },
      { label: 'Report', value: 'report', description: 'Report a member, trade, or server issue' },
      { label: 'Apply for a Role', value: 'role_apply', description: 'Apply for an FSMM server role' }
    )
  );
}

function baseCategoryMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId('fsmm_base_category').setPlaceholder('Choose a base category...').addOptions(
      { label: 'Classic', value: 'classic', description: 'Default, Gold, Diamond, Rainbow' },
      { label: 'Mutation', value: 'mutation', description: 'Candy, Lava, Galaxy, Yin Yang, and more' },
      { label: 'Seasonal', value: 'seasonal', description: 'Event and seasonal bases' },
      { label: 'OG', value: 'og', description: 'Rare OG-exclusive bases' },
      { label: 'Admin / Special', value: 'admin', description: 'Special and admin bases' }
    )
  );
}

function baseMenu(group) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`fsmm_base_pick:${group}`).setPlaceholder(`Select a ${BASE_LABELS[group].toLowerCase()}...`).addOptions(
      BASE_GROUPS[group].map(name => ({ label: name, value: name, description: `Request ${name} base painting` }))
    )
  );
}

async function getRolesAndCategory(guild) {
  let staff = guild.roles.cache.find(r => r.name === STAFF_ROLE);
  if (!staff) staff = await guild.roles.create({ name: STAFF_ROLE, reason: 'FSMM service tickets' });
  let mm = guild.roles.cache.find(r => r.name === MM_ROLE);
  if (!mm) mm = await guild.roles.create({ name: MM_ROLE, reason: 'FSMM middleman tickets' });
  let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === CATEGORY);
  if (!category) category = await guild.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory, reason: 'FSMM service tickets' });
  return { staff, mm, category };
}

async function createTicket(interaction, type, details = {}) {
  const { staff, mm, category } = await getRolesAndCategory(interaction.guild);
  const existing = interaction.guild.channels.cache.find(c => c.parentId === category.id && c.topic === `FSMM_OWNER:${interaction.user.id}`);
  if (existing) return interaction.reply({ content: `⚠️ You already have an open ticket: ${existing}`, ephemeral: true });

  const prefix = type === 'middleman' ? 'mm' : type === 'basepainting' ? 'paint' : 'support';
  const safe = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 45) || 'user';
  const channel = await interaction.guild.channels.create({
    name: `${prefix}-${safe}`,
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `FSMM_OWNER:${interaction.user.id}`,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      ...(type === 'middleman' ? [{ id: mm.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }] : [])
    ]
  });

  const titles = { middleman: '🤝 MIDDLEMAN REQUEST', support: '🛟 SUPPORT REQUEST', basepainting: '🎨 BASE PAINTING REQUEST' };
  const embed = new EmbedBuilder().setTitle(titles[type]).setColor(0x5865F2).addFields(
    { name: 'Requester', value: `<@${interaction.user.id}>`, inline: true },
    { name: 'Service', value: type === 'basepainting' ? 'Base Painting' : type === 'Middleman' ? 'Middleman' : 'Support', inline: true }
  );

  if (details.value) embed.addFields({ name: 'Trade Value', value: details.value, inline: true });
  if (details.valueImage) embed.setImage(details.valueImage);
  if (details.supportType) embed.addFields({ name: 'Support Type', value: details.supportType, inline: false });
  if (details.base) { embed.addFields({ name: 'Base Requested', value: details.base, inline: true }).setImage(baseImage(details.base)); }
  if (details.roblox) embed.addFields({ name: 'Roblox Username', value: details.roblox, inline: true });
  if (details.other) embed.addFields({ name: 'Other Trader', value: details.other, inline: false });
  if (details.trade) embed.addFields({ name: 'Trade Details', value: details.trade, inline: false });
  if (details.tip) embed.addFields({ name: 'Tip', value: details.tip, inline: false });
  if (details.notes) embed.addFields({ name: 'Details', value: details.notes, inline: false });

  await channel.send({
    content: type === 'middleman' ? `<@${interaction.user.id}> <@&${mm.id}>` : `<@${interaction.user.id}> <@&${staff.id}>`,
    embeds: [embed],
    components: [closeRow()]
  });
  return interaction.reply({ content: `✅ Your ${type === 'basepainting' ? 'base painting' : type} ticket is ready: ${channel}`, ephemeral: true });
}

function middlemanModal(value) {
  const modal = new ModalBuilder().setCustomId(`fsmm_mm_modal:${value}`).setTitle('FSMM Middleman Request');
  const other = new TextInputBuilder().setCustomId('other').setLabel('Other trader username').setPlaceholder('Roblox / Discord username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
  const trade = new TextInputBuilder().setCustomId('trade').setLabel('What are you trading?').setPlaceholder('Tell us what both sides are trading').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000);
  const tip = new TextInputBuilder().setCustomId('tip').setLabel('Tip (optional)').setPlaceholder('Example: 1M / 2% / Not sure').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100);
  modal.addComponents(new ActionRowBuilder().addComponents(other), new ActionRowBuilder().addComponents(trade), new ActionRowBuilder().addComponents(tip));
  return modal;
}

function supportModal(kind) {
  const modal = new ModalBuilder().setCustomId(`fsmm_support_modal:${kind}`).setTitle('FSMM Support Request');
  const details = new TextInputBuilder().setCustomId('details').setLabel('Tell us what you need').setPlaceholder('Give staff the details they need').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500);
  const username = new TextInputBuilder().setCustomId('roblox').setLabel('Roblox username (optional)').setPlaceholder('Your Roblox username').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100);
  modal.addComponents(new ActionRowBuilder().addComponents(details), new ActionRowBuilder().addComponents(username));
  return modal;
}

function paintingModal(base) {
  const modal = new ModalBuilder().setCustomId(`fsmm_paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`);
  const roblox = new TextInputBuilder().setCustomId('roblox').setLabel('Roblox username').setPlaceholder('Your Roblox username').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100);
  const notes = new TextInputBuilder().setCustomId('notes').setLabel('Extra details (optional)').setPlaceholder('Anything the painter should know?').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000);
  modal.addComponents(new ActionRowBuilder().addComponents(roblox), new ActionRowBuilder().addComponents(notes));
  return modal;
}

async function resetPanels(guild) {
  const { category } = await getRolesAndCategory(guild);
  const old = guild.channels.cache.filter(c => c.type === ChannelType.GuildText && PANEL_NAMES.includes(c.name));
  for (const ch of old.values()) await ch.delete('Replace old FSMM ticket center with three independent service panels').catch(() => {});

  const panels = [
    {
      name: '🤝・middleman',
      embed: panelEmbed('🤝 FSMM MIDDLEMAN', '**Need a safe middleman?**\n\nChoose the total value of your trade below. You will then fill in the trade details and a private MM ticket will be created.\n\n🔐 Never share passwords, tokens, or recovery codes.'),
      row: middlemanMenu()
    },
    {
      name: '🛟・support',
      embed: panelEmbed('🛟 FSMM SUPPORT', '**Need help from FSMM staff?**\n\nChoose what you need below:\n• Host a giveaway\n• Claim a giveaway\n• Report an issue\n• Apply for a role'),
      row: supportMenu()
    },
    {
      name: '🎨・base-painting',
      embed: panelEmbed('🎨 FSMM BASE PAINTING', '**Want a specific base painted?**\n\nChoose a category, then select the exact base. The ticket will show the selected base and its image to staff.'),
      row: baseCategoryMenu()
    }
  ];

  const created = [];
  for (const p of panels) {
    const ch = await guild.channels.create({ name: p.name, type: ChannelType.GuildText, parent: category.id, topic: `FSMM SERVICE PANEL:${p.name}`, reason: 'FSMM three service panels' });
    await ch.send({ embeds: [p.embed], components: [p.row] });
    created.push(ch);
  }
  return created;
}

client.once('clientReady', async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands.map(c => c.toJSON()) });
    console.log(`FSMM 3-SERVICE SYSTEM ONLINE AS ${client.user.tag}`);
  } catch (error) { console.error('Command registration failed:', error); }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ping') return interaction.reply({ content: '🏓 FSMM 3-SERVICE SYSTEM IS ONLINE.', ephemeral: true });
      if (interaction.commandName === 'setup') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) return interaction.reply({ content: '❌ You need Manage Server to run setup.', ephemeral: true });
        const panels = await resetPanels(interaction.guild);
        return interaction.reply({ content: `✅ Old ticket center removed. Created 3 independent service panels: ${panels.join(' ')}`, ephemeral: true });
      }
      if (interaction.commandName === 'ticket') {
        const type = interaction.options.getString('type');
        if (type === 'middleman') return interaction.reply({ embeds: [panelEmbed('🤝 MIDDLEMAN', 'Choose the total trade value below.')], components: [middlemanMenu()], ephemeral: true });
        if (type === 'support') return interaction.reply({ embeds: [panelEmbed('🛟 SUPPORT', 'Choose what you need help with.')], components: [supportMenu()], ephemeral: true });
        return interaction.reply({ embeds: [panelEmbed('🎨 BASE PAINTING', 'Choose a base category below.')], components: [baseCategoryMenu()], ephemeral: true });
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'fsmm_mm_value') return interaction.showModal(middlemanModal(interaction.values[0]));
      if (interaction.customId === 'fsmm_support_type') return interaction.showModal(supportModal(interaction.values[0]));
      if (interaction.customId === 'fsmm_base_category') {
        const group = interaction.values[0];
        return interaction.reply({ embeds: [panelEmbed(`🎨 ${BASE_LABELS[group].toUpperCase()}`, 'Select the exact base you want painted below.')], components: [baseMenu(group)], ephemeral: true });
      }
      if (interaction.customId.startsWith('fsmm_base_pick:')) return interaction.showModal(paintingModal(interaction.values[0]));
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('fsmm_mm_modal:')) {
        const value = interaction.customId.slice('fsmm_mm_modal:'.length);
        return createTicket(interaction, 'middleman', {
          value,
          valueImage: VALUE_IMAGES[value],
          other: interaction.fields.getTextInputValue('other'),
          trade: interaction.fields.getTextInputValue('trade'),
          tip: interaction.fields.getTextInputValue('tip') || 'Not specified'
        });
      }
      if (interaction.customId.startsWith('fsmm_support_modal:')) {
        const kind = interaction.customId.slice('fsmm_support_modal:'.length);
        const names = { host_gw: 'Host a Giveaway', claim_gw: 'Claim a Giveaway', report: 'Report', role_apply: 'Apply for a Role' };
        return createTicket(interaction, 'support', {
          supportType: names[kind] || kind,
          notes: interaction.fields.getTextInputValue('details'),
          roblox: interaction.fields.getTextInputValue('roblox') || 'Not provided'
        });
      }
      if (interaction.customId.startsWith('fsmm_paint_modal:')) {
        const base = decodeURIComponent(interaction.customId.slice('fsmm_paint_modal:'.length));
        return createTicket(interaction, 'basepainting', {
          base,
          roblox: interaction.fields.getTextInputValue('roblox'),
          notes: interaction.fields.getTextInputValue('notes') || 'None'
        });
      }
    }

    if (interaction.isButton() && interaction.customId === 'fsmm_close_ticket') {
      const canClose = interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) || interaction.member.roles.cache.some(r => r.name === STAFF_ROLE);
      if (!canClose) return interaction.reply({ content: '❌ Only FSMM staff can close tickets.', ephemeral: true });
      await interaction.reply({ content: '🔒 Closing ticket...' });
      setTimeout(() => interaction.channel.delete('FSMM ticket closed').catch(() => {}), 1000);
    }
  } catch (error) {
    console.error(error);
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Something went wrong. Check the bot logs.', ephemeral: true }).catch(() => {});
  }
});

client.login(TOKEN);
