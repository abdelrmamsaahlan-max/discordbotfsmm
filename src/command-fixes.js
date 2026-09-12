'use strict';
require('dotenv').config();
const {Client,REST,Routes,SlashCommandBuilder}=require('discord.js');
const TOKEN=process.env.DISCORD_TOKEN,CLIENT_ID=process.env.CLIENT_ID,GUILD_ID=process.env.GUILD_ID;
const commands=[
 new SlashCommandBuilder().setName('exist').setDescription('Check Brainrot existence data.').addStringOption(o=>o.setName('brainrot').setDescription('Brainrot name').setRequired(true).setAutocomplete(true)),
 new SlashCommandBuilder().setName('calculator').setDescription('Calculate Brainrot income.').addStringOption(o=>o.setName('income').setDescription('Example: 5.3m or 6400000').setRequired(true)).addNumberOption(o=>o.setName('multiplier').setDescription('Total multiplier, e.g. 7.5').setMinValue(0).setRequired(true))
].map(x=>x.toJSON());
const originalLogin=Client.prototype.login;
Client.prototype.login=function(...args){const client=this;if(!client.__fsmmCommandFixes){client.__fsmmCommandFixes=true;client.once('clientReady',async()=>{try{const rest=new REST({version:'10'}).setToken(TOKEN);const current=await rest.get(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID));const map=new Map((current||[]).filter(c=>!['announce','transcript'].includes(c.name)).map(c=>[c.name,c]));for(const c of commands)map.set(c.name,c);await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:[...map.values()]});console.log(`[FSMM COMMAND FIXES] ensured /exist and /calculator (${map.size} total)`);}catch(e){console.error('[FSMM COMMAND FIXES]',e.message);}});}return originalLogin.apply(this,args);};
