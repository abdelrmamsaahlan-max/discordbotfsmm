require('dotenv').config();
const fs=require('fs');
const path=require('path');
const {Client,GatewayIntentBits,REST,Routes,SlashCommandBuilder,EmbedBuilder,PermissionFlagsBits,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags}=require('discord.js');

const TOKEN=process.env.DISCORD_TOKEN;
const CLIENT_ID=process.env.CLIENT_ID;
const GUILD_ID=process.env.GUILD_ID;
if(!TOKEN||!CLIENT_ID||!GUILD_ID) throw new Error('Missing required environment variables.');

const VERSION='7.1.0';
const STAFF='FSMM Staff';
const MM='FSMM Middleman';
const OWNER='Owner';
const CATEGORY='🎫 FSMM SERVICES';
const DATA_FILE=process.env.DATA_FILE||path.join(__dirname,'..','data','store.json');
const mutationBases=['Candy','Lava','Galaxy','Yin Yang','Radioactive','Cursed','Divine','Cyber','Phantom','Crystal'];
const baseFiles={Candy:'CandyBase.png',Lava:'LavaBase.png',Galaxy:'GalaxyBase.png','Yin Yang':'YinYangBase.png',Radioactive:'RadioactiveBase.png',Cursed:'CursedBase.png',Divine:'DivineBase.png',Cyber:'CyberBase.png',Phantom:'PhantomBase.png',Crystal:'CrystalBase.png'};
const baseEmojis={Candy:'🍬',Lava:'🌋',Galaxy:'🌌','Yin Yang':'☯️',Radioactive:'☢️',Cursed:'😈',Divine:'✨',Cyber:'🤖',Phantom:'👻',Crystal:'💎'};
const mmValues=[['10M - 250M','Trades from 10M to 250M','💰'],['250M - 500M','Trades from 250M to 500M','💵'],['500M - 1B','Trades from 500M to 1B','💎'],['1B - 5B','Trades from 1B to 5B','🔥'],['5B+','Trades worth 5B or more','🚀'],['OG / Rare Items','OG, rare or unusual items','👑']];
const supportValues=[['Host a Giveaway','host_gw','🎉','Request FSMM to host a giveaway'],['Claim a Giveaway','claim_gw','🎁','Get help claiming a giveaway'],['Report','report','🚨','Report a problem or user'],['Apply for a Role','role_apply','📋','Apply for an FSMM role']];
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages]});

function clean(v,max=900){return String(v??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/@everyone|@here/gi,'@ mention').trim().slice(0,max)||'Not provided'}
function normalize(v=''){return String(v).toLowerCase().replace(/[^a-z0-9]/g,'')}
function safe(v,max=900){return clean(v,max).replace(/[\\*_`~|>]/g,'\\$&')}
function isOwner(i){return i.guild?.ownerId===i.user.id||Boolean(i.member?.roles?.cache?.some(r=>normalize(r.name)===normalize(OWNER)))}
function isStaff(i){return isOwner(i)||Boolean(i.member?.roles?.cache?.some(r=>[STAFF,MM].map(normalize).includes(normalize(r.name))))}
function embed(title,description){return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({text:`FSMM • v${VERSION}`})}
function row(component){return new ActionRowBuilder().addComponents(component)}
function closeButton(){return row(new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger))}
function baseImage(base){return `https://stealabrrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(baseFiles[base]||base+'Base.png')}`.replace('stealabrrot','stealabrainrot')}

function defaultStore(){return {users:{},vouches:[],warnings:[],config:{},giveaways:{}}}
let store=defaultStore();
function loadStore(){try{if(fs.existsSync(DATA_FILE)){const x=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));if(x&&typeof x==='object')store={...defaultStore(),...x,giveaways:x.giveaways||{}}}}catch(e){console.error('[FSMM STORE] load failed:',e.message)}}
function saveStore(){try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});const tmp=DATA_FILE+'.tmp';fs.writeFileSync(tmp,JSON.stringify(store,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(tmp,DATA_FILE)}catch(e){console.error('[FSMM STORE] save failed:',e.message)}}

async function ensureRolesAndCategory(guild){
 const staff=guild.roles.cache.find(r=>normalize(r.name)===normalize(STAFF))||await guild.roles.create({name:STAFF,reason:'FSMM service system'});
 const mm=guild.roles.cache.find(r=>normalize(r.name)===normalize(MM))||await guild.roles.create({name:MM,reason:'FSMM middleman system'});
 const owner=guild.roles.cache.find(r=>normalize(r.name)===normalize(OWNER))||await guild.roles.create({name:OWNER,reason:'FSMM owner administration'});
 const cat=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===CATEGORY)||await guild.channels.create({name:CATEGORY,type:ChannelType.GuildCategory,reason:'FSMM service system'});
 return {staff,mm,owner,cat};
}

function middlemanMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_mm_pick').setPlaceholder('🤝 Select trade value...').addOptions(mmValues.map(([label,description,emoji])=>({label,value:label,description,emoji}))))}
function supportMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_support_pick').setPlaceholder('🛟 Select support type...').addOptions(supportValues.map(([label,value,emoji,description])=>({label,value,emoji,description}))))}
function baseMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_base_pick').setPlaceholder('🎨 Select a base to preview...').addOptions(mutationBases.map(b=>({label:b,value:b,description:`${b} Base Painting`,emoji:baseEmojis[b]}))))}
function panelConfigs(){return [
 ['🤝・middleman',embed('🤝 FSMM MIDDLEMAN','Need a safe middleman?\n\nChoose the trade value below. Each option has its own emoji and you will then answer a few questions before your private ticket is created.'),middlemanMenu()],
 ['🛟・support',embed('🛟 FSMM SUPPORT','Need help from FSMM staff?\n\nChoose exactly what you need:\n\n🎉 **Host a Giveaway**\n🎁 **Claim a Giveaway**\n🚨 **Report**\n📋 **Apply for a Role**'),supportMenu()],
 ['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Want your base painted?\n\nSelect a base below to **preview it first**. You will see the base image and can continue to the request form.\n\n🍬 Candy → 💎 Crystal'),baseMenu()]
]}

async function upsertPanel(channel,emb,components){
 const messages=await channel.messages.fetch({limit:50}).catch(()=>null);
 const panel=messages?.find(m=>m.author.id===client.user.id&&m.embeds?.[0]?.title===emb.data.title);
 if(panel){await panel.edit({embeds:[emb],components:[components],allowedMentions:{parse:[]}});return 'edited'}
 await channel.send({embeds:[emb],components:[components],allowedMentions:{parse:[]}});return 'created';
}
async function setupPanels(guild){
 const {cat}=await ensureRolesAndCategory(guild);
 let count=0;
 for(const [name,emb,components] of panelConfigs()){
  let ch=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===name&&c.parentId===cat.id);
  if(!ch)ch=await guild.channels.create({name,type:ChannelType.GuildText,parent:cat.id,permissionOverwrites:[{id:guild.roles.everyone.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]}],reason:'FSMM service panel'});
  const action=await upsertPanel(ch,emb,components);count++;console.log(`[FSMM PANELS] ${action} #${name}`);
 }
 store.config=store.config||{};store.config.panelReadyAt=new Date().toISOString();store.config.panelCount=count;saveStore();console.log(`[FSMM PANELS] READY ${count}/3`);
}

function input(id,label,style=TextInputStyle.Short,required=true,max=900,placeholder=''){const x=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);if(placeholder)x.setPlaceholder(placeholder);return x}
function mmModal(value){const m=new ModalBuilder().setCustomId(`fsmm_mm_modal:${encodeURIComponent(value)}`).setTitle('FSMM Middleman Request');return m.addComponents(row(input('giving','What are YOU giving?',TextInputStyle.Paragraph,true,900)),row(input('receiving','What is the OTHER TRADER giving?',TextInputStyle.Paragraph,true,900)),row(input('other','Other trader username',TextInputStyle.Short,true,100,'@username')),row(input('tip','What are you tipping?',TextInputStyle.Short,false,300,'Optional')))}
function supportModal(kind){const names={host_gw:'Host a Giveaway',claim_gw:'Claim a Giveaway',report:'Report',role_apply:'Apply for a Role'};const m=new ModalBuilder().setCustomId(`fsmm_support_modal:${kind}`).setTitle(names[kind]||'FSMM Support');return m.addComponents(row(input('details',kind==='role_apply'?'Why should we accept your application?':'Tell us what you need',TextInputStyle.Paragraph,true,900)),row(input('roblox','Roblox username',TextInputStyle.Short,false,100,'Optional')))}
function paintModal(base){const m=new ModalBuilder().setCustomId(`fsmm_paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`);return m.addComponents(row(input('roblox','Roblox username',TextInputStyle.Short,true,100)),row(input('payment','What is your payment?',TextInputStyle.Paragraph,true,500)),row(input('collateral','What is your collateral?',TextInputStyle.Paragraph,true,500)),row(input('extra','Extra details',TextInputStyle.Paragraph,false,900,'Optional')))}
function basePreview(base){const e=embed(`${baseEmojis[base]||'🎨'} ${base} BASE PREVIEW`,`**Base:** ${base}\n\nThis is the preview for the base you selected.\n\nIf this is the base you want painted, press **Continue** below to open the request form.`);e.setImage(baseImage(base));return e}
function baseContinueButton(base){return row(new ButtonBuilder().setCustomId(`fsmm_base_continue:${encodeURIComponent(base)}`).setLabel('Continue to Request').setEmoji('🎨').setStyle(ButtonStyle.Primary))}

async function createTicket(i,type,data){
 const {staff,mm,cat}=await ensureRolesAndCategory(i.guild);
 const existing=i.guild.channels.cache.find(c=>c.parentId===cat.id&&c.topic===`FSMM_OWNER:${i.user.id}`);
 if(existing)return i.reply({content:`⚠️ You already have an open ticket: ${existing}`,flags:MessageFlags.Ephemeral});
 const prefix=type==='middleman'?'mm':type==='support'?'support':'paint';
 const overwrites=[{id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}];
 if(type==='middleman')overwrites.push({id:mm.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
 const username=(i.user.username||'user').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,35)||'user';
 const ch=await i.guild.channels.create({name:`${prefix}-${username}`,type:ChannelType.GuildText,parent:cat.id,topic:`FSMM_OWNER:${i.user.id}`,permissionOverwrites:overwrites,reason:'FSMM private service ticket'});
 const titles={middleman:'🤝 MIDDLEMAN SERVICE',support:'🛟 FSMM SUPPORT',basepainting:'🎨 BASE PAINTING'};
 const e=embed(titles[type],'A private FSMM service ticket has been opened. Please wait for staff assistance.');
 e.addFields({name:'Requester',value:`<@${i.user.id}>`,inline:true},{name:'Service',value:type==='basepainting'?'Base Painting':type[0].toUpperCase()+type.slice(1),inline:true});
 for(const [key,label,max] of [['value','💰 Trade Value',100],['giving','🎁 What YOU are giving',900],['receiving','📦 What the OTHER TRADER is giving',900],['other','👤 Other Trader',100],['tip','💵 Tip',300],['supportType','📌 Request Type',100],['details','📝 Details',900],['roblox','🎮 Roblox Username',100],['base','🎨 Base',100],['payment','💳 Payment',500],['collateral','🔐 Collateral',500],['extra','📝 Extra Details',900]])if(data[key])e.addFields({name:label,value:safe(data[key],max),inline:['value','other','supportType','roblox','base'].includes(key)});
 if(data.base)e.setImage(baseImage(data.base));
 const roleId=type==='middleman'?mm.id:staff.id;
 await ch.send({content:`<@${i.user.id}> <@&${roleId}>`,embeds:[e],components:[closeButton()],allowedMentions:{users:[i.user.id],roles:[roleId]}});
 return i.reply({content:`✅ Ticket created: ${ch}`,flags:MessageFlags.Ephemeral});
}

function parseDuration(value){const m=String(value).trim().match(/^(\d+)\s*(s|m|h|d)$/i);if(!m)return null;const n=Number(m[1]);const unit=m[2].toLowerCase();const mult={s:1000,m:60000,h:3600000,d:86400000}[unit];const ms=n*mult;return ms>=10000&&ms<=604800000?ms:null}
function giveawayButton(id){return row(new ButtonBuilder().setCustomId(`fsmm_gw_join:${id}`).setLabel('Enter Giveaway').setEmoji('🎉').setStyle(ButtonStyle.Success))}
async function finishGiveaway(id){const g=store.giveaways?.[id];if(!g||g.ended)return;g.ended=true;const channel=await client.channels.fetch(g.channelId).catch(()=>null);if(!channel?.isTextBased())return;const msg=await channel.messages.fetch(g.messageId).catch(()=>null);const entries=Object.keys(g.entries||{});const winners=[];const pool=[...entries];for(let n=0;n<Math.min(g.winners,pool.length);n++){const idx=Math.floor(Math.random()*pool.length);winners.push(pool.splice(idx,1)[0])}const text=winners.length?winners.map(x=>`<@${x}>`).join(', '):'No valid entries';const e=embed('🎉 GIVEAWAY ENDED',`**Prize:** ${safe(g.prize,200)}\n**Winner${winners.length===1?'':'s'}:** ${text}\n\nEntries: **${entries.length}**`);if(g.image)e.setImage(g.image);await msg.edit({embeds:[e],components:[]}).catch(()=>{});saveStore()}
function scheduleGiveaways(){for(const [id,g] of Object.entries(store.giveaways||{})){if(!g.ended){const delay=Math.max(0,Number(g.endsAt)-Date.now());setTimeout(()=>finishGiveaway(id),Math.min(delay,2147483647))}}}

const commands=[
 new SlashCommandBuilder().setName('ping').setDescription('Check FSMM bot status.'),
 new SlashCommandBuilder().setName('help').setDescription('Show FSMM bot commands.'),
 new SlashCommandBuilder().setName('serverinfo').setDescription('Show server information.'),
 new SlashCommandBuilder().setName('membercount').setDescription('Show member count.'),
 new SlashCommandBuilder().setName('setup').setDescription('Owner-only: repair and sync the 3 FSMM service panels.'),
 new SlashCommandBuilder().setName('ticket').setDescription('Owner-only: sync the 3 FSMM service panels.'),
 new SlashCommandBuilder().setName('giveaway').setDescription('Staff-only: start an FSMM giveaway.').addStringOption(o=>o.setName('duration').setDescription('Duration: 10s, 10m, 1h, or 1d').setRequired(true)).addIntegerOption(o=>o.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20).setRequired(true)).addStringOption(o=>o.setName('prize').setDescription('Giveaway prize').setMaxLength(200).setRequired(true)).addAttachmentOption(o=>o.setName('image').setDescription('Optional giveaway image').setRequired(false))
].map(x=>x.toJSON());

async function registerCommands(){const rest=new REST({version:'10'}).setToken(TOKEN);await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});console.log('[FSMM COMMANDS] REGISTERED — /giveaway + image included');}

client.on('interactionCreate',async i=>{
 try{
  if(i.isChatInputCommand()){
   if(i.commandName==='ping')return i.reply({content:`🏓 Pong! ${client.ws.ping}ms`,flags:MessageFlags.Ephemeral});
   if(i.commandName==='help')return i.reply({embeds:[embed('🤖 FSMM BOT COMMANDS','`/setup` — sync the 3 panels\n`/ticket` — sync the 3 panels\n`/giveaway` — start a giveaway (optional image)\n`/ping` — bot latency\n`/membercount` — server members')],flags:MessageFlags.Ephemeral});
   if(i.commandName==='serverinfo')return i.reply({embeds:[embed('📊 SERVER INFO',`**Server:** ${safe(i.guild.name,100)}\n**Members:** ${i.guild.memberCount}`)],flags:MessageFlags.Ephemeral});
   if(i.commandName==='membercount')return i.reply({content:`👥 Members: **${i.guild.memberCount}**`});
   if(i.commandName==='setup'||i.commandName==='ticket'){if(!isOwner(i))return i.reply({content:'❌ Owner-only.',flags:MessageFlags.Ephemeral});await i.deferReply({flags:MessageFlags.Ephemeral});await setupPanels(i.guild);return i.editReply('✅ 3 FSMM service panels synced.');}
   if(i.commandName==='giveaway'){
    if(!isStaff(i))return i.reply({content:'❌ Staff-only.',flags:MessageFlags.Ephemeral});
    const duration=i.options.getString('duration',true),ms=parseDuration(duration),winners=i.options.getInteger('winners',true),prize=i.options.getString('prize',true),image=i.options.getAttachment('image');
    if(!ms)return i.reply({content:'❌ Invalid duration. Use 10s–7d, for example `30m`, `2h`, or `1d`.',flags:MessageFlags.Ephemeral});
    const id=`${Date.now()}-${i.user.id}`;const endsAt=Date.now()+ms;store.giveaways=store.giveaways||{};store.giveaways[id]={id,channelId:i.channelId,messageId:null,hostId:i.user.id,prize,winners,endsAt,image:image?.url||null,entries:{},ended:false};
    const e=embed('🎉 FSMM GIVEAWAY',`**Prize:** ${safe(prize,200)}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endsAt/1000)}:R>\n**Hosted by:** <@${i.user.id}>\n\nClick the button below to enter!`);if(image?.url)e.setImage(image.url);
    const msg=await i.channel.send({embeds:[e],components:[giveawayButton(id)],allowedMentions:{parse:[]}});store.giveaways[id].messageId=msg.id;saveStore();setTimeout(()=>finishGiveaway(id),ms);return i.reply({content:`✅ Giveaway started: ${msg}`,flags:MessageFlags.Ephemeral});
   }
  }
  if(i.isStringSelectMenu()){
   if(i.customId==='fsmm_mm_pick')return i.showModal(mmModal(i.values[0]));
   if(i.customId==='fsmm_support_pick')return i.showModal(supportModal(i.values[0]));
   if(i.customId==='fsmm_base_pick'){const base=i.values[0];return i.reply({embeds:[basePreview(base)],components:[baseContinueButton(base)],flags:MessageFlags.Ephemeral});}
  }
  if(i.isButton()){
   if(i.customId.startsWith('fsmm_base_continue:')){const base=decodeURIComponent(i.customId.slice(19));return i.showModal(paintModal(base));}
   if(i.customId==='fsmm_close'){if(!isStaff(i))return i.reply({content:'❌ Staff-only.',flags:MessageFlags.Ephemeral});await i.reply({content:'🔒 Closing ticket...',flags:MessageFlags.Ephemeral});return i.channel.delete('FSMM ticket closed').catch(()=>{});}
   if(i.customId.startsWith('fsmm_gw_join:')){const id=i.customId.slice(13),g=store.giveaways?.[id];if(!g||g.ended)return i.reply({content:'❌ This giveaway has ended.',flags:MessageFlags.Ephemeral});g.entries=g.entries||{};if(g.entries[i.user.id])return i.reply({content:'ℹ️ You are already entered!',flags:MessageFlags.Ephemeral});g.entries[i.user.id]=Date.now();saveStore();return i.reply({content:'🎉 You are entered!',flags:MessageFlags.Ephemeral});}
  }
  if(i.isModalSubmit()){
   if(i.customId.startsWith('fsmm_mm_modal:')){const value=decodeURIComponent(i.customId.slice(15));return createTicket(i,'middleman',{value,giving:i.fields.getTextInputValue('giving'),receiving:i.fields.getTextInputValue('receiving'),other:i.fields.getTextInputValue('other'),tip:i.fields.getTextInputValue('tip')});}
   if(i.customId.startsWith('fsmm_support_modal:')){const kind=i.customId.slice(20);const labels={host_gw:'Host a Giveaway',claim_gw:'Claim a Giveaway',report:'Report',role_apply:'Apply for a Role'};return createTicket(i,'support',{supportType:labels[kind]||kind,details:i.fields.getTextInputValue('details'),roblox:i.fields.getTextInputValue('roblox')});}
   if(i.customId.startsWith('fsmm_paint_modal:')){const base=decodeURIComponent(i.customId.slice(18));return createTicket(i,'basepainting',{base,roblox:i.fields.getTextInputValue('roblox'),payment:i.fields.getTextInputValue('payment'),collateral:i.fields.getTextInputValue('collateral'),extra:i.fields.getTextInputValue('extra')});}
  }
 }catch(e){console.error('[FSMM INTERACTION ERROR]',e);if(!i.replied&&!i.deferred)await i.reply({content:'❌ Something went wrong. Check the bot logs.',flags:MessageFlags.Ephemeral}).catch(()=>{});else if(i.deferred)await i.editReply('❌ Something went wrong. Check the bot logs.').catch(()=>{})}
});

client.once('clientReady',async()=>{
 console.log(`[FSMM ${VERSION}] ONLINE AS ${client.user.tag}`);
 try{await registerCommands();const guild=await client.guilds.fetch(GUILD_ID);await guild.fetch();await setupPanels(guild);scheduleGiveaways();console.log('[FSMM] STARTUP SYNC COMPLETE');}catch(e){console.error('[FSMM STARTUP ERROR]',e)}
});

process.on('unhandledRejection',e=>console.error('[FSMM UNHANDLED]',e));
process.on('uncaughtException',e=>console.error('[FSMM CRASH]',e));
loadStore();
client.login(TOKEN);
