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
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Missing required environment variables: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');

const VERSION = '12.0.0';
const STAFF_ROLE = 'FSMM Staff';
const MM_ROLE = 'FSMM Middleman';
const BASE_PAINTER_ROLE = 'FSMM Base Painter';
const OWNER_ROLE = 'Owner';
const CATEGORY_NAME = '🎫 FSMM SERVICES';
const LOG_CHANNEL_NAME = 'fsmm-logs';
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'store.json');
const MAX_OPEN_TICKETS = 3;

const BASES = ['Candy', 'Lava', 'Galaxy', 'Yin Yang', 'Radioactive', 'Cursed', 'Divine', 'Cyber', 'Phantom', 'Crystal'];
const BASE_EMOJIS = { Candy:'🍬', Lava:'🌋', Galaxy:'🌌', 'Yin Yang':'☯️', Radioactive:'☢️', Cursed:'😈', Divine:'✨', Cyber:'🤖', Phantom:'👻', Crystal:'💎' };
const BASE_FILES = {
  Candy:'Candy_Base.png', Lava:'Lava_Base.png', Galaxy:'Galaxy_Base.png', 'Yin Yang':'Yin_Yang_Base.png', Radioactive:'Radioactive_Base.png',
  Cursed:'Cursed_Base.png', Divine:'Divine_Base.png', Cyber:'Cyber_Base.png', Phantom:'Phantom_Base.png', Crystal:'Crystal_Base.png'
};
const MM_VALUES = [
  ['10M - 250M','Trades from 10M to 250M','💰'], ['250M - 500M','Trades from 250M to 500M','💵'], ['500M - 1B','Trades from 500M to 1B','💎'],
  ['1B - 5B','Trades from 1B to 5B','🔥'], ['5B+','Trades worth 5B or more','🚀'], ['OG / Rare Items','OG, rare or unusual items','👑']
];
const SUPPORT_VALUES = [
  ['Host a Giveaway','host_gw','🎉','Request FSMM to host a giveaway'], ['Claim a Giveaway','claim_gw','🎁','Get help claiming a giveaway'],
  ['Report','report','🚨','Report a problem or user'], ['Apply for a Role','role_apply','📋','Apply for an FSMM role']
];

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

function clean(value,max=900){return String(value??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/@everyone|@here/gi,'@ mention').trim().slice(0,max)||'Not provided';}
function embed(title,description){return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({text:'FSMM'});}
function row(...components){return new ActionRowBuilder().addComponents(...components);}
function isOwner(i){return i.guild?.ownerId===i.user.id||Boolean(i.member?.roles?.cache?.some(r=>r.name===OWNER_ROLE));}
function isStaff(i){return isOwner(i)||Boolean(i.member?.roles?.cache?.some(r=>r.name===STAFF_ROLE));}
function defaultStore(){return {users:{},warnings:[],config:{},giveaways:{}};}
function loadStore(){try{if(!fs.existsSync(DATA_FILE))return defaultStore();return {...defaultStore(),...JSON.parse(fs.readFileSync(DATA_FILE,'utf8'))};}catch(e){console.error('[FSMM DATA] load failed:',e.message);return defaultStore();}}
let store=loadStore();
function saveStore(){try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});const tmp=`${DATA_FILE}.tmp`;fs.writeFileSync(tmp,JSON.stringify(store,null,2),'utf8');fs.renameSync(tmp,DATA_FILE);}catch(e){console.error('[FSMM DATA] save failed:',e.message);}}

async function ensureRolesAndCategory(guild){
  const findRole=n=>guild.roles.cache.find(r=>r.name===n);
  let staff=findRole(STAFF_ROLE),mm=findRole(MM_ROLE),basePainter=findRole(BASE_PAINTER_ROLE),owner=findRole(OWNER_ROLE);
  if(!staff)staff=await guild.roles.create({name:STAFF_ROLE,reason:'FSMM bot setup'});
  if(!mm)mm=await guild.roles.create({name:MM_ROLE,reason:'FSMM bot setup'});
  if(!basePainter)basePainter=await guild.roles.create({name:BASE_PAINTER_ROLE,reason:'FSMM bot setup'});
  if(!owner)owner=await guild.roles.create({name:OWNER_ROLE,reason:'FSMM bot setup'});
  let category=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===CATEGORY_NAME);
  if(!category)category=await guild.channels.create({name:CATEGORY_NAME,type:ChannelType.GuildCategory,reason:'FSMM bot setup'});
  let logs=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===LOG_CHANNEL_NAME);
  if(!logs)logs=await guild.channels.create({name:LOG_CHANNEL_NAME,type:ChannelType.GuildText,reason:'FSMM moderation and ticket logs',permissionOverwrites:[
    {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
    {id:owner.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
  ]});
  return {staff,mm,basePainter,owner,category,logs};
}
async function logEvent(guild,type,details){try{const {logs}=await ensureRolesAndCategory(guild);await logs.send({embeds:[embed(`🛡️ FSMM ${type}`,details)]});}catch(e){console.error(`[FSMM LOG] ${type}:`,e.message);}}

function middlemanMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_mm_pick').setPlaceholder('🤝 Select trade value...').addOptions(MM_VALUES.map(([label,description,emoji])=>({label,value:label,description,emoji}))));}
function supportMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_support_pick').setPlaceholder('🛟 Select support type...').addOptions(SUPPORT_VALUES.map(([label,value,emoji,description])=>({label,value,emoji,description}))));}
function baseMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_base_pick').setPlaceholder('🎨 Select a base to preview...').addOptions(BASES.map(base=>({label:base,value:base,description:`${base} Base Painting`,emoji:BASE_EMOJIS[base]}))));}
function panelConfigs(){return [
  ['🤝・middleman',embed('🤝 FSMM MIDDLEMAN','Need a safe middleman?\n\nChoose the trade value below. You will answer a few questions before a private ticket is created.'),middlemanMenu()],
  ['🛟・support',embed('🛟 FSMM SUPPORT','Choose what you need:\n\n🎉 **Host a Giveaway**\n🎁 **Claim a Giveaway**\n🚨 **Report**\n📋 **Apply for a Role**'),supportMenu()],
  ['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Select a base to preview it first, then continue to the request form.'),baseMenu()]
];}
async function upsertPanel(channel,panelEmbed,components){const messages=await channel.messages.fetch({limit:20});const existing=messages.find(m=>m.author.id===client.user.id&&m.embeds.length>0);if(existing)return existing.edit({embeds:[panelEmbed],components:[components]});return channel.send({embeds:[panelEmbed],components:[components]});}
async function syncPanels(guild){const {category}=await ensureRolesAndCategory(guild);let ready=0;for(const [name,e,components] of panelConfigs()){let channel=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===name);if(!channel)channel=await guild.channels.create({name,type:ChannelType.GuildText,parent:category.id,reason:'FSMM panel setup'});await upsertPanel(channel,e,components);ready++;}console.log(`[FSMM PANELS] READY ${ready}/3`);}
function input(id,label,style=TextInputStyle.Short,required=true,max=900,placeholder){const c=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);if(placeholder)c.setPlaceholder(placeholder);return c;}
function mmModal(value){return new ModalBuilder().setCustomId(`fsmm_mm_modal:${encodeURIComponent(value)}`).setTitle('FSMM Middleman Request').addComponents(row(input('giving','What are YOU giving?',TextInputStyle.Paragraph)),row(input('receiving','What is the OTHER TRADER giving?',TextInputStyle.Paragraph)),row(input('other','Other trader username',TextInputStyle.Short,true,100,'@username')),row(input('tip','What are you tipping?',TextInputStyle.Short,false,300,'Optional')));}
function supportModal(kind){const names=Object.fromEntries(SUPPORT_VALUES.map(([label,value])=>[value,label]));const question=kind==='role_apply'?'Why should we accept your application?':'Tell us what you need';return new ModalBuilder().setCustomId(`fsmm_support_modal:${kind}`).setTitle(names[kind]||'FSMM Support').addComponents(row(input('details',question,TextInputStyle.Paragraph)),row(input('roblox','Roblox username',TextInputStyle.Short,false,100,'Optional')));}
function paintModal(base){return new ModalBuilder().setCustomId(`fsmm_paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`).addComponents(row(input('roblox','Roblox username')),row(input('payment','What is your payment?',TextInputStyle.Paragraph,true,500)),row(input('collateral','What is your collateral?',TextInputStyle.Paragraph,true,500)),row(input('extra','Extra details',TextInputStyle.Paragraph,false,900,'Optional')));}
function baseImage(base){return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(BASE_FILES[base])}`;}
function basePreview(base){return embed(`${BASE_EMOJIS[base]||'🎨'} ${base} BASE PREVIEW`,`**Base:** ${base}\n\nIf this is the base you want painted, press **Continue to Request** below.`).setImage(baseImage(base));}
function baseContinueButton(base){return row(new ButtonBuilder().setCustomId(`fsmm_base_continue:${encodeURIComponent(base)}`).setLabel('Continue to Request').setEmoji('🎨').setStyle(ButtonStyle.Primary));}
function ticketCount(guild,userId){const cat=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===CATEGORY_NAME);return cat?cat.children.cache.filter(c=>c.type===ChannelType.GuildText&&c.topic?.includes(`FSMM_USER:${userId}`)).size:0;}
function ticketType(topic=''){return topic.match(/TYPE:([^\s]+)/)?.[1]||'unknown';}
function claimedBy(topic=''){return topic.match(/CLAIMED_BY:(\d+)/)?.[1]||null;}
function claimAllowed(i,type){if(isStaff(i))return true;if(type==='middleman')return Boolean(i.member?.roles?.cache?.some(r=>r.name===MM_ROLE));if(type==='base-painting')return Boolean(i.member?.roles?.cache?.some(r=>r.name===BASE_PAINTER_ROLE));return false;}
function ticketButtons(type,claimed=null){return row(new ButtonBuilder().setCustomId('fsmm_claim').setLabel(claimed?'Ticket Claimed':'Claim Ticket').setEmoji(claimed?'✅':'🙋').setStyle(claimed?ButtonStyle.Secondary:ButtonStyle.Primary).setDisabled(Boolean(claimed)),new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger));}
function typeLabel(type){return type==='middleman'?'Middleman':type==='support'?'Support':type==='base-painting'?'Base Painting':'Ticket';}
async function fetchTranscript(channel){const messages=[];let before;while(true){const batch=await channel.messages.fetch({limit:100,...(before?{before}: {})});if(!batch.size)break;messages.push(...batch.values());if(batch.size<100)break;before=batch.last().id;}messages.sort((a,b)=>a.createdTimestamp-b.createdTimestamp);const lines=['FSMM TICKET TRANSCRIPT',`Channel: #${channel.name}`,`Ticket Type: ${typeLabel(ticketType(channel.topic||''))}`,`Created: ${new Date(channel.createdTimestamp).toISOString()}`,''];for(const m of messages){const text=m.content?.trim()||'[embed/component/attachment]';const attachments=m.attachments.size?` | Attachments: ${[...m.attachments.values()].map(a=>a.url).join(', ')}`:'';lines.push(`[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${text}${attachments}`);}return Buffer.from(lines.join('\n'),'utf8');}
async function closeTicket(channel,closer){const type=ticketType(channel.topic||'');const opener=channel.topic?.match(/FSMM_USER:(\d+)/)?.[1]||null;const claimer=claimedBy(channel.topic||'');const transcript=await fetchTranscript(channel);const {logs}=await ensureRolesAndCategory(channel.guild);await logs.send({embeds:[embed('🔒 TICKET CLOSED',[`**Ticket:** #${channel.name}`,`**Type:** ${typeLabel(type)}`,`**Opened by:** ${opener?`<@${opener}>`:'Unknown'}`,`**Closed by:** <@${closer.id}>`,`**Claimed by:** ${claimer?`<@${claimer}>`:'Unclaimed'}`].join('\n'))],files:[{attachment:transcript,name:`${channel.name}-transcript.txt`}]});await channel.delete('FSMM ticket closed by staff');}
async function createTicket(i,type,data){if(ticketCount(i.guild,i.user.id)>=MAX_OPEN_TICKETS)return i.reply({content:`❌ You already have ${MAX_OPEN_TICKETS} open FSMM tickets.`,flags:MessageFlags.Ephemeral});const {staff,mm,basePainter,category}=await ensureRolesAndCategory(i.guild);const slug=type==='middleman'?'middleman':type==='support'?'support':'base-painting';const team=type==='middleman'?mm:type==='base-painting'?basePainter:staff;const channel=await i.guild.channels.create({name:`${slug}-${i.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,90)||`${slug}-${i.user.id}`,type:ChannelType.GuildText,parent:category.id,topic:`FSMM_USER:${i.user.id} TYPE:${type}`,permissionOverwrites:[{id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:team.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}],reason:`FSMM ${typeLabel(type)} ticket`});const details=Object.entries(data).map(([k,v])=>`**${clean(k,100)}:**\n${clean(v,900)}`).join('\n\n');await channel.send({content:`<@${i.user.id}> <@&${team.id}>`,allowedMentions:{users:[i.user.id],roles:[team.id]},embeds:[embed(`🎫 FSMM ${typeLabel(type).toUpperCase()} TICKET`,['**Status:** 🟢 OPEN',`**Opened by:** <@${i.user.id}>`,'',details,'','A team member can claim this ticket using **Claim Ticket**.','Only FSMM staff can close tickets.'].join('\n'))],components:[ticketButtons(type)]});await logEvent(i.guild,'TICKET OPENED',`**Ticket:** ${channel}\n**Type:** ${typeLabel(type)}\n**Opened by:** <@${i.user.id}>`);return i.reply({content:`✅ Your private ticket is ready: ${channel}`,flags:MessageFlags.Ephemeral});}
function parseDuration(v){const m=String(v).trim().match(/^(\d+)\s*(s|m|h|d)$/i);if(!m)return null;const ms=Number(m[1])*({s:1000,m:60000,h:3600000,d:86400000}[m[2].toLowerCase()]);return ms>=10000&&ms<=604800000?ms:null;}
function giveawayButton(id){return row(new ButtonBuilder().setCustomId(`fsmm_gw_join:${id}`).setLabel('Enter Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Success));}
async function finishGiveaway(id){const g=store.giveaways?.[id];if(!g||g.ended)return;g.ended=true;const channel=await client.channels.fetch(g.channelId).catch(()=>null);if(!channel?.isTextBased()){saveStore();return;}const message=await channel.messages.fetch(g.messageId).catch(()=>null);if(!message){saveStore();return;}const entries=Object.keys(g.entries||{}),pool=[...entries],winners=[];for(let n=0;n<Math.min(g.winners,pool.length);n++)winners.push(pool.splice(Math.floor(Math.random()*pool.length),1)[0]);const result=embed('🎉 GIVEAWAY ENDED',`**Prize:** ${clean(g.prize,200)}\n**Winners:** ${winners.length?winners.map(x=>`<@${x}>`).join(', '):'No valid entries'}\n\nEntries: **${entries.length}**`);if(g.image)result.setImage(g.image);await message.edit({embeds:[result],components:[]}).catch(()=>null);saveStore();}
function scheduleGiveaways(){for(const [id,g] of Object.entries(store.giveaways||{})){if(g.ended)continue;const delay=Math.max(0,Number(g.endsAt)-Date.now());setTimeout(()=>finishGiveaway(id).catch(e=>console.error('[FSMM GIVEAWAY]',e.message)),Math.min(delay,2147483647));}}

const commands=[
  new SlashCommandBuilder().setName('ping').setDescription('Show bot latency.'),
  new SlashCommandBuilder().setName('help').setDescription('Show FSMM bot commands.'),
  new SlashCommandBuilder().setName('membercount').setDescription('Show server member count.'),
  new SlashCommandBuilder().setName('setup').setDescription('Owner-only: sync the 3 FSMM service panels and ticket roles.'),
  new SlashCommandBuilder().setName('ticket').setDescription('Owner-only: sync the 3 FSMM service panels and ticket roles.'),
  new SlashCommandBuilder().setName('giveaway').setDescription('Staff-only: start an FSMM giveaway.')
    .addStringOption(o=>o.setName('duration').setDescription('Duration: 10s, 10m, 1h, or 1d').setRequired(true))
    .addIntegerOption(o=>o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20).setRequired(true))
    .addStringOption(o=>o.setName('prize').setDescription('Giveaway prize').setMaxLength(200).setRequired(true))
    .addAttachmentOption(o=>o.setName('image').setDescription('Optional giveaway image').setRequired(false))
].map(c=>c.toJSON());
async function registerCommands(){const rest=new REST({version:'10'}).setToken(TOKEN);const route=Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID);const existing=await rest.get(route);const names=new Set(commands.map(c=>c.name));const merged=[...existing.filter(c=>!names.has(c.name)),...commands];await rest.put(route,{body:merged});const verified=await rest.get(route);const missing=merged.filter(c=>!verified.some(v=>v.name===c.name)).map(c=>c.name);if(missing.length)throw new Error(`Command verification failed: ${missing.join(', ')}`);console.log(`[FSMM COMMANDS] VERIFIED ${verified.length} GUILD COMMANDS`);}

client.on('interactionCreate',async i=>{try{
  if(i.isChatInputCommand()){
    if(i.commandName==='ping')return i.reply({content:`🏓 Pong! ${client.ws.ping}ms`,flags:MessageFlags.Ephemeral});
    if(i.commandName==='help')return i.reply({embeds:[embed('🤖 FSMM COMMANDS','Use `/ticket` to sync the three service panels.\n\nStaff/community commands are also available through slash commands.')],flags:MessageFlags.Ephemeral});
    if(i.commandName==='membercount')return i.reply({content:`👥 Members: **${i.guild.memberCount}**`,flags:MessageFlags.Ephemeral});
    if(i.commandName==='setup'||i.commandName==='ticket'){if(!isOwner(i))return i.reply({content:'❌ Owner only.',flags:MessageFlags.Ephemeral});await i.deferReply({flags:MessageFlags.Ephemeral});await syncPanels(i.guild);return i.editReply('✅ FSMM panels and ticket roles are synced.');}
    if(i.commandName==='giveaway'){
      if(!isStaff(i))return i.reply({content:'❌ Staff only.',flags:MessageFlags.Ephemeral});
      const duration=parseDuration(i.options.getString('duration',true));if(!duration)return i.reply({content:'❌ Invalid duration. Use 10s–7d, e.g. `10m` or `2h`.',flags:MessageFlags.Ephemeral});
      const winners=i.options.getInteger('winners',true),prize=clean(i.options.getString('prize',true),200),image=i.options.getAttachment('image');
      if(image&&!image.contentType?.startsWith('image/'))return i.reply({content:'❌ Giveaway attachment must be an image.',flags:MessageFlags.Ephemeral});
      const id=`${Date.now()}-${i.user.id}`,g={channelId:i.channelId,messageId:null,prize,winners,endsAt:Date.now()+duration,ended:false,entries:{},image:image?.url||null};
      const e=embed('🎉 FSMM GIVEAWAY',`**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(g.endsAt/1000)}:R>\n\nClick below to enter.`);if(g.image)e.setImage(g.image);
      const msg=await i.channel.send({embeds:[e],components:[giveawayButton(id)],allowedMentions:{parse:[]}});g.messageId=msg.id;store.giveaways[id]=g;saveStore();setTimeout(()=>finishGiveaway(id).catch(err=>console.error('[FSMM GIVEAWAY]',err.message)),Math.min(duration,2147483647));return i.reply({content:'✅ Giveaway started.',flags:MessageFlags.Ephemeral});
    }
  }
  if(i.isStringSelectMenu()){
    if(i.customId==='fsmm_mm_pick')return i.showModal(mmModal(i.values[0]));
    if(i.customId==='fsmm_support_pick')return i.showModal(supportModal(i.values[0]));
    if(i.customId==='fsmm_base_pick'){const base=i.values[0];if(!BASES.includes(base))return i.reply({content:'❌ Invalid base.',flags:MessageFlags.Ephemeral});return i.reply({embeds:[basePreview(base)],components:[baseContinueButton(base)],flags:MessageFlags.Ephemeral});}
  }
  if(i.isButton()){
    if(i.customId.startsWith('fsmm_base_continue:')){const base=decodeURIComponent(i.customId.split(':').slice(1).join(':'));if(!BASES.includes(base))return i.reply({content:'❌ Invalid base.',flags:MessageFlags.Ephemeral});return i.showModal(paintModal(base));}
    if(i.customId==='fsmm_claim'){
      const ch=i.channel,type=ticketType(ch?.topic||'');if(!['middleman','support','base-painting'].includes(type))return i.reply({content:'❌ This is not an FSMM ticket.',flags:MessageFlags.Ephemeral});if(!claimAllowed(i,type))return i.reply({content:'❌ You are not allowed to claim this ticket.',flags:MessageFlags.Ephemeral});const existing=claimedBy(ch.topic||'');if(existing)return i.reply({content:`❌ Already claimed by <@${existing}>.`,flags:MessageFlags.Ephemeral});await ch.setTopic(`${ch.topic} CLAIMED_BY:${i.user.id}`.slice(0,1024));const e=i.message.embeds[0]?EmbedBuilder.from(i.message.embeds[0]):embed('🎫 FSMM TICKET','');e.setDescription((e.data.description||'').replace('**Status:** 🟢 OPEN','**Status:** 🟡 CLAIMED')+`\n\n**Claimed by:** <@${i.user.id}>`);await i.message.edit({embeds:[e],components:[ticketButtons(type,i.user.id)]});return i.reply({content:`✅ You claimed the ${typeLabel(type)} ticket.`,flags:MessageFlags.Ephemeral});
    }
    if(i.customId==='fsmm_close'){
      const ch=i.channel,type=ticketType(ch?.topic||'');if(!['middleman','support','base-painting'].includes(type))return i.reply({content:'❌ This is not an FSMM ticket.',flags:MessageFlags.Ephemeral});if(!isStaff(i))return i.reply({content:'❌ Only FSMM Staff / Owners can close tickets.',flags:MessageFlags.Ephemeral});await i.reply({content:'🔒 Creating transcript and closing ticket...',flags:MessageFlags.Ephemeral});await closeTicket(ch,i.member);return;
    }
    if(i.customId.startsWith('fsmm_gw_join:')){const id=i.customId.slice('fsmm_gw_join:'.length),g=store.giveaways?.[id];if(!g||g.ended)return i.reply({content:'❌ This giveaway has ended.',flags:MessageFlags.Ephemeral});if(g.entries[i.user.id])return i.reply({content:'ℹ️ You are already entered.',flags:MessageFlags.Ephemeral});g.entries[i.user.id]=true;saveStore();return i.reply({content:'🎉 You are entered! Good luck.',flags:MessageFlags.Ephemeral});}
  }
  if(i.isModalSubmit()){
    if(i.customId.startsWith('fsmm_mm_modal:')){const value=decodeURIComponent(i.customId.split(':').slice(1).join(':'));return createTicket(i,'middleman',{'Trade value':value,'What YOU are giving':i.fields.getTextInputValue('giving'),'What the OTHER TRADER is giving':i.fields.getTextInputValue('receiving'),'Other trader username':i.fields.getTextInputValue('other'),'Tip':i.fields.getTextInputValue('tip')||'Not provided'});}
    if(i.customId.startsWith('fsmm_support_modal:')){const kind=i.customId.split(':')[1];return createTicket(i,'support',{'Support type':kind,Details:i.fields.getTextInputValue('details'),'Roblox username':i.fields.getTextInputValue('roblox')||'Not provided'});}
    if(i.customId.startsWith('fsmm_paint_modal:')){const base=decodeURIComponent(i.customId.split(':').slice(1).join(':'));return createTicket(i,'base-painting',{Base:base,'Roblox username':i.fields.getTextInputValue('roblox'),Payment:i.fields.getTextInputValue('payment'),Collateral:i.fields.getTextInputValue('collateral'),'Extra details':i.fields.getTextInputValue('extra')||'Not provided'});}
  }
}catch(error){console.error('[FSMM ERROR]',error.stack||error.message);if(i.isRepliable()&&!i.replied&&!i.deferred)await i.reply({content:'❌ Something went wrong. Please try again.',flags:MessageFlags.Ephemeral}).catch(()=>null);}});

client.once('clientReady',async()=>{console.log(`[FSMM ${VERSION}] ONLINE AS ${client.user.tag}`);try{await registerCommands();if(client.guilds.cache.has(GUILD_ID))await syncPanels(client.guilds.cache.get(GUILD_ID));scheduleGiveaways();console.log('[FSMM] STARTUP SYNC COMPLETE');}catch(e){console.error('[FSMM STARTUP] Sync failed:',e.stack||e.message);}});
client.login(TOKEN).catch(e=>{console.error('[FSMM LOGIN]',e.stack||e.message);process.exit(1);});
