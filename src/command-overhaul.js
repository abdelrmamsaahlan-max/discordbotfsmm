'use strict';
require('dotenv').config();
const fs=require('fs');
const path=require('path');
const {Client,REST,Routes,EmbedBuilder,MessageFlags,PermissionFlagsBits,ChannelType,SlashCommandBuilder}=require('discord.js');
const TOKEN=process.env.DISCORD_TOKEN,CLIENT_ID=process.env.CLIENT_ID,GUILD_ID=process.env.GUILD_ID;
const DATA_FILE=process.env.DATA_FILE||path.join(__dirname,'..','data','store.json');
const STAFF_IDS=new Set(['1466090947170406617','1466085137459712114','1466088151331242015']);
const clean=v=>String(v??'').replace(/@everyone|@here/gi,'@ mention').replace(/[\u0000-\u001F\u007F]/g,' ').trim().slice(0,900)||'Not provided';
function readJson(file,fallback){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function writeJson(file,value){try{fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=`${file}.tmp`;fs.writeFileSync(tmp,JSON.stringify(value,null,2));fs.renameSync(tmp,file);}catch(e){console.error('[FSMM OVERHAUL] save:',e.message);}}
function staff(i){return Boolean(i.guild&&(i.guild.ownerId===i.user.id||i.member?.permissions?.has(PermissionFlagsBits.ManageGuild)||i.member?.roles?.cache?.some(r=>STAFF_IDS.has(r.id))));}
function card(t,d){return new EmbedBuilder().setTitle(t).setDescription(d).setColor(0x5865f2).setFooter({text:'FSMM'});}
function help(){return card('📖 FSMM COMMANDS',[
'**⚡ Quick & Server**','`/ping` — Check bot latency and connection status.','`/help` — Open this command guide.','`/membercount` — See the current server member count.','`/serverinfo` — View useful FSMM server information.','`/userinfo` — View a member’s public Discord information.','`/avatar` — View a member’s avatar.','`/servericon` — View the FSMM server icon.','`/roleinfo` — Inspect a role.','`/channelinfo` — Inspect a channel.','`/botinfo` — Check FSMM bot version, ping and uptime.','',
'**⭐ Trust & Community**','`/vouch` — Leave a service vouch/review.','`/vouches` — View a member’s vouches.','`/leaderboard` — See the top members by vouches.','`/vouchleaderboard` — Same trusted ranking.','`/vouchsearch` — Search vouches.','`/stats` — View FSMM/member statistics.','`/profile` — View an FSMM member profile.','`/activity` — View recorded activity.','`/topmembers` — See the most active members.','',
'**🧠 Steal a Brainrot Tools**','`/exist` — Check tracked Brainrot existence data.','`/price` — Check useful Brainrot value/data.','`/calculator` — Calculate Brainrot income.','',
'**🛡️ Moderation & Staff**','`/warn` `/warnings` `/unwarn` `/ban` `/unban` `/kick` `/timeout` `/untimeout` `/clear`','`/lock` `/unlock` `/slowmode` `/nick` `/role` `/modlogs` `/ticketstats`','',
'**🎫 FSMM Services**','Use the Middleman, Support and Base Painting ticket panels.','',
'🔒 Staff/admin commands require the appropriate permissions.','🛠️ `/fsmmsetup` is a one-time command for the FSMM logging system.'
].join('\n'));}
function buildSetupCommand(){return new SlashCommandBuilder().setName('fsmmsetup').setDescription('One-time setup for FSMM logs and audit logging.').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString()).toJSON();}
async function ensureLogs(i){
  if(!staff(i))return i.reply({content:'❌ Staff/Owner only.',flags:MessageFlags.Ephemeral});
  const data=readJson(DATA_FILE,{vouches:[],warnings:{},messages:{},commands:{}});
  if(data.fsmmLogsSetup?.completed)return i.reply({content:'ℹ️ FSMM logging is already configured. This setup command has already been used.',flags:MessageFlags.Ephemeral});
  const guild=i.guild;
  let category=guild.channels.cache.find(c=>c.type===ChannelType.GuildCategory&&c.name==='FSMM LOGS');
  if(!category)category=await guild.channels.create({name:'FSMM LOGS',type:ChannelType.GuildCategory});
  let channel=guild.channels.cache.find(c=>c.type===ChannelType.GuildText&&c.name==='fsmm-logs');
  if(!channel)channel=await guild.channels.create({name:'fsmm-logs',type:ChannelType.GuildText,parent:category.id,permissionOverwrites:[{id:guild.roles.everyone.id,deny:[PermissionFlagsBits.ViewChannel]},{id:guild.ownerId,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]}]});
  else if(channel.parentId!==category.id)await channel.setParent(category.id).catch(()=>null);
  data.logsChannelId=channel.id;
  data.fsmmLogsSetup={completed:true,completedBy:i.user.id,completedAt:Date.now(),channelId:channel.id,categoryId:category.id};
  writeJson(DATA_FILE,data);
  await channel.send({embeds:[card('🛡️ FSMM LOGGING ENABLED','Audit logging is now configured for this server.\n\nThe bot will use this channel for important member, moderation, channel, role, message and command activity logs.')]}).catch(()=>null);
  return i.reply({content:`✅ FSMM logging setup completed.\n📁 Category: ${category}\n🛡️ Logs: ${channel}\n\nThis setup is one-time only.`,flags:MessageFlags.Ephemeral});
}
async function cleanRegistry(){
  if(!TOKEN||!CLIENT_ID||!GUILD_ID)return;
  try{
    const rest=new REST({version:'10'}).setToken(TOKEN);
    const existing=await rest.get(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID));
    const body=existing.filter(c=>!['announce','transcript'].includes(c.name));
    if(!body.some(c=>c.name==='fsmmsetup'))body.push(buildSetupCommand());
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body});
    console.log(`[FSMM OVERHAUL] registry verified (${body.length}); /announce and /transcript removed`);
  }catch(e){console.error('[FSMM OVERHAUL] registry:',e.message);}
}
const originalEmit=Client.prototype.emit;
Client.prototype.emit=function(event,...args){
  if(event==='interactionCreate'){
    const i=args[0];
    if(i?.isChatInputCommand?.()&&i.guild){
      if(i.commandName==='help'){i.reply({embeds:[help()],flags:MessageFlags.Ephemeral}).catch(()=>null);return true;}
      if(i.commandName==='announce'||i.commandName==='transcript'){i.reply({content:`❌ \`/${i.commandName}\` has been removed from FSMM.`,flags:MessageFlags.Ephemeral}).catch(()=>null);return true;}
      if(i.commandName==='fsmmsetup'){ensureLogs(i).catch(e=>i.reply({content:'❌ FSMM logging setup failed.',flags:MessageFlags.Ephemeral}).catch(()=>null));return true;}
    }
  }
  return originalEmit.call(this,event,...args);
};
const originalLogin=Client.prototype.login;
Client.prototype.login=function(...args){
  const c=this;
  if(!c.__fsmmOverhaulReady){
    c.__fsmmOverhaulReady=true;
    c.once('clientReady',()=>setTimeout(cleanRegistry,8000));
  }
  return originalLogin.apply(c,args);
};
