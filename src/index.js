require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder,
  PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder,
  ButtonStyle, ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle,
  MessageFlags,
} = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
if (!TOKEN || !CLIENT_ID || !GUILD_ID) throw new Error('Missing required environment variables: DISCORD_TOKEN, CLIENT_ID, GUILD_ID');

const VERSION = '12.1.0';
const ROLE_IDS = Object.freeze({
  owner: '1466090947170406617',
  mod: '1466085137459712114',
  staff: '1466088151331242015',
  indexProvider: '1466245073820844211',
  middleman: '1466091035510706262',
});
const ROLE_NAMES = Object.freeze({ staff: 'FSMM Staff', middleman: 'FSMM Middleman', painter: 'FSMM Base Painter', owner: 'Owner' });
const CATEGORY_NAME = '🎫 FSMM SERVICES';
const LOG_CHANNEL_NAME = 'fsmm-logs';
const MAX_OPEN_TICKETS = 3;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'store.json');

const BASES = ['Candy', 'Lava', 'Galaxy', 'Yin Yang', 'Radioactive', 'Cursed', 'Divine', 'Cyber', 'Phantom', 'Crystal'];
const BASE_EMOJIS = { Candy:'🍬', Lava:'🌋', Galaxy:'🌌', 'Yin Yang':'☯️', Radioactive:'☢️', Cursed:'😈', Divine:'✨', Cyber:'🤖', Phantom:'👻', Crystal:'💎' };
const BASE_FILES = { Candy:'Candy_Base.png', Lava:'Lava_Base.png', Galaxy:'Galaxy_Base.png', 'Yin Yang':'Yin_Yang_Base.png', Radioactive:'Radioactive_Base.png', Cursed:'Cursed_Base.png', Divine:'Divine_Base.png', Cyber:'Cyber_Base.png', Phantom:'Phantom_Base.png', Crystal:'Crystal_Base.png' };
const MM_VALUES = [
  ['10M - 250M','Trades from 10M to 250M','💰'], ['250M - 500M','Trades from 250M to 500M','💵'],
  ['500M - 1B','Trades from 500M to 1B','💎'], ['1B - 5B','Trades from 1B to 5B','🔥'],
  ['5B+','Trades worth 5B or more','🚀'], ['OG / Rare Items','OG, rare or unusual items','👑'],
];
const SUPPORT_VALUES = [
  ['Host a Giveaway','host_gw','🎉','Request FSMM to host a giveaway'], ['Claim a Giveaway','claim_gw','🎁','Get help claiming a giveaway'],
  ['Report','report','🚨','Report a problem or user'], ['Apply for a Role','role_apply','📋','Apply for an FSMM role'],
];

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
const creationLocks = new Set();
const claimLocks = new Set();

const clean = (value, max = 900) => String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/@everyone|@here/gi, '@ mention').trim().slice(0, max) || 'Not provided';
const embed = (title, description) => new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({ text: 'FSMM' });
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const roleHas = (i, id) => Boolean(i.member?.roles?.cache?.has(id));
const roleNameHas = (i, name) => Boolean(i.member?.roles?.cache?.some(r => r.name === name));
function isOwner(i) { return i.guild?.ownerId === i.user.id || roleHas(i, ROLE_IDS.owner) || roleNameHas(i, ROLE_NAMES.owner); }
function isStaff(i) { return isOwner(i) || roleHas(i, ROLE_IDS.mod) || roleHas(i, ROLE_IDS.staff) || roleNameHas(i, ROLE_NAMES.staff); }
function ticketType(topic = '') { return topic.match(/TYPE:([^\s]+)/)?.[1] || null; }
function openerId(topic = '') { return topic.match(/FSMM_USER:(\d+)/)?.[1] || null; }
function claimedId(topic = '') { return topic.match(/CLAIMED_BY:(\d+)/)?.[1] || null; }
function typeLabel(type) { return type === 'middleman' ? 'Middleman' : type === 'support' ? 'Support' : type === 'base-painting' ? 'Base Painting' : 'Ticket'; }
function teamRole(type, roles) { return type === 'middleman' ? roles.mm : type === 'base-painting' ? roles.painter : roles.staff; }

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { config: {} };
    const value = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return value && typeof value === 'object' ? value : { config: {} };
  } catch (e) { console.error('[FSMM DATA] load:', e.message); return { config: {} }; }
}
let store = loadStore();
function saveStore() {
  try { fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true }); const tmp = `${DATA_FILE}.tmp`; fs.writeFileSync(tmp, JSON.stringify(store, null, 2)); fs.renameSync(tmp, DATA_FILE); }
  catch (e) { console.error('[FSMM DATA] save:', e.message); }
}

async function ensureRolesAndCategory(guild) {
  const find = (id, name) => guild.roles.cache.get(id) || guild.roles.cache.find(r => r.name === name);
  let staff = find(ROLE_IDS.staff, ROLE_NAMES.staff);
  let mm = find(ROLE_IDS.middleman, ROLE_NAMES.middleman);
  let painter = find(ROLE_IDS.indexProvider, ROLE_NAMES.painter);
  let owner = find(ROLE_IDS.owner, ROLE_NAMES.owner);
  if (!staff) staff = await guild.roles.create({ name: ROLE_NAMES.staff, reason: 'FSMM setup' });
  if (!mm) mm = await guild.roles.create({ name: ROLE_NAMES.middleman, reason: 'FSMM setup' });
  if (!painter) painter = await guild.roles.create({ name: ROLE_NAMES.painter, reason: 'FSMM setup' });
  if (!owner) owner = await guild.roles.create({ name: ROLE_NAMES.owner, reason: 'FSMM setup' });
  let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME);
  if (!category) category = await guild.channels.create({ name: CATEGORY_NAME, type: ChannelType.GuildCategory, reason: 'FSMM setup' });
  let logs = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === LOG_CHANNEL_NAME);
  if (!logs) logs = await guild.channels.create({ name: LOG_CHANNEL_NAME, type: ChannelType.GuildText, reason: 'FSMM logs', permissionOverwrites: [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: staff.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
    { id: owner.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
  ] });
  return { staff, mm, painter, owner, category, logs };
}
async function logEvent(guild, title, details) { try { const { logs } = await ensureRolesAndCategory(guild); await logs.send({ embeds: [embed(`🛡️ FSMM ${title}`, details)] }); } catch (e) { console.error('[FSMM LOG]', e.message); } }

function middlemanMenu() { return row(new StringSelectMenuBuilder().setCustomId('fsmm_mm_pick').setPlaceholder('🤝 Select trade value...').addOptions(MM_VALUES.map(([label, description, emoji]) => ({ label, value: label, description, emoji })))); }
function supportMenu() { return row(new StringSelectMenuBuilder().setCustomId('fsmm_support_pick').setPlaceholder('🛟 Select support type...').addOptions(SUPPORT_VALUES.map(([label, value, emoji, description]) => ({ label, value, emoji, description })))); }
function baseMenu() { return row(new StringSelectMenuBuilder().setCustomId('fsmm_base_pick').setPlaceholder('🎨 Select a base to preview...').addOptions(BASES.map(base => ({ label: base, value: base, description: `${base} Base Painting`, emoji: BASE_EMOJIS[base] })))); }
function panelConfigs() { return [
  ['🤝・middleman', embed('🤝 FSMM MIDDLEMAN', 'Need a safe middleman?\n\nChoose the trade value below. You will answer a few questions before a private ticket is created.'), middlemanMenu()],
  ['🛟・support', embed('🛟 FSMM SUPPORT', 'Choose what you need:\n\n🎉 **Host a Giveaway**\n🎁 **Claim a Giveaway**\n🚨 **Report**\n📋 **Apply for a Role**'), supportMenu()],
  ['🎨・base-painting', embed('🎨 FSMM BASE PAINTING', 'Select a base to preview it first, then continue to the request form.'), baseMenu()],
]; }
async function upsertPanel(channel, panelEmbed, components) {
  const messages = await channel.messages.fetch({ limit: 20 });
  const existing = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0);
  if (existing) return existing.edit({ embeds: [panelEmbed], components: [components] });
  return channel.send({ embeds: [panelEmbed], components: [components] });
}
async function syncPanels(guild) {
  const { category } = await ensureRolesAndCategory(guild);
  let count = 0;
  for (const [name, panelEmbed, components] of panelConfigs()) {
    let channel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.name === name);
    if (!channel) channel = await guild.channels.create({ name, type: ChannelType.GuildText, parent: category.id, reason: 'FSMM panel setup' });
    await upsertPanel(channel, panelEmbed, components); count++;
  }
  console.log(`[FSMM PANELS] READY ${count}/3`);
}

function input(id, label, style = TextInputStyle.Short, required = true, max = 900, placeholder) {
  const c = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max); if (placeholder) c.setPlaceholder(placeholder); return c;
}
function mmModal(value) { return new ModalBuilder().setCustomId(`fsmm_mm_modal:${encodeURIComponent(value)}`).setTitle('FSMM Middleman Request').addComponents(row(input('giving','What are YOU giving?',TextInputStyle.Paragraph)),row(input('receiving','What is the OTHER TRADER giving?',TextInputStyle.Paragraph)),row(input('other','Other trader username',TextInputStyle.Short,true,100,'@username')),row(input('tip','What are you tipping?',TextInputStyle.Short,false,300,'Optional'))); }
function supportModal(kind) { const name = Object.fromEntries(SUPPORT_VALUES.map(([label,value]) => [value,label]))[kind] || 'FSMM Support'; return new ModalBuilder().setCustomId(`fsmm_support_modal:${kind}`).setTitle(name).addComponents(row(input('details',kind === 'role_apply' ? 'Why should we accept your application?' : 'Tell us what you need',TextInputStyle.Paragraph)),row(input('roblox','Roblox username',TextInputStyle.Short,false,100,'Optional'))); }
function paintModal(base) { return new ModalBuilder().setCustomId(`fsmm_paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`).addComponents(row(input('roblox','Roblox username')),row(input('payment','What is your payment?',TextInputStyle.Paragraph,true,500)),row(input('collateral','What is your collateral?',TextInputStyle.Paragraph,true,500)),row(input('extra','Extra details',TextInputStyle.Paragraph,false,900,'Optional'))); }
function baseImage(base) { return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(BASE_FILES[base])}`; }
function basePreview(base) { return embed(`${BASE_EMOJIS[base] || '🎨'} ${base} BASE PREVIEW`, `**Base:** ${base}\n\nIf this is the base you want painted, press **Continue to Request** below.`).setImage(baseImage(base)); }
function baseContinue(base) { return row(new ButtonBuilder().setCustomId(`fsmm_base_continue:${encodeURIComponent(base)}`).setLabel('Continue to Request').setEmoji('🎨').setStyle(ButtonStyle.Primary)); }
function ticketButtons(claimed) { return row(new ButtonBuilder().setCustomId('fsmm_claim').setLabel(claimed ? 'Ticket Claimed' : 'Claim Ticket').setEmoji(claimed ? '✅' : '🙋').setStyle(claimed ? ButtonStyle.Secondary : ButtonStyle.Primary).setDisabled(Boolean(claimed)), new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger)); }

function ticketCount(guild, userId) { const category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === CATEGORY_NAME); return category ? category.children.cache.filter(c => c.type === ChannelType.GuildText && c.topic?.includes(`FSMM_USER:${userId}`)).size : 0; }
async function createTicket(i, type, data) {
  if (creationLocks.has(i.user.id)) return i.reply({ content: '⏳ Your ticket request is already being processed.', flags: MessageFlags.Ephemeral });
  if (ticketCount(i.guild, i.user.id) >= MAX_OPEN_TICKETS) return i.reply({ content: `❌ You already have ${MAX_OPEN_TICKETS} open FSMM tickets.`, flags: MessageFlags.Ephemeral });
  creationLocks.add(i.user.id);
  try {
    const roles = await ensureRolesAndCategory(i.guild); const team = teamRole(type, roles); const slug = type === 'middleman' ? 'middleman' : type === 'support' ? 'support' : 'base-painting';
    const safeUser = i.user.username.toLowerCase().replace(/[^a-z0-9-]/g,'').slice(0,70) || i.user.id;
    const channel = await i.guild.channels.create({ name:`${slug}-${safeUser}`.slice(0,95), type:ChannelType.GuildText, parent:roles.category.id, topic:`FSMM_USER:${i.user.id} TYPE:${type}`,
      permissionOverwrites:[
        { id:i.guild.roles.everyone.id, deny:[PermissionFlagsBits.ViewChannel] },
        { id:i.user.id, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory] },
        { id:roles.staff.id, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory] },
        { id:team.id, allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory] },
      ], reason:`FSMM ${typeLabel(type)} ticket` });
    const details = Object.entries(data).map(([k,v]) => `**${clean(k,100)}:**\n${clean(v,900)}`).join('\n\n');
    await channel.send({ content:`<@${i.user.id}> <@&${team.id}>`, allowedMentions:{users:[i.user.id],roles:[team.id]}, embeds:[embed(`🎫 FSMM ${typeLabel(type).toUpperCase()} TICKET`, ['**Status:** 🟢 OPEN',`**Opened by:** <@${i.user.id}>`,'',details,'','A team member can claim this ticket using **Claim Ticket**.','Only FSMM staff can close tickets.'].join('\n'))], components:[ticketButtons(null)] });
    await logEvent(i.guild,'TICKET OPENED',`**Ticket:** ${channel}\n**Type:** ${typeLabel(type)}\n**Opened by:** <@${i.user.id}>`);
    return i.reply({ content:`✅ Your private ticket is ready: ${channel}`, flags:MessageFlags.Ephemeral });
  } catch (e) {
    console.error('[FSMM TICKET CREATE]', e.stack || e.message);
    if (!i.replied && !i.deferred) return i.reply({ content:'❌ We could not create the ticket. Please try again.', flags:MessageFlags.Ephemeral });
  } finally { creationLocks.delete(i.user.id); }
}
async function fetchTranscript(channel) {
  const messages=[]; let before;
  while(true){ const batch=await channel.messages.fetch({limit:100,...(before?{before}:{})}); if(!batch.size)break; messages.push(...batch.values()); if(batch.size<100)break; before=batch.last().id; }
  messages.sort((a,b)=>a.createdTimestamp-b.createdTimestamp);
  const lines=['FSMM TICKET TRANSCRIPT',`Channel: #${channel.name}`,`Type: ${typeLabel(ticketType(channel.topic||''))}`,`Created: ${new Date(channel.createdTimestamp).toISOString()}`,''];
  for(const m of messages){const text=m.content?.trim()||'[embed/component/attachment]';const attachments=m.attachments.size?` | Attachments: ${[...m.attachments.values()].map(a=>a.url).join(', ')}`:'';lines.push(`[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${text}${attachments}`);}
  return Buffer.from(lines.join('\n'),'utf8');
}
async function closeTicket(channel, closer) {
  const transcript=await fetchTranscript(channel); const roles=await ensureRolesAndCategory(channel.guild); const opener=openerId(channel.topic||''); const claimer=claimedId(channel.topic||'');
  await roles.logs.send({embeds:[embed('🔒 TICKET CLOSED',[`**Ticket:** #${channel.name}`,`**Type:** ${typeLabel(ticketType(channel.topic||''))}`,`**Opened by:** ${opener?`<@${opener}>`:'Unknown'}`,`**Closed by:** <@${closer.id}>`,`**Claimed by:** ${claimer?`<@${claimer}>`:'Unclaimed'}`].join('\n'))],files:[{attachment:transcript,name:`${channel.name}-transcript.txt`}]});
  await channel.delete('FSMM ticket closed by staff');
}

const coreCommands = [
  new SlashCommandBuilder().setName('ping').setDescription('Show bot latency.'),
  new SlashCommandBuilder().setName('help').setDescription('Show FSMM bot commands.'),
  new SlashCommandBuilder().setName('membercount').setDescription('Show server member count.'),
  new SlashCommandBuilder().setName('setup').setDescription('Owner-only: sync the 3 FSMM service panels.'),
  new SlashCommandBuilder().setName('ticket').setDescription('Owner-only: sync the 3 FSMM service panels.'),
].map(c => c.toJSON());
async function registerCoreCommands(){const rest=new REST({version:'10'}).setToken(TOKEN);const route=Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID);const existing=await rest.get(route);const names=new Set(coreCommands.map(c=>c.name));const merged=[...existing.filter(c=>!names.has(c.name)),...coreCommands];await rest.put(route,{body:merged});const verified=await rest.get(route);const missing=coreCommands.filter(c=>!verified.some(v=>v.name===c.name));if(missing.length)throw new Error(`Core command verification failed: ${missing.map(c=>c.name).join(', ')}`);console.log(`[FSMM COMMANDS] CORE VERIFIED ${coreCommands.length}/${coreCommands.length}`);}

client.on('interactionCreate', async i => {
  try {
    if (!i.guild) return;
    if (i.replied || i.deferred) return;
    if (i.isChatInputCommand()) {
      if (i.commandName === 'ping') return i.reply({content:`🏓 Pong! ${client.ws.ping}ms`,flags:MessageFlags.Ephemeral});
      if (i.commandName === 'help') return i.reply({embeds:[embed('🤖 FSMM BOT','🎫 Three private service systems: Middleman, Support and Base Painting.\n\nUse `/ticket` to sync the service panels.\n\nStaff/community commands are available through their slash commands.')],flags:MessageFlags.Ephemeral});
      if (i.commandName === 'membercount') return i.reply({content:`👥 Members: **${i.guild.memberCount}**`,flags:MessageFlags.Ephemeral});
      if (i.commandName === 'setup' || i.commandName === 'ticket') { if(!isOwner(i))return i.reply({content:'❌ Owner only.',flags:MessageFlags.Ephemeral}); await i.deferReply({flags:MessageFlags.Ephemeral}); await syncPanels(i.guild); return i.editReply('✅ FSMM panels and ticket roles are synced.'); }
      return;
    }
    if (i.isStringSelectMenu()) {
      if (i.customId === 'fsmm_mm_pick') return i.showModal(mmModal(i.values[0]));
      if (i.customId === 'fsmm_support_pick') return i.showModal(supportModal(i.values[0]));
      if (i.customId === 'fsmm_base_pick') { const base=i.values[0]; if(!BASES.includes(base))return i.reply({content:'❌ Invalid base.',flags:MessageFlags.Ephemeral}); return i.reply({embeds:[basePreview(base)],components:[baseContinue(base)],flags:MessageFlags.Ephemeral}); }
      return;
    }
    if (i.isButton()) {
      if (i.customId.startsWith('fsmm_base_continue:')) { const base=decodeURIComponent(i.customId.slice('fsmm_base_continue:'.length)); if(!BASES.includes(base))return i.reply({content:'❌ Invalid base.',flags:MessageFlags.Ephemeral}); return i.showModal(paintModal(base)); }
      if (i.customId === 'fsmm_claim') {
        const ch=i.channel,type=ticketType(ch?.topic||''); if(!['middleman','support','base-painting'].includes(type))return i.reply({content:'❌ This is not an FSMM ticket.',flags:MessageFlags.Ephemeral});
        const allowed=isStaff(i)|| (type==='middleman'&&roleHas(i,ROLE_IDS.middleman)) || (type==='base-painting'&&roleHas(i,ROLE_IDS.indexProvider));
        if(!allowed)return i.reply({content:'❌ You are not allowed to claim this ticket.',flags:MessageFlags.Ephemeral});
        if(claimedId(ch.topic||''))return i.reply({content:'❌ This ticket is already claimed.',flags:MessageFlags.Ephemeral});
        if(claimLocks.has(ch.id))return i.reply({content:'⏳ This ticket is already being claimed.',flags:MessageFlags.Ephemeral});
        claimLocks.add(ch.id);
        try { await ch.setTopic(`${ch.topic} CLAIMED_BY:${i.user.id}`.slice(0,1024)); const e=i.message.embeds[0]?EmbedBuilder.from(i.message.embeds[0]):embed('🎫 FSMM TICKET',''); e.setDescription((e.data.description||'').replace('**Status:** 🟢 OPEN','**Status:** 🟡 CLAIMED')+`\n\n**Claimed by:** <@${i.user.id}>`); await i.message.edit({embeds:[e],components:[ticketButtons(i.user.id)]}); await logEvent(i.guild,'TICKET CLAIMED',`**Ticket:** ${ch}\n**Claimed by:** <@${i.user.id}>`); return i.reply({content:'✅ Ticket claimed.',flags:MessageFlags.Ephemeral}); } finally { claimLocks.delete(ch.id); }
      }
      if (i.customId === 'fsmm_close') { const ch=i.channel,type=ticketType(ch?.topic||''); if(!['middleman','support','base-painting'].includes(type))return i.reply({content:'❌ This is not an FSMM ticket.',flags:MessageFlags.Ephemeral}); if(!isStaff(i))return i.reply({content:'❌ Only FSMM Staff / Owners can close tickets.',flags:MessageFlags.Ephemeral}); await i.reply({content:'🔒 Creating transcript and closing ticket...',flags:MessageFlags.Ephemeral}); return closeTicket(ch,i.member); }
      return;
    }
    if (i.isModalSubmit()) {
      if (i.customId.startsWith('fsmm_mm_modal:')) { const value=decodeURIComponent(i.customId.slice('fsmm_mm_modal:'.length)); return createTicket(i,'middleman',{'Trade value':value,'What YOU are giving':i.fields.getTextInputValue('giving'),'What the OTHER TRADER is giving':i.fields.getTextInputValue('receiving'),'Other trader username':i.fields.getTextInputValue('other'),'Tip':i.fields.getTextInputValue('tip')||'Not provided'}); }
      if (i.customId.startsWith('fsmm_support_modal:')) { const kind=i.customId.slice('fsmm_support_modal:'.length); return createTicket(i,'support',{'Support type':kind,Details:i.fields.getTextInputValue('details'),'Roblox username':i.fields.getTextInputValue('roblox')||'Not provided'}); }
      if (i.customId.startsWith('fsmm_paint_modal:')) { const base=decodeURIComponent(i.customId.slice('fsmm_paint_modal:'.length)); if(!BASES.includes(base))return i.reply({content:'❌ Invalid base.',flags:MessageFlags.Ephemeral}); return createTicket(i,'base-painting',{Base:base,'Roblox username':i.fields.getTextInputValue('roblox'),Payment:i.fields.getTextInputValue('payment'),Collateral:i.fields.getTextInputValue('collateral'),'Extra details':i.fields.getTextInputValue('extra')||'Not provided'}); }
    }
  } catch(e) { console.error('[FSMM ERROR]',e.stack||e.message); if(i.isRepliable()&&!i.replied&&!i.deferred)await i.reply({content:'❌ Something went wrong. Please try again.',flags:MessageFlags.Ephemeral}).catch(()=>{}); }
});

client.once('clientReady', async () => {
  console.log(`[FSMM ${VERSION}] ONLINE AS ${client.user.tag}`);
  try { await registerCoreCommands(); if(client.guilds.cache.has(GUILD_ID)) await syncPanels(client.guilds.cache.get(GUILD_ID)); console.log('[FSMM] STARTUP SYNC COMPLETE'); }
  catch(e) { console.error('[FSMM STARTUP]',e.stack||e.message); }
});

process.on('unhandledRejection', e => console.error('[FSMM UNHANDLED REJECTION]', e?.stack || e));
process.on('uncaughtException', e => console.error('[FSMM UNCAUGHT EXCEPTION]', e?.stack || e));
client.login(TOKEN).catch(e => { console.error('[FSMM LOGIN]',e.stack||e.message); process.exit(1); });
