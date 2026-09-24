'use strict';
require('dotenv').config();
const {Client,REST,Routes,SlashCommandBuilder}=require('discord.js');
const TOKEN=process.env.DISCORD_TOKEN,CLIENT_ID=process.env.CLIENT_ID,GUILD_ID=process.env.GUILD_ID;
const commands=[
 new SlashCommandBuilder().setName('calculator').setDescription('Calculate Brainrot income.').addStringOption(o=>o.setName('income').setDescription('Example: 5.3m or 6400000').setRequired(true)).addNumberOption(o=>o.setName('multiplier').setDescription('Total multiplier, e.g. 7.5').setMinValue(0).setRequired(true))
].map(x=>x.toJSON());
// Command registration is centralized in src/index.js. This module only provides calculator behavior.
