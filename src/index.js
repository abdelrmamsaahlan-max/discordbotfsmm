require('dotenv').config();
const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, PermissionFlagsBits, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID');

const VERSION = '3.1.0';
const STAFF = 'FSMM Staff';
const MM = 'FSMM Middleman';
const CATEGORY = '🎫 FSMM SERVICES';

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if the FSMM bot is online.'),
  new SlashCommandBuilder().setName('setup').setDescription('Create the three FSMM service panels.')
].map(c => c.toJSON());

// Current base catalog researched September 2026: 38 bases across Classic, Mutation, Seasonal, OG and Admin/Special.
const bases = {
  classic: ['Default','Gold','Diamond','Rainbow'],
  mutation: ['Candy','Lava','Galaxy','Yin Yang','Radioactive','Cursed','Divine','Cyber','Phantom','Crystal'],
  seasonal: ['Halloween','Aquatic','Christmas','Gingerbread','Taco',"Valentine's",'Rose','Lucky','Bunny Basket','Easter','Summer','Pot of Gold','Red Octo','Bee Emperor','Honey Bee'],
  og: ['Strawberry','Meowl','Skibidi','John Pork','Headless Horseman','Spyder'],
  admin: ["SpyderSammy's Base",'Tralalero','1 of 1']
};

// Discord select-menu options cannot contain images. We therefore show the real base image
// immediately after the user selects a base, and use the requested images in the MM flow too.
const baseFiles = {
  Default:'DefaultBase.png', Gold:'GoldBase.png', Diamond:'DiamondBase.png', Rainbow:'RainbowBase.png',
  Candy:'CandyBase.png', Lava:'LavaBase.png', Galaxy:'GalaxyBase.png', 'Yin Yang':'YinYangBase.png', Radioactive:'RadioactiveBase.png', Cursed:'CursedBase.png', Divine:'DivineBase.png', Cyber:'CyberBase.png', Phantom:'PhantomBase.png', Crystal:'CrystalBase.png',
  Halloween:'HalloweenBase.png', Aquatic:'AquaticBase.png', Christmas:'ChristmasBase.png', Gingerbread:'GingerbreadBase.png', Taco:'TacoBase.png', "Valentine's":'ValentinesBase.png', Rose:'RoseBase.png', Lucky:'LuckyBase.png', 'Bunny Basket':'BunnyBasketBase.png', Easter:'EasterBase.png', Summer:'SummerBase.png', 'Pot of Gold':'PotOfGoldBase.png', 'Red Octo':'RedOctoBase.png', 'Bee Emperor':'BeeEmperorBase.png', 'Honey Bee':'HoneyBeeBase.png',
  Strawberry:'StrawberryBase.png', Meowl:'MeowlBase.png', Skibidi:'SkibidiBase.png', 'John Pork':'JohnPorkBase.png', 'Headless Horseman':'HeadlessHorsemanBase.png', Spyder:'SpyderBase.png', "SpyderSammy's Base":'SpyderSammysBase.png', Tralalero:'TralaleroBase.png', '1 of 1':'1of1Base.png'
};
function baseImage(name) {
  return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(baseFiles[name] || name + 'Base.png')}`;
}

const valueImages = {
  '10M - 250M':'https://static.u7buy.com/2026/03/05/13f59a8a77664b9ba7c3881370a3dbb9.png',
  '250M - 500M':'https://i.ebayimg.com/images/g/3-0AAeSw23NpZcT0/s-l1200.png',
  '1B+':'https://i.ebayimg.com/images/g/3-0AAeSw23NpZcT0/s-l1200.png',
  'OG':'https://www.eldorado.gg/blog/wp-content/uploads/2025/12/Meowl.webp'
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
function row(component) { return new ActionRowBuilder().addComponents(component); }
function closeButton() { return row(new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)); }
function embed(title, description) { return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({ text: 'FSMM • Trusted Trading & Services' }); }

function mmMenu() {
  return row(new StringSelectMenuBuilder().setCustomId('mm_value').setPlaceholder('Select trade value...').addOptions(
    {label:'10M - 250M',value:'10M - 250M',description:'Middleman for trades from 10M to 250M'},
    {label:'250M - 500M',value:'250M - 500M',description:'Middleman for trades from 250M to 500M'},
    {label:'1B+',value:'1B+',description:'Middleman for trades worth 1B+'},
    {label:'OG',value:'OG',description:'Middleman for OG trades'}
  ));
}
function supportMenu() {
  return row(new StringSelectMenuBuilder().setCustomId('support_type').setPlaceholder('Choose what you need...').addOptions(
    {label:'Host a Giveaway',value:'host_gw',description:'Request FSMM to host a giveaway'},
    {label:'Claim a Giveaway',value:'claim_gw',description:'Get help claiming a giveaway'},
    {label:'Report',value:'report',description:'Report a problem or user to FSMM staff'},
    {label:'Apply for a Role',value:'role_apply',description:'Apply for an FSMM staff or service role'}
  ));
}
function categoryMenu() {
  return row(new StringSelectMenuBuilder().setCustomId('base_category').setPlaceholder('Choose a base category...').addOptions(
    {label:'Classic',value:'classic',description:'Default, Gold, Diamond, Rainbow'},
    {label:'Mutation',value:'mutation',description:'Candy, Lava, Galaxy, Yin Yang and more'},
    {label:'Seasonal',value:'seasonal',description:'Event and seasonal bases'},
    {label:'OG',value:'og',description:'Strawberry, Meowl, Skibidi and more'},
    {label:'Admin / Special',value:'admin',description:'Special and admin-exclusive bases'}
  ));
}
function baseMenu(group) {
  return row(new StringSelectMenuBuilder().setCustomId(`base_pick:${group}`).setPlaceholder('Select the exact base...').addOptions(
    bases[group].map(x => ({label:x,value:x}))
  ));
}

async function roles(guild) {
  const staff = guild.roles.cache.find(r => r.name === STAFF) || await guild.roles.create({name:STAFF,reason:'FSMM service ticket system'});
  const mm = guild.roles.cache.find(r => r.name === MM) || await guild.roles.create({name:MM,reason:'FSMM middleman system'});
  const cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === CATEGORY) || await guild.channels.create({name:CATEGORY,type:ChannelType.GuildCategory,reason:'FSMM service panels'});
  return {staff,mm,cat};
}

async function createTicket(interaction, type, d={}) {
  const {staff,mm,cat} = await roles(interaction.guild);
  const old = interaction.guild.channels.cache.find(c => c.parentId === cat.id && c.topic === `FSMM_OWNER:${interaction.user.id}`);
  if (old) return interaction.reply({content:`⚠️ You already have an open ticket: ${old}`,ephemeral:true});

  const prefix = type === 'middleman' ? 'mm' : type === 'support' ? 'support' : 'paint';
  const name = `${prefix}-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,45) || 'user'}`;
  const overwrites = [
    {id:interaction.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
    {id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
  ];
  if (type === 'middleman') overwrites.push({id:mm.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});

  const ch = await interaction.guild.channels.create({name,type:ChannelType.GuildText,parent:cat.id,topic:`FSMM_OWNER:${interaction.user.id}`,permissionOverwrites:overwrites});
  const titles = {middleman:'🤝 MIDDLEMAN REQUEST',support:'🛟 SUPPORT REQUEST',basepainting:'🎨 BASE PAINTING REQUEST'};
  const e = embed(titles[type],'A private FSMM ticket has been opened. A staff member will help you here.');
  e.addFields({name:'Requester',value:`<@${interaction.user.id}>`,inline:true},{name:'Service',value:type === 'basepainting' ? 'Base Painting' : type[0].toUpperCase()+type.slice(1),inline:true});
  if(d.value) e.addFields({name:'Trade Value',value:d.value,inline:true});
  if(d.other) e.addFields({name:'Other Trader',value:d.other});
  if(d.trade) e.addFields({name:'Trade Details',value:d.trade});
  if(d.tip) e.addFields({name:'Tip',value:d.tip});
  if(d.supportType) e.addFields({name:'Request Type',value:d.supportType});
  if(d.notes) e.addFields({name:'Details',value:d.notes});
  if(d.roblox) e.addFields({name:'Roblox Username',value:d.roblox,inline:true});
  if(d.base) { e.addFields({name:'Base Requested',value:d.base,inline:true}); e.setImage(baseImage(d.base)); }
  if(d.value && valueImages[d.value]) e.setThumbnail(valueImages[d.value]);

  const ping = type === 'middleman' ? `<@${interaction.user.id}> <@&${mm.id}>` : `<@${interaction.user.id}> <@&${staff.id}>`;
  await ch.send({content:ping,embeds:[e],components:[closeButton()]});
  return interaction.reply({content:`✅ Ticket created: ${ch}`,ephemeral:true});
}

function mmModal(value) {
  const m = new ModalBuilder().setCustomId(`mm_modal:${encodeURIComponent(value)}`).setTitle('FSMM Middleman');
  const a = new TextInputBuilder().setCustomId('other').setLabel('Other trader username').setStyle(TextInputStyle.Short).setRequired(true);
  const b = new TextInputBuilder().setCustomId('trade').setLabel('What are you trading?').setStyle(TextInputStyle.Paragraph).setRequired(true);
  const c = new TextInputBuilder().setCustomId('tip').setLabel('Tip (optional)').setStyle(TextInputStyle.Short).setRequired(false);
  return m.addComponents(row(a),row(b),row(c));
}
function supportModal(kind) {
  const m = new ModalBuilder().setCustomId(`support_modal:${kind}`).setTitle('FSMM Support');
  const a = new TextInputBuilder().setCustomId('notes').setLabel('Tell us what you need').setStyle(TextInputStyle.Paragraph).setRequired(true);
  const b = new TextInputBuilder().setCustomId('roblox').setLabel('Roblox username (optional)').setStyle(TextInputStyle.Short).setRequired(false);
  return m.addComponents(row(a),row(b));
}
function paintPreview(base) {
  return embed(`🎨 ${base} Base`, 'You selected this base for painting. Complete the form below to open your private request.').setImage(baseImage(base));
}
function paintModal(base) {
  const m = new ModalBuilder().setCustomId(`paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`);
  const a = new TextInputBuilder().setCustomId('roblox').setLabel('Roblox username').setStyle(TextInputStyle.Short).setRequired(true);
  const b = new TextInputBuilder().setCustomId('notes').setLabel('Extra details (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false);
  return m.addComponents(row(a),row(b));
}

async function setup(guild) {
  const {cat} = await roles(guild);
  const oldNames = [
    '🤝・middleman','🛟・support','🎨・base-painting',
    '🎫・ticket-center','ticket-center','fsmm-ticket-panel','🎫・tickets','🎟️・tickets'
  ];
  for (const c of guild.channels.cache.filter(x => x.type === ChannelType.GuildText && oldNames.includes(x.name)).values()) await c.delete('FSMM removed old ticket center / trade system').catch(()=>{});

  // Remove any old trade-ticket panel channels by common legacy names.
  for (const c of guild.channels.cache.filter(x => x.type === ChannelType.GuildText && /trade.*ticket|ticket.*trade/i.test(x.name)).values()) await c.delete('FSMM removed legacy trade ticket system').catch(()=>{});

  const configs = [
    ['🤝・middleman',embed('🤝 FSMM MIDDLEMAN','Need a safe middleman?\n\nSelect your trade value below. After selecting, you will fill out a short request form and a private ticket will be created.'),mmMenu()],
    ['🛟・support',embed('🛟 FSMM SUPPORT','Need help from FSMM staff?\n\nChoose exactly what you need: host a giveaway, claim a giveaway, report something, or apply for a role.'),supportMenu()],
    ['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Want your base painted?\n\nChoose a category, select the exact base, preview its image, then complete the request form.'),categoryMenu()]
  ];

  // Rebuild only these three service panels; there is deliberately no ticket-center panel.
  for (const [name,e,r] of configs) {
    const existing = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
    if (existing) await existing.delete('FSMM rebuild service panel').catch(()=>{});
    const channel = await guild.channels.create({
      name,
      type:ChannelType.GuildText,
      parent:cat.id,
      permissionOverwrites:[{id:guild.roles.everyone.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]}]
    });
    await channel.send({embeds:[e],components:[r]});
  }
}

client.once('ready', async () => {
  console.log(`[FSMM ${VERSION}] ONLINE AS ${client.user.tag}`);
  const rest = new REST({version:'10'}).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});
  console.log('[FSMM 3.1.0] COMMANDS REGISTERED: /ping /setup');
});

client.on('interactionCreate', async i => {
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === 'ping') return i.reply({content:`🏓 Pong! FSMM ${VERSION} is online.`,ephemeral:true});
      if (i.commandName === 'setup') { await i.deferReply({ephemeral:true}); await setup(i.guild); return i.editReply('✅ FSMM rebuilt: Middleman + Support + Base Painting only. No ticket center.'); }
    }

    if (i.isStringSelectMenu()) {
      if(i.customId === 'mm_value') return i.showModal(mmModal(i.values[0]));
      if(i.customId === 'support_type') return i.showModal(supportModal(i.values[0]));
      if(i.customId === 'base_category') return i.update({content:'Select the exact base you want painted:',embeds:[],components:[baseMenu(i.values[0])]});
      if(i.customId.startsWith('base_pick:')) {
        const base = i.values[0];
        return i.update({content:`Selected **${base} Base**. Fill in the form to open the private painting ticket.`,embeds:[paintPreview(base)],components:[row(new ButtonBuilder().setCustomId(`paint_start:${encodeURIComponent(base)}`).setLabel('Start Base Painting Ticket').setStyle(ButtonStyle.Primary))]});
      }
    }

    if(i.isButton() && i.customId.startsWith('paint_start:')) {
      const base = decodeURIComponent(i.customId.slice('paint_start:'.length));
      return i.showModal(paintModal(base));
    }

    if(i.isModalSubmit()) {
      if(i.customId.startsWith('mm_modal:')) {
        const value=decodeURIComponent(i.customId.slice('mm_modal:'.length));
        return createTicket(i,'middleman',{value,other:i.fields.getTextInputValue('other'),trade:i.fields.getTextInputValue('trade'),tip:i.fields.getTextInputValue('tip')});
      }
      if(i.customId.startsWith('support_modal:')) return createTicket(i,'support',{supportType:i.customId.split(':')[1],notes:i.fields.getTextInputValue('notes'),roblox:i.fields.getTextInputValue('roblox')});
      if(i.customId.startsWith('paint_modal:')) {
        const base=decodeURIComponent(i.customId.slice('paint_modal:'.length));
        return createTicket(i,'basepainting',{base,roblox:i.fields.getTextInputValue('roblox'),notes:i.fields.getTextInputValue('notes')});
      }
    }

    if(i.isButton() && i.customId === 'fsmm_close') {
      if(!i.memberPermissions?.has(PermissionFlagsBits.ManageChannels) && !i.member.roles.cache.some(r => r.name === STAFF)) return i.reply({content:'❌ Only FSMM Staff or Manage Channels can close tickets.',ephemeral:true});
      await i.reply('🔒 Closing ticket...');
      setTimeout(()=>i.channel.delete('FSMM ticket closed').catch(()=>{}),1200);
    }
  } catch(err) {
    console.error('[FSMM ERROR]',err);
    if(!i.replied && !i.deferred) await i.reply({content:'❌ Something went wrong. Check Railway logs.',ephemeral:true}).catch(()=>{});
  }
});

client.login(TOKEN);
