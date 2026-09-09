require('dotenv').config();
const fs=require('fs');
const path=require('path');
const {Client,GatewayIntentBits,REST,Routes,SlashCommandBuilder,EmbedBuilder,PermissionFlagsBits,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags}=require('discord.js');

const TOKEN=process.env.DISCORD_TOKEN;
const CLIENT_ID=process.env.CLIENT_ID;
const GUILD_ID=process.env.GUILD_ID;
if(!TOKEN||!CLIENT_ID||!GUILD_ID) throw new Error('Missing required environment variables.');

const VERSION='6.0.0';
const STAFF='FSMM Staff';
const MM='FSMM Middleman';
const OWNER='Owner';
const CATEGORY='🎫 FSMM SERVICES';
const DATA_FILE=process.env.DATA_FILE||path.join(__dirname,'..','data','store.json');

const mutationBases=['Candy','Lava','Galaxy','Yin Yang','Radioactive','Cursed','Divine','Cyber','Phantom','Crystal'];
const baseFiles={Candy:'CandyBase.png',Lava:'LavaBase.png',Galaxy:'GalaxyBase.png','Yin Yang':'YinYangBase.png',Radioactive:'RadioactiveBase.png',Cursed:'CursedBase.png',Divine:'DivineBase.png',Cyber:'CyberBase.png',Phantom:'PhantomBase.png',Crystal:'CrystalBase.png'};
const mmValues=[
 ['10M - 250M','Trades from 10M to 250M'],
 ['250M - 500M','Trades from 250M to 500M'],
 ['500M - 1B','Trades from 500M to 1B'],
 ['1B - 5B','Trades from 1B to 5B'],
 ['5B+','Trades worth 5B or more'],
 ['OG / Rare Items','OG, rare or unusual items']
];

const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages]});

function clean(v,max=900){return String(v??'').replace(/[\u0000-\u001F\u007F]/g,' ').replace(/@everyone|@here/gi,'@ mention').trim().slice(0,max)||'Not provided'}
function normalize(v=''){return String(v).toLowerCase().replace(/[^a-z0-9]/g,'')}
function safe(v,max=900){return clean(v,max).replace(/[\\*_`~|>]/g,'\\$&')}
function isOwner(i){return i.guild?.ownerId===i.user.id||Boolean(i.member?.roles?.cache?.some(r=>normalize(r.name)===normalize(OWNER)))}
function isStaff(i){return isOwner(i)||Boolean(i.member?.roles?.cache?.some(r=>[STAFF,MM].map(normalize).includes(normalize(r.name))))}
function embed(title,description){return new EmbedBuilder().setTitle(title).setDescription(description).setColor(0x5865f2).setFooter({text:`FSMM • v${VERSION}`})}
function row(component){return new ActionRowBuilder().addComponents(component)}
function baseImage(base){return `https://stealabrainrot.fandom.com/wiki/Special:Redirect/file/${encodeURIComponent(baseFiles[base]||base+'Base.png')}`}

function defaultStore(){return {users:{},vouches:[],warnings:[],config:{}}}
let store=defaultStore();
function loadStore(){try{if(fs.existsSync(DATA_FILE)){const x=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));if(x&&x.users&&Array.isArray(x.vouches)&&Array.isArray(x.warnings))store=x}}catch(e){console.error('[FSMM] store load failed:',e.message)}}
function saveStore(){try{fs.mkdirSync(path.dirname(DATA_FILE),{recursive:true});fs.writeFileSync(DATA_FILE,JSON.stringify(store,null,2),{encoding:'utf8',mode:0o600})}catch(e){console.error('[FSMM] store save failed:',e.message)}}

async function ensureRolesAndCategory(guild){
 const staff=guild.roles.cache.find(r=>normalize(r.name)===normalize(STAFF))||await guild.roles.create({name:STAFF,reason:'FSMM service system'});
 const mm=guild.roles.cache.find(r=>normalize(r.name)===normalize(MM))||await guild.roles.create({name:MM,reason:'FSMM middleman system'});
 const owner=guild.roles.cache.find(r=>normalize(r.name)===normalize(OWNER))||await guild.roles.create({name:OWNER,reason:'FSMM owner administration'});
 const cat=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name===CATEGORY)||await guild.channels.create({name:CATEGORY,type:ChannelType.GuildCategory,reason:'FSMM service tickets'});
 return {staff,mm,owner,cat};
}

function middlemanMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_mm_pick').setPlaceholder('🤝 Select trade value...').addOptions(mmValues.map(([label,description])=>({label,value:label,description}))))}
function supportMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_support_pick').setPlaceholder('🛟 Select support type...').addOptions(
 {label:'Host a Giveaway',value:'host_gw',description:'Request FSMM to host a giveaway'},
 {label:'Claim a Giveaway',value:'claim_gw',description:'Get help claiming a giveaway'},
 {label:'Report',value:'report',description:'Report a problem or user'},
 {label:'Apply for a Role',value:'role_apply',description:'Apply for an FSMM role'}
))}
function baseMenu(){return row(new StringSelectMenuBuilder().setCustomId('fsmm_base_pick').setPlaceholder('🎨 Select a base...').addOptions(mutationBases.map(b=>({label:b,value:b,description:`${b} Base Painting`})) ))}
function closeButton(){return row(new ButtonBuilder().setCustomId('fsmm_close').setLabel('Close Ticket').setEmoji('🔒').setStyle(ButtonStyle.Danger))}

function panelConfigs(){return [
 ['🤝・middleman',embed('🤝 FSMM MIDDLEMAN','Need a safe middleman?\n\nSelect the value of your trade below. You will then answer a few questions and a private ticket will be created.'),middlemanMenu()],
 ['🛟・support',embed('🛟 FSMM SUPPORT','Need help from FSMM staff?\n\nChoose exactly what you need:\n• Host a Giveaway\n• Claim a Giveaway\n• Report\n• Apply for a Role'),supportMenu()],
 ['🎨・base-painting',embed('🎨 FSMM BASE PAINTING','Want your base painted?\n\nChoose a mutation from **Candy → Crystal**. You will then answer the request questions and receive a private ticket.'),baseMenu()]
]}

async function upsertPanel(channel,emb,components){
 const messages=await channel.messages.fetch({limit:50}).catch(()=>null);
 const panel=messages?.find(m=>m.author.id===client.user.id&&m.embeds?.[0]?.title===emb.data.title);
 if(panel){await panel.edit({embeds:[emb],components:[components],allowedMentions:{parse:[]}});return 'edited'}
 await channel.send({embeds:[emb],components:[components],allowedMentions:{parse:[]}});return 'created';
}

async function setupPanels(guild){
 const {cat}=await ensureRolesAndCategory(guild);
 let changed=0;
 for(const [name,emb,components] of panelConfigs()){
  let ch=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name===name&&c.parentId===cat.id);
  if(!ch) ch=await guild.channels.create({name,type:ChannelType.GuildText,parent:cat.id,permissionOverwrites:[{id:guild.roles.everyone.id,allow:[PermissionFlagsBits.ViewChannel],deny:[PermissionFlagsBits.SendMessages]}],reason:'FSMM service panel'});
  const action=await upsertPanel(ch,emb,components);
  changed++;
  console.log(`[FSMM PANELS] ${action}: #${name}`);
 }
 store.config.panelReadyAt=new Date().toISOString();
 store.config.panelCount=changed;
 saveStore();
 console.log(`[FSMM PANELS] READY — ${changed}/3 service panels synced`);
}

function modalText(id,label,style=TextInputStyle.Short,required=true,max=900,placeholder=''){const x=new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(required).setMaxLength(max);if(placeholder)x.setPlaceholder(placeholder);return x}
function mmModal(value){const m=new ModalBuilder().setCustomId(`fsmm_mm_modal:${encodeURIComponent(value)}`).setTitle('FSMM Middleman Request');return m.addComponents(row(modalText('giving','What are YOU giving?',TextInputStyle.Paragraph,true,900)),row(modalText('receiving','What is the OTHER TRADER giving?',TextInputStyle.Paragraph,true,900)),row(modalText('other','Other trader username',TextInputStyle.Short,true,100,'@username')),row(modalText('tip','What are you tipping?',TextInputStyle.Short,false,300,'Optional')))}
function supportModal(kind){const names={host_gw:'Host a Giveaway',claim_gw:'Claim a Giveaway',report:'Report',role_apply:'Apply for a Role'};const m=new ModalBuilder().setCustomId(`fsmm_support_modal:${kind}`).setTitle(names[kind]||'FSMM Support');return m.addComponents(row(modalText('details',kind==='role_apply'?'Why should we accept your application?':'Tell us what you need',TextInputStyle.Paragraph,true,900)),row(modalText('roblox','Roblox username',TextInputStyle.Short,false,100,'Optional')))}
function paintModal(base){const m=new ModalBuilder().setCustomId(`fsmm_paint_modal:${encodeURIComponent(base)}`).setTitle(`${base} Base Painting`);return m.addComponents(row(modalText('roblox','Roblox username',TextInputStyle.Short,true,100)),row(modalText('payment','What is your payment?',TextInputStyle.Paragraph,true,500)),row(modalText('collateral','What is your collateral?',TextInputStyle.Paragraph,true,500)),row(modalText('extra','Extra details',TextInputStyle.Paragraph,false,900,'Optional')))}

async function createTicket(i,type,data){
 const {staff,mm,cat}=await ensureRolesAndCategory(i.guild);
 const existing=i.guild.channels.cache.find(c=>c.parentId===cat.id&&c.topic===`FSMM_OWNER:${i.user.id}`);
 if(existing)return i.reply({content:`⚠️ You already have an open ticket: ${existing}`,flags:MessageFlags.Ephemeral});
 const prefix=type==='middleman'?'mm':type==='support'?'support':'paint';
 const overwrites=[
  {id:i.guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},
  {id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},
  {id:staff.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}
 ];
 if(type==='middleman')overwrites.push({id:mm.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]});
 const username=(i.user.username||'user').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,35)||'user';
 const ch=await i.guild.channels.create({name:`${prefix}-${username}`,type:ChannelType.GuildText,parent:cat.id,topic:`FSMM_OWNER:${i.user.id}`,permissionOverwrites:overwrites,reason:'FSMM private service ticket'});
 const titles={middleman:'🤝 MIDDLEMAN SERVICE',support:'🛟 FSMM SUPPORT',basepainting:'🎨 BASE PAINTING'};
 const e=embed(titles[type],'A private FSMM service ticket has been opened. Please wait for staff assistance.');
 e.addFields({name:'Requester',value:`<@${i.user.id}>`,inline:true},{name:'Service',value:type==='basepainting'?'Base Painting':type[0].toUpperCase()+type.slice(1),inline:true});
 for(const [name,label,max] of [['value','💰 Trade Value',100],['giving','🎁 What YOU are giving',900],['receiving','📦 What the OTHER TRADER is giving',900],['other','👤 Other Trader',100],['tip','💵 Tip',300],['supportType','📌 Request Type',100],['details','📝 Details',900],['roblox','🎮 Roblox Username',100],['base','🎨 Base',100],['payment','💳 Payment',500],['collateral','🔐 Collateral',500],['extra','📝 Extra Details',900]]) if(data[name])e.addFields({name:label,value:safe(data[name],max),inline:['value','other','supportType','roblox','base'].includes(name)});
 if(data.base)e.setImage(baseImage(data.base));
 const roleId=type==='middleman'?mm.id:staff.id;
 await ch.send({content:`<@${i.user.id}> <@&${roleId}>`,embeds:[e],components:[closeButton()],allowedMentions:{users:[i.user.id],roles:[roleId]}});
 return i.reply({content:`✅ Ticket created: ${ch}`,flags:MessageFlags.Ephemeral});
}

const commands=[
 new SlashCommandBuilder().setName('ping').setDescription('Check FSMM bot status.'),
 new SlashCommandBuilder().setName('help').setDescription('Show FSMM bot commands.'),
 new SlashCommandBuilder().setName('serverinfo').setDescription('Show server information.'),
 new SlashCommandBuilder().setName('membercount').setDescription('Show member count.'),
 new SlashCommandBuilder().setName('setup').setDescription('Owner-only: repair and sync the 3 FSMM service panels.'),
 new SlashCommandBuilder().setName('ticket').setDescription('Owner-only: sync the 3 FSMM service panels.')
].map(x=>x.toJSON());

async function registerCommands(){const rest=new REST({version:'10'}).setToken(TOKEN);await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:commands});console.log('[FSMM COMMANDS] REGISTERED');}

client.on('interactionCreate',async i=>{
 try{
  if(i.isChatInputCommand()){
   if(i.commandName==='ping')return i.reply({content:`🏓 Pong! ${client.ws.ping}ms`,flags:MessageFlags.Ephemeral});
   if(i.commandName==='help')return i.reply({embeds:[embed('🤖 FSMM BOT','`/setup` — sync all 3 panels\n`/ticket` — sync all 3 panels\n`/ping` — bot latency\n`/membercount` — server members')],flags:MessageFlags.Ephemeral});
   if(i.commandName==='serverinfo')return i.reply({embeds:[embed('📊 SERVER INFO',`**Server:** ${safe(i.guild.name,100)}\n**Members:** ${i.guild.memberCount}\n**ID:** ${i.guild.id}`)],flags:MessageFlags.Ephemeral});
   if(i.commandName==='membercount')return i.reply({content:`👥 Members: **${i.guild.memberCount}**`});
   if(i.commandName==='setup'||i.commandName==='ticket'){
    if(!isOwner(i))return i.reply({content:'❌ Owner-only.',flags:MessageFlags.Ephemeral});
    await i.deferReply({flags:MessageFlags.Ephemeral});
    await setupPanels(i.guild);
    return i.editReply('✅ FSMM panels synced. The existing panel messages were updated instead of creating a ticket center.');
   }
  }
  if(i.isStringSelectMenu()){
   if(i.customId==='fsmm_mm_pick')return i.showModal(mmModal(i.values[0]));
   if(i.customId==='fsmm_support_pick')return i.showModal(supportModal(i.values[0]));
   if(i.customId==='fsmm_base_pick')return i.showModal(paintModal(i.values[0]));
  }
  if(i.isModalSubmit()){
   if(i.customId.startsWith('fsmm_mm_modal:')){const value=decodeURIComponent(i.customId.slice(15));return createTicket(i,'middleman',{value,giving:i.fields.getTextInputValue('giving'),receiving:i.fields.getTextInputValue('receiving'),other:i.fields.getTextInputValue('other'),tip:i.fields.getTextInputValue('tip')});}
   if(i.customId.startsWith('fsmm_support_modal:')){const kind=i.customId.slice(20);const labels={host_gw:'Host a Giveaway',claim_gw:'Claim a Giveaway',report:'Report',role_apply:'Apply for a Role'};return createTicket(i,'support',{supportType:labels[kind]||kind,details:i.fields.getTextInputValue('details'),roblox:i.fields.getTextInputValue('roblox')});}
   if(i.customId.startsWith('fsmm_paint_modal:')){const base=decodeURIComponent(i.customId.slice(18));return createTicket(i,'basepainting',{base,roblox:i.fields.getTextInputValue('roblox'),payment:i.fields.getTextInputValue('payment'),collateral:i.fields.getTextInputValue('collateral'),extra:i.fields.getTextInputValue('extra')});}
  }
  if(i.isButton()&&i.customId==='fsmm_close'){
   if(!isStaff(i))return i.reply({content:'❌ Staff-only.',flags:MessageFlags.Ephemeral});
   await i.reply({content:'🔒 Closing ticket...',flags:MessageFlags.Ephemeral});
   setTimeout(()=>i.channel?.delete('FSMM ticket closed').catch(()=>{}),1200);
  }
 }catch(e){console.error('[FSMM INTERACTION ERROR]',e);if(!i.replied&&!i.deferred)await i.reply({content:'❌ Something went wrong. Please contact FSMM staff.',flags:MessageFlags.Ephemeral}).catch(()=>{});}
});

client.once('ready',async()=>{
 console.log(`[FSMM ${VERSION}] ONLINE AS ${client.user.tag}`);
 try{await registerCommands();}catch(e){console.error('[FSMM COMMANDS ERROR]',e);}
 try{const guild=await client.guilds.fetch(GUILD_ID);await setupPanels(guild);}catch(e){console.error('[FSMM PANELS ERROR]',e);}
});

loadStore();
client.login(TOKEN).catch(e=>{console.error('[FSMM LOGIN ERROR]',e);process.exit(1)});
