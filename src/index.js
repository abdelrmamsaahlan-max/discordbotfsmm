require('dotenv').config();
const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, PermissionFlagsBits, ActionRowBuilder,
  StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID');

const VERSION = '4.1.0';
const STAFF = 'FSMM Staff';
const MM = 'FSMM Middleman';
const OWNER = 'Owner';
const CATEGORY = '🎫 FSMM SERVICES';

const commands = [
  new SlashCommandBuilder().setName('ping').setDescription('Check the FSMM bot latency and status.'),
  new SlashCommandBuilder().setName('help').setDescription('Show all FSMM bot commands.'),
  new SlashCommandBuilder().setName('serverinfo').setDescription('Show useful information about this server.'),
  new SlashCommandBuilder().setName('userinfo').setDescription('Show useful information about a server member.').addUserOption(o => o.setName('user').setDescription('Member to inspect').setRequired(false)),
  new SlashCommandBuilder().setName('avatar').setDescription('Show a member avatar.').addUserOption(o => o.setName('user').setDescription('Member whose avatar you want').setRequired(false)),
  new SlashCommandBuilder().setName('membercount').setDescription('Show the current server member count.'),
  new SlashCommandBuilder().setName('botinfo').setDescription('Show FSMM bot information.'),
  new SlashCommandBuilder().setName('setup').setDescription('Owner-only: create or repair the FSMM service panels.'),
  new SlashCommandBuilder().setName('ticket').setDescription('Owner-only: rebuild the FSMM ticket service panels.')
].map(c => c.toJSON());

const mutationBases = ['Candy','Lava','Galaxy','Yin Yang','Radioactive','Cursed','Divine','Cyber','Phantom','Crystal'];
const baseFiles = {
  Candy:'CandyBase.png', Lava:'LavaBase.png', Galaxy:'GalaxyBase.png', 'Yin Yang':'YinYangBase.png',
  Radioactive:'RadioactiveBase.png', Cursed:'CursedBase.png', Divine:'DivineBase.png', Cyber:'CyberBase.png',
  Phantom:'PhantomBase.png', Crystal:'CrystalBase.png'
};
const baseEmojiAliases = {
  'Yin Yang':['yinyang','yinyangbase','yinyangmutation','yinyangbaseemoji'],
  Radioactive:['radioactive','radiation','radioactivebase'], Candy:['candy','candybase'], Lava:['lava','lavabase'],
  Galaxy:['galaxy','galaxybase'], Cursed:['cursed','cursedbase'], Divine:['divine','divinebase'],
  Cyber:['cyber','cyberbase'], Phantom:['phantom','phantombase'], Crystal:['crystal','crystalbase']
};

function normalize(value='') { return value.toLowerCase().replace(/[^a-z0-9]/g,''); }
function isOwner(interaction) { return Boolean(interaction.member?.roles?.cache?.some(r => normalize(r.name) === normalize(OWNER))); }
async function ownerOnly(interaction) {
  if (isOwner(interaction)) return true;
  await interaction.reply({content:'❌ This command is **Owner-only**. You need the **Owner** role to use it.',flags:MessageFlags.Ephemeral}).catch(()=>{});
  return false;
}
function baseImage(name) { return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(baseFiles[name] || name+'Base.png')}`; }
function findBaseEmoji(guild, base) {
  const aliases = (baseEmojiAliases[base] || [base]).map(normalize);
  const emoji = guild.emojis.cache.find(e => {
    const n = normalize(e.name);
    return aliases.some(a => n === a || n.includes(a) || a.includes(n));
  });
  return emoji ? {id:emoji.id,name:emoji.name,animated:emoji.animated} : undefined;
}
function missingBaseEmojis(guild) { return mutationBases.filter(base => !findBaseEmoji(guild,base)); }

const valueImages = {
  '10M - 250M':'https://static.u7buy.com/2026/03/05/13f59a8a77664b9ba7c3881370a3dbb9.png',
  '250M - 500M':'https://i.ebayimg.com/images/g/3-0AAeSw23NpZcT0/s-l1200.png',
  '1B+':'https://i.ebayimg.com/images/g/3-0AAeSw23NpZcT0/s-l1200.png',
  OG:'https://www.eldorado.gg/blog/wp-content/uploads/2025/12/Meowl.webp'
};

const client = new Client({intents:[GatewayIntentBits.Guilds]});
const row = component => new ActionRowBuilder().addComponents(component);
function closeButton() { return row(new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)); }
function embed(title,description) { return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({text:`FSMM • v${VERSION}`}); }
function mmMenu() { return row(new StringSelectMenuBuilder().setCustomId('mm_value').setPlaceholder('Select trade value...').addOptions(
  {label:'10M - 250M',value:'10M - 250M',description:'Middleman for trades from 10M to 250M'},
  {label:'250M - 500M',value:'250M - 500M',description:'Middleman for trades from 250M to 500M'},
  {label:'1B+',value:'1B+',description:'Middleman for trades worth 1B+'},
  {label:'OG',value:'OG',description:'Middleman for OG trades'})); }
function supportMenu() { return row(new StringSelectMenuBuilder().setCustomId('support_type').setPlaceholder('Choose what you need...').addOptions(
  {label:'Host a Giveaway',value:'host_gw',description:'Request FSMM to host a giveaway'},
  {label:'Claim a Giveaway',value:'claim_gw',description:'Get help claiming a giveaway'},
  {label:'Report',value:'report',description:'Report a problem or user to FSMM staff'},
  {label:'Apply for a Role',value:'role_apply',description:'Apply for an FSMM staff or service role'})); }
function mutationMenu(guild) { return row(new StringSelectMenuBuilder().setCustomId('mutation_pick').setPlaceholder('🎨 Select a mutation base...').addOptions(
  mutationBases.map(base => ({label:base,value:base,description:`${base} Base • mutation painting`,emoji:findBaseEmoji(guild,base)})))); }

async function getRoles(guild) {
  const staff = guild.roles.cache.find(r=>normalize(r.name)===normalize(STAFF)) || await guild.roles.create({name:STAFF,reason:'FSMM service ticket system'});
  const mm = guild.roles.cache.find(r=>normalize(r.name)===normalize(MM)) || await guild.roles.create({name:MM,reason:'FSMM middleman system'});
  const cat = guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory && c.name===CATEGORY) || await guild.channels.create({name:CATEGORY,type:ChannelType.GuildCategory,reason:'FSMM service panels'});
  return {staff,mm,cat};
}
function cleanUsername(user) { return user.username.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,45) || 'user'; }

async function createTicket(interaction,type,d={}) {
  const {staff,mm,cat}=await getRoles(interaction.guild);
  const old=interaction.guild.channels.cache.find(c=>c.parentId===cat.id && c.topic===`FSMM_OWNER:${interaction.user.id}`);
  if(old) return interaction.reply({content:`⚠️ You already have an open ticket: ${old}`,flags:MessageFlags.Ephemeral});
  const prefix=type==='middleman'?'mm':type==='support'?'support':'paint';
  const name=`${prefix}-${cleanUsername(interaction.user)}`;
  const overwrites=[
    {id:interaction.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:interaction.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
    {id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
  ];
  if(type==='middleman') overwrites.push({id:mm.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
  const ch=await interaction.guild.channels.create({name,type:ChannelType.GuildText,parent:cat.id,topic:`FSMM_OWNER:${interaction.user.id}`,permissionOverwrites:overwrites});
  const titles={middleman:'🤝 MIDDLEMAN REQUEST',support:'🛟 SUPPORT REQUEST',basepainting:'🎨 BASE PAINTING REQUEST'};
  const e=embed(titles[type],'A private FSMM ticket has been opened. A staff member will help you here.');
  e.addFields({name:'Requester',value:`<@${interaction.user.id}>`,inline:true},{name:'Service',value:type==='basepainting'?'Base Painting':type[0].toUpperCase()+type.slice(1),inline:true});
  if(d.value)e.addFields({name:'Trade Value',value:d.value,inline:true}); if(d.other)e.addFields({name:'Other Trader',value:d.other}); if(d.trade)e.addFields({name:'Trade Details',value:d.trade}); if(d.tip)e.addFields({name:'Tip',value:d.tip}); if(d.supportType)e.addFields({name:'Request Type',value:d.supportType}); if(d.notes)e.addFields({name:'Details',value:d.notes}); if(d.roblox)e.addFields({name:'Roblox Username',value:d.roblox,inline:true});
  if(d.base){e.addFields({name:'Base Requested',value:d.base,inline:true});e.setImage(baseImage(d.base));}
  if(d.value && valueImages[d.value]) e.setThumbnail(valueImages[d.value]);
  const ping=type==='middleman'?`<@${interaction.user.id}> <@&${mm.id}>`:`<@${interaction.user.id}> <@&${staff.id}>`;
  await ch.send({content:ping,embeds:[e],components:[closeButton()]});
  return interaction.reply({content:`✅ Ticket created: ${ch}`,flags:MessageFlags.Ephemeral});
}

function mmModal(value){const m=new ModalBuilder().setCustomId(`mm_modal:${encodeURIComponent(value)}`).setTitle('FSMM Middleman');const a=new TextInputBuilder().setCustomId('other').setLabel('Other trader username').setStyle(TextInputStyle.Short).setRequired(true);const b=new TextInputBuilder().setCustomId('trade').setLabel('What are you trading?').setStyle(TextInputStyle.Paragraph).setRequired(true);const c=new TextInputBuilder().setCustomId('tip').setLabel('Tip (optional)').setStyle(TextInputStyle.Short).setRequired(false);return m.addComponents(row(a),row(b),row(c));}
function supportModal(kind){const m=new ModalBuilder().setCustomId(`support_modal:${kind}`).setTitle('FSMM Support');const a=new TextInputBuilder().setCustomId('notes').setLabel('Tell us what you need').setStyle(TextInputStyle.Paragraph).setRequired(true);const b=new TextInputBuilder().setCustomId('roblox').setLabel('Roblox username (optional)').setStyle(TextInputStyle.Short).setRequired(false);return m.addComponents(row(a),row(b));}
function paintPreview(base,guild){const emoji=findBaseEmoji(guild,base);const e=embed(`🎨 ${base} Base`,'You selected this mutation base.\n\nThis preview is only visible to you.');e.setImage(baseImage(base));if(emoji)e.setFooter({text:`FSMM • ${emoji.name} • Mutation Base`});return e;}
function paintModal(base){const m=new ModalBuilder().setCustomId(`paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`);const a=new TextInputBuilder().setCustomId('roblox').setLabel('Roblox username').setStyle(TextInputStyle.Short).setRequired(true);const b=new TextInputBuilder().setCustomId('notes').setLabel('Extra details (optional)').setStyle(TextInputStyle.Paragraph).setRequired(false);return m.addComponents(row(a),row(b));}
function paintPreviewButtons(base){return row(new ButtonBuilder().setCustomId(`paint_start:${encodeURIComponent(base)}`).setLabel('Start Base Painting Ticket').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('paint_cancel').setLabel('Cancel Preview').setStyle(ButtonStyle.Secondary));}
function panelConfigs(guild){return [
  ['🤝・middleman',embed('🤝 FSMM MIDDLEMAN','Need a safe middleman?\n\nSelect your trade value below. After selecting, you will fill out a short request form and a private ticket will be created.'),mmMenu()],
  ['🛟・support',embed('🛟 FSMM SUPPORT','Need help from FSMM staff?\n\nChoose exactly what you need: host a giveaway, claim a giveaway, report something, or apply for a role.'),supportMenu()],
  ['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Want your base painted?\n\nOnly mutation bases are available here. Select the mutation base you want, preview it privately, then start your request.'),mutationMenu(guild)]
];}
async function upsertPanel(channel,e,components){const messages=await channel.messages.fetch({limit:20}).catch(()=>null);const panel=messages?.find(m=>m.author.id===client.user.id && m.components.length>0);if(panel)return panel.edit({embeds:[e],components:[components]});return channel.send({embeds:[e],components:[components]});}
async function setup(guild){const {cat}=await getRoles(guild);const oldNames=['🎫・ticket-center','ticket-center','fsmm-ticket-panel','🎫・tickets','🎟️・tickets'];for(const c of guild.channels.cache.filter(x=>x.type===ChannelType.GuildText&&oldNames.includes(x.name)).values())await c.delete('FSMM removed legacy ticket center').catch(()=>{});for(const c of guild.channels.cache.filter(x=>x.type===ChannelType.GuildText&&/trade.*ticket|ticket.*trade/i.test(x.name)).values())await c.delete('FSMM removed legacy trade ticket system').catch(()=>{});for(const [name,e,component] of panelConfigs(guild)){let channel=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===name&&c.parentId===cat.id);if(!channel)channel=await guild.channels.create({name,type:ChannelType.GuildText,parent:cat.id,permissionOverwrites:[{id:guild.roles.everyone.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]}],reason:'FSMM service panel'});await upsertPanel(channel,e,component);}}
function helpEmbed(){return embed('🤖 FSMM BOT COMMANDS',['**Everyone:**','`/ping` — Check bot status and latency.','`/help` — Show this command list.','`/serverinfo` — Server information.','`/userinfo` — Member information.','`/avatar` — Show a member avatar.','`/membercount` — Current member count.','`/botinfo` — Bot version and uptime.','','**Owner only:**','`/setup` — Repair/create the FSMM panels.','`/ticket` — Rebuild the FSMM ticket panels.'].join('\n'));}

client.once('ready',async()=>{console.log(`[FSMM ${VERSION}] ONLINE AS ${client.user.tag}`);try{const rest=new REST({version:'10'}).setToken(TOKEN);await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});console.log(`[FSMM ${VERSION}] COMMANDS REGISTERED: /ping /help /serverinfo /userinfo /avatar /membercount /botinfo /setup /ticket`);const guild=client.guilds.cache.get(GUILD_ID);if(!guild)return console.error(`[FSMM ${VERSION}] GUILD NOT FOUND`);const missing=missingBaseEmojis(guild);if(missing.length)console.warn(`[FSMM ${VERSION}] MISSING BASE EMOJIS: ${missing.join(', ')}`);else console.log(`[FSMM ${VERSION}] ALL BASE EMOJIS FOUND`);console.log(`[FSMM ${VERSION}] STARTUP COMPLETE — panels are NOT auto-recreated. Use /setup only when the Owner needs to repair panels.`);}catch(error){console.error(`[FSMM ${VERSION}] READY ERROR`,error);}});

client.on('interactionCreate',async i=>{try{
  if(i.isChatInputCommand()){
    if(i.commandName==='ping'){const sent=await i.reply({content:'🏓 Checking...',fetchReply:true,flags:MessageFlags.Ephemeral});const latency=sent.createdTimestamp-i.createdTimestamp;return i.editReply(`🏓 **Pong!**\nBot latency: **${latency}ms**\nAPI latency: **${client.ws.ping}ms**\nStatus: 🟢 Online`);}
    if(i.commandName==='help')return i.reply({embeds:[helpEmbed()],flags:MessageFlags.Ephemeral});
    if(i.commandName==='serverinfo'){const g=i.guild;const e=embed(`🏠 ${g.name}`,'Server information');const icon=g.iconURL({size:256});if(icon)e.setThumbnail(icon);e.addFields({name:'Owner',value:`<@${g.ownerId}>`,inline:true},{name:'Members',value:String(g.memberCount),inline:true},{name:'Channels',value:String(g.channels.cache.size),inline:true},{name:'Roles',value:String(g.roles.cache.size),inline:true},{name:'Boosts',value:String(g.premiumSubscriptionCount||0),inline:true},{name:'Created',value:`<t:${Math.floor(g.createdTimestamp/1000)}:D>`,inline:true});return i.reply({embeds:[e],flags:MessageFlags.Ephemeral});}
    if(i.commandName==='userinfo'){const user=i.options.getUser('user')||i.user;const member=await i.guild.members.fetch(user.id).catch(()=>null);const e=embed(`👤 ${user.username}`,'Member information');e.setThumbnail(user.displayAvatarURL({size:512}));e.addFields({name:'ID',value:user.id,inline:true},{name:'Account Created',value:`<t:${Math.floor(user.createdTimestamp/1000)}:D>`,inline:true},{name:'Joined Server',value:member?.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:D>`:'Unknown',inline:true});return i.reply({embeds:[e],flags:MessageFlags.Ephemeral});}
    if(i.commandName==='avatar'){const user=i.options.getUser('user')||i.user;const e=embed(`🖼️ ${user.username}'s Avatar`,'Full-size avatar');e.setImage(user.displayAvatarURL({size:1024,dynamic:true}));return i.reply({embeds:[e],flags:MessageFlags.Ephemeral});}
    if(i.commandName==='membercount')return i.reply({content:`👥 **${i.guild.memberCount}** members are currently in **${i.guild.name}**.`,flags:MessageFlags.Ephemeral});
    if(i.commandName==='botinfo'){const uptime=Math.floor((Date.now()-client.readyTimestamp)/1000);const d=Math.floor(uptime/86400),h=Math.floor(uptime%86400/3600),m=Math.floor(uptime%3600/60),s=uptime%60;const e=embed('🤖 FSMM BOT INFO','Reliable FSMM utility + service ticket bot.');e.addFields({name:'Version',value:VERSION,inline:true},{name:'Uptime',value:`${d}d ${h}h ${m}m ${s}s`,inline:true},{name:'API Latency',value:`${client.ws.ping}ms`,inline:true});return i.reply({embeds:[e],flags:MessageFlags.Ephemeral});}
    if(i.commandName==='setup'||i.commandName==='ticket'){if(!(await ownerOnly(i)))return;await i.deferReply({flags:MessageFlags.Ephemeral});await setup(i.guild);return i.editReply('✅ **FSMM panels verified successfully.**');}
  }
  if(i.isStringSelectMenu()){
    if(i.customId==='mm_value')return i.showModal(mmModal(i.values[0]));
    if(i.customId==='support_type')return i.showModal(supportModal(i.values[0]));
    if(i.customId==='mutation_pick'){const base=i.values[0];return i.reply({content:`🎨 **${base} Base** selected. This preview is only visible to you.`,embeds:[paintPreview(base,i.guild)],components:[paintPreviewButtons(base)],flags:MessageFlags.Ephemeral});}
  }
  if(i.isButton()){
    if(i.customId==='paint_cancel')return i.update({content:'✅ Preview cancelled. Nothing was changed.',embeds:[],components:[]});
    if(i.customId.startsWith('paint_start:')){const base=decodeURIComponent(i.customId.slice('paint_start:'.length));return i.showModal(paintModal(base));}
    if(i.customId==='fsmm_close'){const canClose=i.memberPermissions?.has(PermissionFlagsBits.ManageChannels)||i.member?.roles?.cache?.some(r=>normalize(r.name)===normalize(STAFF));if(!canClose)return i.reply({content:'❌ Only FSMM Staff or members with Manage Channels can close tickets.',flags:MessageFlags.Ephemeral});await i.reply({content:'🔒 Closing ticket...',flags:MessageFlags.Ephemeral});setTimeout(()=>i.channel.delete('FSMM ticket closed').catch(()=>{}),1000);return;}
  }
  if(i.isModalSubmit()){
    if(i.customId.startsWith('mm_modal:')){const value=decodeURIComponent(i.customId.slice('mm_modal:'.length));return createTicket(i,'middleman',{value,other:i.fields.getTextInputValue('other'),trade:i.fields.getTextInputValue('trade'),tip:i.fields.getTextInputValue('tip')});}
    if(i.customId.startsWith('support_modal:')){const kind=i.customId.slice('support_modal:'.length);const labels={host_gw:'Host a Giveaway',claim_gw:'Claim a Giveaway',report:'Report',role_apply:'Apply for a Role'};return createTicket(i,'support',{supportType:labels[kind]||kind,notes:i.fields.getTextInputValue('notes'),roblox:i.fields.getTextInputValue('roblox')});}
    if(i.customId.startsWith('paint_modal:')){const base=decodeURIComponent(i.customId.slice('paint_modal:'.length));return createTicket(i,'basepainting',{base,roblox:i.fields.getTextInputValue('roblox'),notes:i.fields.getTextInputValue('notes')});}
  }
}catch(error){console.error(`[FSMM ${VERSION}] INTERACTION ERROR`,error);const msg={content:'❌ Something went wrong while processing that action. Please try again.',flags:MessageFlags.Ephemeral};if(i.replied||i.deferred)await i.followUp(msg).catch(()=>{});else await i.reply(msg).catch(()=>{});}});

client.on('error',error=>console.error(`[FSMM ${VERSION}] CLIENT ERROR`,error));
client.on('shardError',error=>console.error(`[FSMM ${VERSION}] SHARD ERROR`,error));
client.login(TOKEN).catch(error=>{console.error(`[FSMM ${VERSION}] LOGIN FAILED`,error);process.exit(1);});
