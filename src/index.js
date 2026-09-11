require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder,
  EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder,
  TextInputStyle, MessageFlags, AttachmentBuilder
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Missing DISCORD_TOKEN, CLIENT_ID or GUILD_ID');

const VERSION = '13.0.0';
const ROLE_IDS = Object.freeze({
  owner: '1466090947170406617',
  mod: '1466085137459712114',
  staff: '1466088151331242015',
  indexProvider: '1466245073820844211',
  middleman: '1466091035510706262'
});
const ROLE_NAMES = Object.freeze({ staff:'FSMM Staff', middleman:'FSMM Middleman', painter:'FSMM Base Painter', owner:'Owner' });
const CATEGORY_NAME = '🎫 FSMM SERVICES';
const LOG_CHANNEL_NAME = 'fsmm-logs';
const MAX_OPEN_TICKETS = 3;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'store.json');

const BASES = ['Candy','Lava','Galaxy','Yin Yang','Radioactive','Cursed','Divine','Cyber','Phantom','Crystal'];
const BASE_EMOJIS = { Candy:'🍬', Lava:'🌋', Galaxy:'🌌', 'Yin Yang':'☯️', Radioactive:'☢️', Cursed:'😈', Divine:'✨', Cyber:'🤖', Phantom:'👻', Crystal:'💎' };
const MM_VALUES = [
  ['10M - 250M','Trades from 10M to 250M','💰'], ['250M - 500M','Trades from 250M to 500M','💵'],
  ['500M - 1B','Trades from 500M to 1B','💎'], ['1B - 5B','Trades from 1B to 5B','🔥'],
  ['5B+','Trades worth 5B or more','🚀'], ['OG / Rare Items','OG, rare or unusual items','👑']
];
const SUPPORT_VALUES = [
  ['Host a Giveaway','host_gw','🎉','Request FSMM to host a giveaway'], ['Claim a Giveaway','claim_gw','🎁','Get help claiming a giveaway'],
  ['Report','report','🚨','Report a problem or user'], ['Apply for a Role','role_apply','📋','Apply for an FSMM role']
];

const client = new Client({ intents:[GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent] });
const creationLocks = new Set();
const claimLocks = new Set();
const baseImageCache = new Map();
let dirty = false;

const clean = (v, max=900) => String(v ?? '').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/@everyone|@here/gi,'@ mention').trim().slice(0,max) || 'Not provided';
const embed = (title, description) => new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({text:'FSMM'});
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const roleHas = (i,id) => Boolean(i.member?.roles?.cache?.has(id));
const roleNameHas = (i,name) => Boolean(i.member?.roles?.cache?.some(r=>r.name===name));
const isOwner = i => Boolean(i.guild?.ownerId===i.user.id || roleHas(i,ROLE_IDS.owner) || roleNameHas(i,ROLE_NAMES.owner));
const isStaff = i => Boolean(isOwner(i) || roleHas(i,ROLE_IDS.mod) || roleHas(i,ROLE_IDS.staff) || roleNameHas(i,ROLE_NAMES.staff));
const ticketType = topic => topic?.match(/TYPE:([^\s]+)/)?.[1] || null;
const openerId = topic => topic?.match(/FSMM_USER:(\d+)/)?.[1] || null;
const claimedId = topic => topic?.match(/CLAIMED_BY:(\d+)/)?.[1] || null;
const typeLabel = type => type==='middleman'?'Middleman':type==='support'?'Support':type==='base-painting'?'Base Painting':'Ticket';

function loadStore(){
  try {
    if(!fs.existsSync(DATA_FILE)) return {config:{},vouches:[],warnings:{},stats:{messages:{},commands:{}}};
    const value=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    return {config:{},vouches:[],warnings:{},stats:{messages:{},commands:{}},...value};
  } catch(e){ console.error('[DATA LOAD]',e); return {config:{},vouches:[],warnings:{},stats:{messages:{},commands:{}}; }
}
let store=loadStore();
function saveStore(){
  try { fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true}); const tmp=`${DATA_FILE}.tmp`; fs.writeFileSync(tmp,JSON.stringify(store,null,2)); fs.renameSync(tmp,DATA_FILE); dirty=false; }
  catch(e){ console.error('[DATA SAVE]',e); }
}
setInterval(()=>{ if(dirty) saveStore(); },10000).unref();

async function ensureRolesAndCategory(guild){
  const find=(id,name)=>guild.roles.cache.get(id)||guild.roles.cache.find(r=>r.name===name);
  let staff=find(ROLE_IDS.staff,ROLE_NAMES.staff), mm=find(ROLE_IDS.middleman,ROLE_NAMES.middleman), painter=find(ROLE_IDS.indexProvider,ROLE_NAMES.painter), owner=find(ROLE_IDS.owner,ROLE_NAMES.owner);
  if(!staff) staff=await guild.roles.create({name:ROLE_NAMES.staff,reason:'FSMM setup'});
  if(!mm) mm=await guild.roles.create({name:ROLE_NAMES.middleman,reason:'FSMM setup'});
  if(!painter) painter=await guild.roles.create({name:ROLE_NAMES.painter,reason:'FSMM setup'});
  if(!owner) owner=await guild.roles.create({name:ROLE_NAMES.owner,reason:'FSMM setup'});
  let category=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===CATEGORY_NAME);
  if(!category) category=await guild.channels.create({name:CATEGORY_NAME,type:ChannelType.GuildCategory,reason:'FSMM setup'});
  let logs=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===LOG_CHANNEL_NAME);
  if(!logs) logs=await guild.channels.create({name:LOG_CHANNEL_NAME,type:ChannelType.GuildText,reason:'FSMM logs',permissionOverwrites:[
    {id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
    {id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
    {id:owner.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
  ]});
  return {staff,mm,painter,owner,category,logs};
}
async function logEvent(guild,title,details){ try{ const {logs}=await ensureRolesAndCategory(guild); await logs.send({embeds:[embed(`🛡️ FSMM ${title}`,details)]}); }catch(e){console.error('[LOG]',e.message);} }

function middlemanMenu(){ return row(new StringSelectMenuBuilder().setCustomId('fsmm_mm_pick').setPlaceholder('🤝 Select trade value...').addOptions(MM_VALUES.map(([label,description,emoji])=>({label,value:label,description,emoji})))); }
function supportMenu(){ return row(new StringSelectMenuBuilder().setCustomId('fsmm_support_pick').setPlaceholder('🛟 Select support type...').addOptions(SUPPORT_VALUES.map(([label,value,emoji,description])=>({label,value,emoji,description})))); }
function baseMenu(){ return row(new StringSelectMenuBuilder().setCustomId('fsmm_base_pick').setPlaceholder('🎨 Select a base...').addOptions(BASES.map(base=>({label:base,value:base,description:`${base} Base Painting`,emoji:BASE_EMOJIS[base]})))); }
function panelConfigs(){ return [
  ['🤝・middleman',embed('🤝 FSMM MIDDLEMAN','Need a safe middleman?\n\nChoose the trade value below.'),middlemanMenu()],
  ['🛟・support',embed('🛟 FSMM SUPPORT','Choose what you need:\n\n🎉 Host a Giveaway\n🎁 Claim a Giveaway\n🚨 Report\n📋 Apply for a Role'),supportMenu()],
  ['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Select a base to preview it, then continue to the request form.'),baseMenu()]
]; }
async function upsertPanel(channel,panelEmbed,components){
  const messages=await channel.messages.fetch({limit:20});
  const existing=messages.find(m=>m.author.id===client.user.id&&m.embeds.length>0);
  return existing ? existing.edit({embeds:[panelEmbed],components:[components]}) : channel.send({embeds:[panelEmbed],components:[components]});
}
async function syncPanels(guild){
  if(!guild) throw new Error('Guild not found');
  const {category}=await ensureRolesAndCategory(guild); let count=0;
  for(const [name,panelEmbed,components] of panelConfigs()){
    let channel=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===name);
    if(!channel) channel=await guild.channels.create({name,type:ChannelType.GuildText,parent:category.id,reason:'FSMM panel setup'});
    await upsertPanel(channel,panelEmbed,components); count++;
  }
  console.log(`[PANELS] ${count}/3 ready`);
}
function input(id,label,style=TextInputStyle.Short,required=true,max=900,placeholder){ const c=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max); if(placeholder)c.setPlaceholder(placeholder); return c; }
function mmModal(value){ return new ModalBuilder().setCustomId(`fsmm_mm_modal:${encodeURIComponent(value)}`).setTitle('FSMM Middleman Request').addComponents(row(input('giving','What are YOU giving?',TextInputStyle.Paragraph)),row(input('receiving','What is the OTHER TRADER giving?',TextInputStyle.Paragraph)),row(input('other','Other trader username',TextInputStyle.Short,true,100,'@username')),row(input('tip','What are you tipping?',TextInputStyle.Short,false,300,'Optional'))); }
function supportModal(kind){ const name=Object.fromEntries(SUPPORT_VALUES.map(([l,v])=>[v,l]))[kind]||'FSMM Support'; return new ModalBuilder().setCustomId(`fsmm_support_modal:${kind}`).setTitle(name).addComponents(row(input('details',kind==='role_apply'?'Why should we accept your application?':'Tell us what you need',TextInputStyle.Paragraph)),row(input('roblox','Roblox username',TextInputStyle.Short,false,100,'Optional'))); }
function paintModal(base){ return new ModalBuilder().setCustomId(`fsmm_paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`).addComponents(row(input('roblox','Roblox username')),row(input('payment','What is your payment?',TextInputStyle.Paragraph,true,500)),row(input('collateral','What is your collateral?',TextInputStyle.Paragraph,true,500)),row(input('extra','Extra details',TextInputStyle.Paragraph,false,900,'Optional'))); }
function ticketButtons(claimed){ return row(new ButtonBuilder().setCustomId('fsmm_claim').setLabel(claimed?'Ticket Claimed':'Claim Ticket').setEmoji(claimed?'✅':'🙋').setStyle(claimed?ButtonStyle.Secondary:ButtonStyle.Primary).setDisabled(Boolean(claimed)),new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)); }
function ticketCount(guild,userId){ const category=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===CATEGORY_NAME); return category ? category.children.cache.filter(c=>c.type===ChannelType.GuildText&&c.topic?.includes(`FSMM_USER:${userId}`)).size : 0; }

function httpGet(url,redirects=3){
  return new Promise((resolve,reject)=>{
    const req=https.get(url,{headers:{'User-Agent':'FSMM-Discord-Bot/13.0','Accept-Encoding':'identity'}},res=>{
      if(res.statusCode>=300&&res.statusCode<400&&res.headers.location&&redirects>0){res.resume();return resolve(httpGet(new URL(res.headers.location,url).toString(),redirects-1));}
      if(res.statusCode!==200){res.resume();return reject(new Error(`HTTP ${res.statusCode}`));}
      const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({body:Buffer.concat(chunks),contentType:res.headers['content-type']||''}));
    });
    req.setTimeout(6000,()=>req.destroy(new Error('request timeout'))); req.on('error',reject);
  });
}
async function resolveFandomBase(base){
  if(baseImageCache.has(base)) return baseImageCache.get(base);
  const api=`https://stealabrainrot.fandom.com/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`${base} Base`)}&gsrnamespace=6&gsrlimit=20&prop=imageinfo&iiprop=url&format=json&origin=*`;
  const result=await httpGet(api); const json=JSON.parse(result.body.toString('utf8')); const pages=Object.values(json.query?.pages||{}); const normalized=base.toLowerCase().replace(/[^a-z0-9]+/g,'');
  const page=pages.find(p=>{const t=String(p.title||'').toLowerCase().replace(/[^a-z0-9]+/g,'');return t.includes(normalized)&&t.includes('base');})||pages[0];
  const url=page?.imageinfo?.[0]?.url; if(!url) throw new Error(`No image for ${base}`); baseImageCache.set(base,url); return url;
}
async function basePreview(base){
  try{ const image=await httpGet(await resolveFandomBase(base)); const match=image.contentType.match(/image\/(png|jpe?g|webp|gif)/i); const ext=match?match[1].toLowerCase().replace('jpeg','jpg'):'png'; const file=new AttachmentBuilder(image.body,{name:`fsmm-${base.toLowerCase().replace(/[^a-z0-9]+/g,'-')}.${ext}`}); return {embeds:[embed(`${BASE_EMOJIS[base]||'🎨'} ${base} BASE PREVIEW`,`**Base:** ${base}\n\nPress **Continue to Request** to open the request form.`).setImage(`attachment://${file.name}`)],files:[file]}; }
  catch(e){ console.error('[BASE PREVIEW]',e.message); return {embeds:[embed(`${BASE_EMOJIS[base]||'🎨'} ${base} BASE PREVIEW`,`**Base:** ${base}\n\n⚠️ Image unavailable right now. You can still continue.`)]}; }
}
function baseContinue(base){ return row(new ButtonBuilder().setCustomId(`fsmm_base_continue:${encodeURIComponent(base)}`).setLabel('Continue to Request').setEmoji('🎨').setStyle(ButtonStyle.Primary)); }

async function createTicket(i,type,data){
  if(creationLocks.has(i.user.id)) return i.reply({content:'⏳ Your ticket request is already being processed.',flags:MessageFlags.Ephemeral});
  if(ticketCount(i.guild,i.user.id)>=MAX_OPEN_TICKETS) return i.reply({content:`❌ You already have ${MAX_OPEN_TICKETS} open FSMM tickets.`,flags:MessageFlags.Ephemeral});
  creationLocks.add(i.user.id);
  if(!i.deferred&&!i.replied) await i.deferReply({flags:MessageFlags.Ephemeral});
  try{
    const roles=await ensureRolesAndCategory(i.guild); const team=type==='middleman'?roles.mm:type==='base-painting'?roles.painter:roles.staff; const slug=type==='middleman'?'middleman':type==='support'?'support':'base-painting';
    const safeUser=i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,70)||i.user.id;
    const channel=await i.guild.channels.create({name:`${slug}-${safeUser}`.slice(0,95),type:ChannelType.GuildText,parent:roles.category.id,topic:`FSMM_USER:${i.user.id} TYPE:${type}`,permissionOverwrites:[
      {id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
      {id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
      {id:roles.staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
      {id:team.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
    ],reason:`FSMM ${typeLabel(type)} ticket`});
    const details=Object.entries(data).map(([k,v])=>`**${clean(k,100)}:**\n${clean(v,900)}`).join('\n\n');
    await channel.send({content:`<@${i.user.id}> <@&${team.id}>`,allowedMentions:{users:[i.user.id],roles:[team.id]},embeds:[embed(`🎫 FSMM ${typeLabel(type).toUpperCase()} TICKET`,['**Status:** 🟢 OPEN',`**Opened by:** <@${i.user.id}>`,'',details,'','A team member can claim this ticket.','Only FSMM staff can close tickets.'].join('\n'))],components:[ticketButtons(null)]});
    await logEvent(i.guild,'TICKET OPENED',`**Ticket:** ${channel}\n**Type:** ${typeLabel(type)}\n**Opened by:** <@${i.user.id}>`);
    return i.editReply({content:`✅ Your private ticket is ready: ${channel}`});
  }catch(e){ console.error('[TICKET CREATE]',e.stack||e.message); return i.editReply({content:'❌ Could not create the ticket. Please try again.'}).catch(()=>{}); }
  finally{creationLocks.delete(i.user.id);}
}
async function closeTicket(i){
  if(!isStaff(i)) return i.reply({content:'❌ Only FSMM staff can close tickets.',flags:MessageFlags.Ephemeral});
  if(!i.channel?.topic?.includes('FSMM_USER:')) return i.reply({content:'❌ This is not an FSMM ticket.',flags:MessageFlags.Ephemeral});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try{
    const messages=await i.channel.messages.fetch({limit:100}); const lines=[...messages.values()].reverse().map(m=>`[${m.createdAt.toISOString()}] ${m.author.tag}: ${clean(m.content,1000)}`).join('\n'); const file=Buffer.from(lines||'No messages.','utf8'); const name=`transcript-${i.channel.name}-${Date.now()}.txt`; const logs=(await ensureRolesAndCategory(i.guild)).logs;
    await logs.send({content:`🔒 **Ticket closed:** ${i.channel.name}\n**Closed by:** <@${i.user.id}>`,files:[new AttachmentBuilder(file,{name})]});
    await i.editReply({content:'✅ Ticket closed and transcript saved.'}); await logEvent(i.guild,'TICKET CLOSED',`**Ticket:** ${i.channel.name}\n**Closed by:** <@${i.user.id}>`); setTimeout(()=>i.channel.delete('FSMM ticket closed').catch(()=>{}),1200);
  }catch(e){console.error('[CLOSE]',e.stack||e.message);await i.editReply({content:'❌ Could not close this ticket cleanly.'}).catch(()=>{});}
}
async function claimTicket(i){
  if(!isStaff(i)) return i.reply({content:'❌ Only FSMM staff can claim tickets.',flags:MessageFlags.Ephemeral});
  const topic=i.channel?.topic||''; if(!topic.includes('FSMM_USER:')) return i.reply({content:'❌ This is not an FSMM ticket.',flags:MessageFlags.Ephemeral}); if(claimedId(topic)) return i.reply({content:'❌ This ticket is already claimed.',flags:MessageFlags.Ephemeral});
  if(claimLocks.has(i.channel.id)) return i.reply({content:'⏳ Claim is already being processed.',flags:MessageFlags.Ephemeral}); claimLocks.add(i.channel.id);
  try{ await i.deferUpdate(); const newTopic=`${topic} CLAIMED_BY:${i.user.id}`; await i.channel.setTopic(newTopic,'FSMM ticket claimed'); await i.channel.permissionOverwrites.edit(i.user.id,{ViewChannel:true,SendMessages:true,ReadMessageHistory:true}); const msg=i.message; await msg.edit({components:[ticketButtons(i.user.id)]}); await i.channel.send({content:`🔒 **Claimed by <@${i.user.id}>**`,allowedMentions:{users:[i.user.id]}}); }
  catch(e){console.error('[CLAIM]',e.stack||e.message); if(!i.replied&&!i.deferred) await i.reply({content:'❌ Could not claim this ticket.',flags:MessageFlags.Ephemeral}).catch(()=>{});}
  finally{claimLocks.delete(i.channel.id);}
}

function userOption(name,description,required=false){ return o=>o.setName(name).setDescription(description).setRequired(required); }
const commands=[
  new SlashCommandBuilder().setName('ping').setDescription('Check FSMM bot latency'),
  new SlashCommandBuilder().setName('help').setDescription('Show FSMM commands and services'),
  new SlashCommandBuilder().setName('membercount').setDescription('Show server member count'),
  new SlashCommandBuilder().setName('setup').setDescription('Set up FSMM service panels').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('ticket').setDescription('Show FSMM service panels').setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
  new SlashCommandBuilder().setName('vouch').setDescription('Leave a vouch for a member').addUserOption(userOption('user','Member you traded with',true)).addStringOption(o=>o.setName('message').setDescription('Your vouch message').setRequired(true).setMaxLength(500)),
  new SlashCommandBuilder().setName('vouches').setDescription('View a member vouch count').addUserOption(userOption('user','Member to check',false)),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Show the FSMM vouch leaderboard'),
  new SlashCommandBuilder().setName('stats').setDescription('Show member activity stats').addUserOption(userOption('user','Member to check',false)),
  new SlashCommandBuilder().setName('transcript').setDescription('Export the current ticket transcript').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('warn').setDescription('Warn a member').addUserOption(userOption('user','Member to warn',true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setRequired(true).setMaxLength(500)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('warnings').setDescription('View member warnings').addUserOption(userOption('user','Member to check',true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a member').addUserOption(userOption('user','Member to kick',true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a member').addUserOption(userOption('user','Member to ban',true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('unban').setDescription('Unban a user by ID').addStringOption(o=>o.setName('user_id').setDescription('Discord user ID').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('timeout').setDescription('Timeout a member').addUserOption(userOption('user','Member to timeout',true)).addIntegerOption(o=>o.setName('minutes').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('untimeout').setDescription('Remove a member timeout').addUserOption(userOption('user','Member to untimeout',true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('clear').setDescription('Delete recent messages').addIntegerOption(o=>o.setName('amount').setDescription('1-100 messages').setRequired(true).setMinValue(1).setMaxValue(100)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('announce').setDescription('Send an announcement').addStringOption(o=>o.setName('message').setDescription('Announcement text').setRequired(true).setMaxLength(1900)).addChannelOption(o=>o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('giveaway').setDescription('Start a simple reaction giveaway').addIntegerOption(o=>o.setName('minutes').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(10080)).addIntegerOption(o=>o.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1).setMaxValue(20)).addStringOption(o=>o.setName('prize').setDescription('Prize').setRequired(true).setMaxLength(200)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map(c=>c.toJSON());

async function registerCommands(){
  const rest=new REST({version:'10'}).setToken(TOKEN); const route=Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID); await rest.put(route,{body:commands}); console.log(`[COMMANDS] Registered ${commands.length} commands`);
}
async function exportTranscript(i){
  if(!i.channel?.isTextBased()) return i.reply({content:'❌ This command can only be used in a text channel.',flags:MessageFlags.Ephemeral});
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try{ const messages=await i.channel.messages.fetch({limit:100}); const lines=[...messages.values()].reverse().map(m=>`[${m.createdAt.toISOString()}] ${m.author.tag}: ${clean(m.content,1500)}`).join('\n'); const file=new AttachmentBuilder(Buffer.from(lines||'No messages.','utf8'),{name:`transcript-${i.channel.name}-${Date.now()}.txt`}); await i.editReply({content:'✅ Transcript generated.',files:[file]}); }
  catch(e){console.error('[TRANSCRIPT]',e);await i.editReply({content:'❌ Failed to generate transcript.'}).catch(()=>{});}
}
function getUserVouches(id){ return store.vouches.filter(v=>v.userId===id); }
function getVouchCount(id){ return getUserVouches(id).length; }
function addWarning(id,entry){ store.warnings[id]??=[]; store.warnings[id].push(entry); dirty=true; }

async function handleCommand(i){
  const name=i.commandName; store.stats.commands[i.user.id]=(store.stats.commands[i.user.id]||0)+1; dirty=true;
  if(name==='ping') return i.reply({content:`🏓 Pong! ${client.ws.ping}ms`,flags:MessageFlags.Ephemeral});
  if(name==='help') return i.reply({embeds:[embed('FSMM COMMANDS','**Services:** `/setup` `/ticket`\n**Community:** `/vouch` `/vouches` `/leaderboard` `/stats`\n**Moderation:** `/warn` `/warnings` `/kick` `/ban` `/unban` `/timeout` `/untimeout` `/clear`\n**Utility:** `/ping` `/help` `/membercount` `/transcript` `/announce` `/giveaway`')],flags:MessageFlags.Ephemeral});
  if(name==='membercount') return i.reply({content:`👥 **${i.guild.memberCount}** members`,flags:MessageFlags.Ephemeral});
  if(name==='setup'||name==='ticket'){ if(name==='setup'&&!isStaff(i)) return i.reply({content:'❌ Staff only.',flags:MessageFlags.Ephemeral}); await i.deferReply({flags:MessageFlags.Ephemeral}); try{await syncPanels(i.guild);return i.editReply({content:'✅ FSMM service panels are synced.'});}catch(e){console.error('[SETUP]',e);return i.editReply({content:'❌ Setup failed. Check bot permissions.'});} }
  if(name==='vouch'){
    const user=i.options.getUser('user',true), message=clean(i.options.getString('message',true),500); if(user.bot) return i.reply({content:'❌ You cannot vouch a bot.',flags:MessageFlags.Ephemeral});
    store.vouches.push({userId:user.id,authorId:i.user.id,message,createdAt:Date.now()}); dirty=true; return i.reply({embeds:[embed('⭐ Vouch Added',`**Member:** <@${user.id}>\n**Vouch:** ${message}\n**Total vouches:** ${getVouchCount(user.id)}`)]});
  }
  if(name==='vouches'){
    const user=i.options.getUser('user')||i.user, list=getUserVouches(user.id); const recent=list.slice(-5).reverse(); const desc=recent.length?recent.map((v,n)=>`${n+1}. <@${v.authorId}> — ${clean(v.message,250)}`).join('\n'):'No vouches yet.'; return i.reply({embeds:[embed(`⭐ ${user.username} — ${list.length} Vouches`,desc)],flags:MessageFlags.Ephemeral});
  }
  if(name==='leaderboard'){
    const counts=new Map(); for(const v of store.vouches) counts.set(v.userId,(counts.get(v.userId)||0)+1); const top=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10); const desc=top.length?top.map(([id,n],idx)=>`**${idx+1}.** <@${id}> — **${n}** vouches`).join('\n'):'No vouches yet.'; return i.reply({embeds:[embed('🏆 FSMM Vouch Leaderboard',desc)]});
  }
  if(name==='stats'){
    const user=i.options.getUser('user')||i.user, messages=store.stats.messages[user.id]||0, commands=store.stats.commands[user.id]||0; return i.reply({embeds:[embed(`📊 ${user.username} Stats`,`**Messages tracked:** ${messages}\n**Commands used:** ${commands}\n**Vouches received:** ${getVouchCount(user.id)}`)],flags:MessageFlags.Ephemeral});
  }
  if(name==='transcript') return exportTranscript(i);
  if(name==='warn'){
    const user=i.options.getUser('user',true), reason=clean(i.options.getString('reason',true),500); addWarning(user.id,{authorId:i.user.id,reason,createdAt:Date.now()}); await logEvent(i.guild,'WARN',`**User:** <@${user.id}>\n**By:** <@${i.user.id}>\n**Reason:** ${reason}`); return i.reply({content:`⚠️ <@${user.id}> has been warned. They now have **${store.warnings[user.id].length}** warning(s).`});
  }
  if(name==='warnings'){
    const user=i.options.getUser('user',true), list=store.warnings[user.id]||[]; const desc=list.length?list.map((w,n)=>`**${n+1}.** <@${w.authorId}> — ${clean(w.reason,300)}`).join('\n'):'No warnings.'; return i.reply({embeds:[embed(`⚠️ Warnings — ${user.username}`,desc)],flags:MessageFlags.Ephemeral});
  }
  if(name==='kick'||name==='ban'){
    const user=i.options.getUser('user',true), reason=clean(i.options.getString('reason')||'No reason provided',500); await i.deferReply({flags:MessageFlags.Ephemeral}); try{const member=await i.guild.members.fetch(user.id).catch(()=>null); if(!member) return i.editReply({content:'❌ Member is not in the server.'}); if(!member.manageable) return i.editReply({content:'❌ I cannot moderate this member. Check role hierarchy.'}); if(name==='kick') await member.kick(reason); else await member.ban({reason,deleteMessageSeconds:0}); await logEvent(i.guild,name.toUpperCase(),`**User:** <@${user.id}>\n**By:** <@${i.user.id}>\n**Reason:** ${reason}`); return i.editReply({content:`✅ ${name==='kick'?'Kicked':'Banned'} <@${user.id}>.`});}catch(e){console.error(`[${name}]`,e);return i.editReply({content:`❌ Failed to ${name} this member.`});}
  }
  if(name==='unban'){ const id=i.options.getString('user_id',true).trim(); await i.deferReply({flags:MessageFlags.Ephemeral}); try{await i.guild.members.unban(id);return i.editReply({content:`✅ <@${id}> has been unbanned.`});}catch(e){return i.editReply({content:'❌ Could not unban that user. Check the ID and existing ban.'});} }
  if(name==='timeout'){
    const user=i.options.getUser('user',true), minutes=i.options.getInteger('minutes',true), reason=clean(i.options.getString('reason')||'No reason provided',500); await i.deferReply({flags:MessageFlags.Ephemeral}); try{const member=await i.guild.members.fetch(user.id); if(!member.moderatable) return i.editReply({content:'❌ I cannot timeout this member. Check role hierarchy.'}); await member.timeout(minutes*60*1000,reason); await logEvent(i.guild,'TIMEOUT',`**User:** <@${user.id}>\n**By:** <@${i.user.id}>\n**Duration:** ${minutes}m\n**Reason:** ${reason}`); return i.editReply({content:`✅ <@${user.id}> timed out for **${minutes} minute(s)**.`});}catch(e){console.error('[TIMEOUT]',e);return i.editReply({content:'❌ Failed to timeout this member.'});}
  }
  if(name==='untimeout'){ const user=i.options.getUser('user',true); await i.deferReply({flags:MessageFlags.Ephemeral}); try{const member=await i.guild.members.fetch(user.id); await member.timeout(null,'FSMM timeout removed');return i.editReply({content:`✅ Timeout removed from <@${user.id}>.`});}catch(e){return i.editReply({content:'❌ Failed to remove the timeout.'});} }
  if(name==='clear'){ const amount=i.options.getInteger('amount',true); await i.deferReply({flags:MessageFlags.Ephemeral}); try{const deleted=await i.channel.bulkDelete(amount,true);return i.editReply({content:`🧹 Deleted **${deleted.size}** messages.`});}catch(e){return i.editReply({content:'❌ Failed to delete messages. Discord only allows bulk deletion of recent messages.'});} }
  if(name==='announce'){ const message=clean(i.options.getString('message',true),1900), channel=i.options.getChannel('channel')||i.channel; if(!channel.isTextBased()) return i.reply({content:'❌ Invalid channel.',flags:MessageFlags.Ephemeral}); await channel.send({embeds:[embed('📢 FSMM Announcement',message)]}); return i.reply({content:`✅ Announcement sent to ${channel}.`,flags:MessageFlags.Ephemeral}); }
  if(name==='giveaway'){
    const minutes=i.options.getInteger('minutes',true), winners=i.options.getInteger('winners',true), prize=clean(i.options.getString('prize',true),200); const end=Date.now()+minutes*60000; const msg=await i.channel.send({embeds:[embed('🎉 FSMM GIVEAWAY',`**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(end/1000)}:R>\n\nReact with 🎉 to enter!\nHosted by <@${i.user.id}>`)]}); await msg.react('🎉'); await i.reply({content:'✅ Giveaway started.',flags:MessageFlags.Ephemeral}); setTimeout(async()=>{try{const fresh=await msg.fetch(); const reaction=fresh.reactions.cache.get('🎉'); if(!reaction)return; const users=await reaction.users.fetch(); const entries=users.filter(u=>!u.bot).map(u=>u.id); if(!entries.length)return fresh.reply('🎉 Giveaway ended, but nobody entered.'); const shuffled=entries.sort(()=>Math.random()-0.5); const chosen=shuffled.slice(0,Math.min(winners,shuffled.length)); await fresh.reply(`🎉 **Giveaway ended!**\nPrize: **${prize}**\nWinner(s): ${chosen.map(id=>`<@${id}>`).join(', ')}`);}catch(e){console.error('[GIVEAWAY]',e);}},minutes*60000);
  }
}

client.once('clientReady',async()=>{
  console.log(`[FSMM ${VERSION}] ONLINE AS ${client.user.tag}`); client.user.setPresence({activities:[{name:'FSMM • Services',type:3}],status:'online'});
  try{await registerCommands(); const guild=client.guilds.cache.get(GUILD_ID); if(guild) await syncPanels(guild); console.log('[FSMM] STARTUP COMPLETE');}catch(e){console.error('[STARTUP]',e.stack||e.message);}
});

client.on('interactionCreate',async i=>{
  if(i.replied||i.deferred) return;
  try{
    if(i.isChatInputCommand()) return await handleCommand(i);
    if(i.isStringSelectMenu()){
      if(i.customId==='fsmm_mm_pick') return i.showModal(mmModal(i.values[0]));
      if(i.customId==='fsmm_support_pick') return i.showModal(supportModal(i.values[0]));
      if(i.customId==='fsmm_base_pick'){ await i.deferReply({flags:MessageFlags.Ephemeral}); const preview=await basePreview(i.values[0]); return i.editReply({...preview,components:[baseContinue(i.values[0])]}); }
      return;
    }
    if(i.isButton()){
      if(i.customId==='fsmm_claim') return claimTicket(i);
      if(i.customId==='fsmm_close') return closeTicket(i);
      if(i.customId.startsWith('fsmm_base_continue:')) return i.showModal(paintModal(decodeURIComponent(i.customId.split(':')[1])));
      return;
    }
    if(i.isModalSubmit()){
      if(i.customId.startsWith('fsmm_mm_modal:')) return createTicket(i,'middleman',{'Trade value':decodeURIComponent(i.customId.split(':')[1]),'What YOU are giving':i.fields.getTextInputValue('giving'),'What the OTHER TRADER is giving':i.fields.getTextInputValue('receiving'),'Other trader username':i.fields.getTextInputValue('other'),'Tip':i.fields.getTextInputValue('tip')});
      if(i.customId.startsWith('fsmm_support_modal:')){const kind=i.customId.split(':')[1];return createTicket(i,'support',{'Support type':Object.fromEntries(SUPPORT_VALUES.map(([l,v])=>[v,l]))[kind]||'Support','Details':i.fields.getTextInputValue('details'),'Roblox username':i.fields.getTextInputValue('roblox')});}
      if(i.customId.startsWith('fsmm_paint_modal:')) return createTicket(i,'base-painting',{'Base':decodeURIComponent(i.customId.split(':')[1]),'Roblox username':i.fields.getTextInputValue('roblox'),'Payment':i.fields.getTextInputValue('payment'),'Collateral':i.fields.getTextInputValue('collateral'),'Extra details':i.fields.getTextInputValue('extra')});
    }
  }catch(e){
    console.error('[INTERACTION]',e.stack||e.message);
    try{if(i.deferred) await i.editReply({content:'❌ Something went wrong. Please try again.'}); else if(!i.replied) await i.reply({content:'❌ Something went wrong. Please try again.',flags:MessageFlags.Ephemeral});}catch{}
  }
});

client.on('messageCreate',m=>{ if(m.author.bot||!m.guild)return; store.stats.messages[m.author.id]=(store.stats.messages[m.author.id]||0)+1; dirty=true; });
process.on('unhandledRejection',e=>console.error('[UNHANDLED REJECTION]',e));
process.on('uncaughtException',e=>console.error('[UNCAUGHT EXCEPTION]',e));
client.on('error',e=>console.error('[CLIENT ERROR]',e));
client.on('shardError',e=>console.error('[SHARD ERROR]',e));
client.login(TOKEN).catch(e=>{console.error('[LOGIN]',e);process.exitCode=1;});
