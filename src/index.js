require('dotenv').config();
// FSMM 7.1.0 deployment sync marker
const fs=require('fs');
const path=require('path');
const {Client,GatewayIntentBits,REST,Routes,SlashCommandBuilder,EmbedBuilder,PermissionFlagsBits,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags}=require('discord.js');

const TOKEN=process.env.DISCORD_TOKEN;
const CLIENT_ID=process.env.CLIENT_ID;
const GUILD_ID=process.env.GUILD_ID;