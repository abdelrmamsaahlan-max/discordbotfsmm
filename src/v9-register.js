require('dotenv').config();
const { Client, REST, Routes, SlashCommandBuilder } = require('discord.js');

const TOKEN=process.env.DISCORD_TOKEN;
const CLIENT_ID=process.env.CLIENT_ID;
const GUILD_ID=process.env.GUILD_ID;

const commands=[
['serverinfo','Show detailed FSMM server information.'],['userinfo','Show information about a member.'],['avatar','Show a member avatar.'],['servericon','Show the FSMM server icon.'],['roleinfo','Show role information.'],['channelinfo','Show channel information.'],['botinfo','Show FSMM bot information.'],
['vouch','Leave a vouch for a member.'],['vouches','Show a member vouch history.'],['vouchleaderboard','Show the FSMM vouch leaderboard.'],['leaderboard','Show the FSMM vouch leaderboard.'],['removevouch','Staff: remove the latest vouch.'],['vouchsearch','Search vouches by keyword.'],
['stats','Show FSMM community statistics.'],['profile','Show an FSMM member profile.'],['activity','Show FSMM activity.'],['topmembers','Show the most active recorded members.'],
['warn','Staff: warn a member.'],['warnings','Staff: view warnings.'],['unwarn','Staff: remove the latest warning.'],['clear','Staff: delete recent messages.'],['ban','Staff: ban a member.'],['unban','Staff: unban a user.'],['kick','Staff: kick a member.'],['timeout','Staff: timeout a member.'],['untimeout','Staff: remove a timeout.'],['lock','Staff: lock this channel.'],['unlock','Staff: unlock this channel.'],['slowmode','Staff: set channel slowmode.'],['nick','Staff: change a nickname.'],['role','Staff: add or remove a role.'],['modlogs','Staff: show recent moderation logs.'],
['ticketstats','Staff: show open FSMM ticket statistics.'],['transcript','Staff: create a transcript of this channel.'],['staffhelp','Show FSMM staff commands.'],['setwelcome','Staff: set the welcome channel.'],['setautorole','Staff: set the automatic join role.'],['settranscripts','Staff: set transcript log channel.'],['setlogs','Staff: set moderation/action log channel.'],['config','Owner: show FSMM configuration.'],
['help','Show FSMM bot commands and features.']
];

const builders={
 userinfo:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(false)),
 avatar:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(false)),
 roleinfo:c=>c.addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)),
 channelinfo:c=>c.addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(false)),
 vouch:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('service').setDescription('Service used').setMaxLength(80).setRequired(true)).addStringOption(o=>o.setName('review').setDescription('Your review').setMaxLength(500).setRequired(true)),
 vouches:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(false)),
 removevouch:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)),
 vouchsearch:c=>c.addStringOption(o=>o.setName('query').setDescription('Keyword').setMaxLength(80).setRequired(true)),
 profile:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(false)),
 activity:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(false)),
 warn:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500).setRequired(true)),
 warnings:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)),
 unwarn:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)),
 clear:c=>c.addIntegerOption(o=>o.setName('amount').setDescription('1-100').setMinValue(1).setMaxValue(100).setRequired(true)),
 ban:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)),
 unban:c=>c.addStringOption(o=>o.setName('user_id').setDescription('User ID').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)),
 kick:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)),
 timeout:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addIntegerOption(o=>o.setName('minutes').setDescription('1-40320').setMinValue(1).setMaxValue(40320).setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)),
 untimeout:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('reason').setDescription('Reason').setMaxLength(500)),
 slowmode:c=>c.addIntegerOption(o=>o.setName('seconds').setDescription('0-21600').setMinValue(0).setMaxValue(21600).setRequired(true)),
 nick:c=>c.addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addStringOption(o=>o.setName('nickname').setDescription('Nickname or reset').setMaxLength(32).setRequired(true)),
 role:c=>c.addStringOption(o=>o.setName('action').setDescription('Action').setRequired(true).addChoices({name:'Add',value:'add'},{name:'Remove',value:'remove'})).addUserOption(o=>o.setName('user').setDescription('Member').setRequired(true)).addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)),
 modlogs:c=>c.addUserOption(o=>o.setName('user').setDescription('Optional member').setRequired(false)),
 setwelcome:c=>c.addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true)),
 setautorole:c=>c.addRoleOption(o=>o.setName('role').setDescription('Role').setRequired(true)),
 settranscripts:c=>c.addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true)),
 setlogs:c=>c.addChannelOption(o=>o.setName('channel').setDescription('Channel').setRequired(true))
};

const payload=commands.map(([name,description])=>{let c=new SlashCommandBuilder().setName(name).setDescription(description);if(builders[name])c=builders[name](c);return c.toJSON();});

const originalLogin=Client.prototype.login;
Client.prototype.login=function(...args){
 const client=this;
 if(!client.__fsmmV9RegisterAttached){
  client.__fsmmV9RegisterAttached=true;
  client.once('ready',async()=>{
   try{
    const rest=new REST({version:'10'}).setToken(TOKEN);
    const existing=await rest.get(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID));
    const names=new Set(payload.map(c=>c.name));
    const preserved=existing.filter(c=>!names.has(c.name));
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:[...preserved,...payload]});
    console.log(`[FSMM v9] DISCORD COMMANDS SYNCED: ${payload.length} enhanced commands`);
    console.log(`[FSMM v9] /help INCLUDED`);
   }catch(e){console.error('[FSMM v9] COMMAND SYNC FAILED:',e.stack||e.message);}
  });
 }
 return originalLogin.apply(this,args);
};
