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

const VERSION = '3.0.0-CLEAN';
const STAFF = 'FSMM Staff';
const MM = 'FSMM Middleman';
const CATEGORY = '🎫 FSMM TICKETS';

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check if the FSMM bot is online.'),
  new SlashCommandBuilder().setName('setup').setDescription('Create the FSMM service panels.'),
  new SlashCommandBuilder().setName('ticket').setDescription('Open an FSMM service directly.')
    .addStringOption(o => o.setName('type').setDescription('Service').setRequired(true).addChoices(
      { name: 'Middleman', value: 'middleman' },
      { name: 'Support', value: 'support' },
      { name: 'Base Painting', value: 'basepainting' }
    ))
].map(c => c.toJSON());

const bases = {
  classic: ['Default','Gold','Diamond','Rainbow'],
  mutation: ['Candy','Lava','Galaxy','Yin Yang','Radioactive','Cursed','Divine','Cyber','Phantom','Crystal'],
  seasonal: ['Halloween','Aquatic','Christmas','Gingerbread','Taco',"Valentine's",'Rose','Lucky','Bunny Basket','Easter','Summer','Pot of Gold','Red Octo','Bee Emperor','Honey Bee'],
  og: ['Strawberry','Meowl','Skibidi','John Pork','Headless Horseman','Spyder'],
  admin: ["SpyderSammy's Base",'Tralalero','1 of 1']
};
const baseFiles = {
  Default:'DefaultBase.png', Gold:'GoldBase.png', Diamond:'DiamondBase.png', Rainbow:'RainbowBase.png',
  Candy:'CandyBase.png', Lava:'LavaBase.png', Galaxy:'GalaxyBase.png', 'Yin Yang':'YinYangBase.png', Radioactive:'RadioactiveBase.png', Cursed:'CursedBase.png', Divine:'DivineBase.png', Cyber:'CyberBase.png', Phantom:'PhantomBase.png', Crystal:'CrystalBase.png',
  Halloween:'HalloweenBase.png', Aquatic:'AquaticBase.png', Christmas:'ChristmasBase.png', Gingerbread:'GingerbreadBase.png', Taco:'TacoBase.png', "Valentine's":'ValentinesBase.png', Rose:'RoseBase.png', Lucky:'LuckyBase.png', 'Bunny Basket':'BunnyBasketBase.png', Easter:'EasterBase.png', Summer:'SummerBase.png', 'Pot of Gold':'PotOfGoldBase.png', 'Red Octo':'RedOctoBase.png', 'Bee Emperor':'BeeEmperorBase.png', 'Honey Bee':'HoneyBeeBase.png',
  Strawberry:'StrawberryBase.png', Meowl:'MeowlBase.png', Skibidi:'SkibidiBase.png', 'John Pork':'JohnPorkBase.png', 'Headless Horseman':'HeadlessHorsemanBase.png', Spyder:'SpyderBase.png', "SpyderSammy's Base":'SpyderSammysBase.png', Tralalero:'TralaleroBase.png', '1 of 1':'1of1Base.png'
};
function baseImage(name) { return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(baseFiles[name] || name + 'Base.png')}`; }

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

function row(component) { return new ActionRowBuilder().addComponents(component); }
function closeButton() { return row(new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)); }
function embed(title, description) { return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({ text: 'FSMM • Trusted Trading & Services' }); }

function mmMenu() { return row(new StringSelectMenuBuilder().setCustomId('mm_value').setPlaceholder('Select trade value...').addOptions(
  {label:'10M - 250M',value:'10M - 250M'}, {label:'250M - 500M',value:'250M - 500M'}, {label:'1B+',value:'1B+'}, {label:'OG',value:'OG'}
)); }
function supportMenu() { return row(new StringSelectMenuBuilder().setCustomId('support_type').setPlaceholder('Choose what you need...').addOptions(
  {label:'Host a Giveaway',value:'host_gw'}, {label:'Claim a Giveaway',value:'claim_gw'}, {label:'Report',value:'report'}, {label:'Apply for a Role',value:'role_apply'}
)); }
function categoryMenu() { return row(new StringSelectMenuBuilder().setCustomId('base_category').setPlaceholder('Choose a base category...').addOptions(
  {label:'Classic',value:'classic',description:'Default, Gold, Diamond, Rainbow'},
  {label:'Mutation',value:'mutation',description:'Mutation bases'},
  {label:'Seasonal',value:'seasonal',description:'Seasonal bases'},
  {label:'OG',value:'og',description:'OG bases'},
  {label:'Admin / Special',value:'admin',description:'Special bases'}
)); }
function baseMenu(group) { return row(new StringSelectMenuBuilder().setCustomId(`base_pick:${group}`).setPlaceholder('Select a base...').addOptions(bases[group].map(x => ({label:x,value:x})))); }

async function roles(guild) {
  let staff = guild.roles.cache.find(r => r.name === STAFF) || await guild.roles.create({name:STAFF,reason:'FSMM ticket system'});
  let mm = guild.roles.cache.find(r => r.name === MM) || await guild.roles.create({name:MM,reason:'FSMM ticket system'});
  let cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === CATEGORY) || await guild.channels.create({name:CATEGORY,type:ChannelType.GuildCategory,reason:'FSMM ticket system'});
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
  const ping = type === 'middleman' ? `<@${interaction.user.id}> <@&${mm.id}>` : `<@${interaction.user.id}> <@&${staff.id}>`;
  await ch.send({content:ping,embeds:[e],components:[closeButton()]});
  return interaction.reply({content:`✅ Ticket created: ${ch}`,ephemeral:true});
}

function mmModal(value) {
  const m = new ModalBuilder().setCustomId(`mm_modal:${value}`).setTitle('FSMM Middleman');
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
function paintModal(base) {
  const m = new ModalBuilder().setCustomId(`paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`);
  const a = new TextInputBuilder().setCustomId('roblox').setLabel('Roblox username').setStyle(TextInputStyle.Short).setRequired(true);
  const b = new TextInputBuilder().setCustomId('notes').setLabel('Extra details (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false);
  return m.addComponents(row(a),row(b));
}

async function setup(guild) {
  const {cat} = await roles(guild);
  const oldNames = ['🤝・middleman','🛟・support','🎨・base-painting','🎫・ticket-center','ticket-center','fsmm-ticket-panel'];
  for (const c of guild.channels.cache.filter(x => x.type === ChannelType.GuildText && oldNames.includes(x.name)).values()) await c.delete('FSMM clean setup').catch(()=>{});
  const configs = [
    ['🤝・middleman',embed('🤝 FSMM MIDDLEMAN','Need a safe middleman?\n\nSelect your trade value below and fill in the request form. A private ticket will be created.'),mmMenu()],
    ['🛟・support',embed('🛟 FSMM SUPPORT','Need help from FSMM staff?\n\nChoose the service you need below.'),supportMenu()],
    ['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Want your base painted?\n\nChoose a category, select the exact base, then complete the request form.'),categoryMenu()]
  ];
  for (const [name,e,r] of configs) await guild.channels.create({name,type:ChannelType.GuildText,parent:cat.id,permissionOverwrites:[{id:guild.roles.everyone.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]}]}).then(c=>c.send({embeds:[e],components:[r]}));
}

client.once('ready', async () => {
  console.log(`[FSMM ${VERSION}] ONLINE AS ${client.user.tag}`);
  const rest = new REST({version:'10'}).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});
  console.log('[FSMM 3.0.0] COMMANDS REGISTERED: /ping /setup /ticket');
});

client.on('interactionCreate', async i => {
  try {
    if (i.isChatInputCommand()) {
      if (i.commandName === 'ping') return i.reply({content:`🏓 Pong! FSMM ${VERSION} is online.`,ephemeral:true});
      if (i.commandName === 'setup') { await i.deferReply({ephemeral:true}); await setup(i.guild); return i.editReply('✅ FSMM panels rebuilt successfully.'); }
      if (i.commandName === 'ticket') return createTicket(i,i.options.getString('type'));
    }
    if (i.isStringSelectMenu()) {
      if(i.customId === 'mm_value') return i.showModal(mmModal(i.values[0]));
      if(i.customId === 'support_type') return i.showModal(supportModal(i.values[0]));
      if(i.customId === 'base_category') return i.update({content:'Select the exact base you want painted:',embeds:[],components:[baseMenu(i.values[0])]});
      if(i.customId.startsWith('base_pick:')) return i.showModal(paintModal(i.values[0]));
    }
    if(i.isModalSubmit()) {
      if(i.customId.startsWith('mm_modal:')) return createTicket(i,'middleman',{value:i.customId.split(':')[1],other:i.fields.getTextInputValue('other'),trade:i.fields.getTextInputValue('trade'),tip:i.fields.getTextInputValue('tip')});
      if(i.customId.startsWith('support_modal:')) return createTicket(i,'support',{supportType:i.customId.split(':')[1],notes:i.fields.getTextInputValue('notes'),roblox:i.fields.getTextInputValue('roblox')});
      if(i.customId.startsWith('paint_modal:')) { const base=decodeURIComponent(i.customId.split(':')[1]); return createTicket(i,'basepainting',{base,roblox:i.fields.getTextInputValue('roblox'),notes:i.fields.getTextInputValue('notes')}); }
    }
    if(i.isButton() && i.customId === 'fsmm_close') {
      if(!i.memberPermissions?.has(PermissionFlagsBits.ManageChannels) && !i.member.roles.cache.some(r => r.name === STAFF)) return i.reply({content:'❌ Only FSMM Staff or Manage Channels can close tickets.',ephemeral:true});
      await i.reply('🔒 Closing ticket...'); setTimeout(()=>i.channel.delete('FSMM ticket closed').catch(()=>{}),1200);
    }
  } catch(err) { console.error('[FSMM ERROR]',err); if(!i.replied && !i.deferred) await i.reply({content:'❌ Something went wrong. Check Railway logs.',ephemeral:true}).catch(()=>{}); }
});

client.login(TOKEN);
