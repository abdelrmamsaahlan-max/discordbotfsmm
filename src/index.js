require('dotenv').config();
// FSMM 7.1.0 deployment sync marker — Railway trigger 2026-09-09
const fs=require('fs');
const path=require('path');
const {Client,GatewayIntentBits,REST,Routes,SlashCommandBuilder,EmbedBuilder,PermissionFlagsBits,ActionRowBuilder,StringSelectMenuBuilder,ButtonBuilder,ButtonStyle,ChannelType,ModalBuilder,TextInputBuilder,TextInputStyle,MessageFlags}=require('discord.js');