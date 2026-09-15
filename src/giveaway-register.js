'use strict';
require('dotenv').config();
const {REST,Routes,PermissionFlagsBits,ChannelType}=require('discord.js');
const TOKEN=process.env.DISCORD_TOKEN,CLIENT_ID=process.env.CLIENT_ID,GUILD_ID=process.env.GUILD_ID;
const createOptions=[
{type:3,name:'duration',description:'Duration: 30m, 2h, 1d or 1w',required:true},
{type:3,name:'prize',description:'Giveaway prize',required:true},
{type:4,name:'winners',description:'Number of winners (1-20)',required:false,min_value:1,max_value:20},
{type:7,name:'channel',description:'Channel for the giveaway',required:false,channel_types:[ChannelType.GuildText,ChannelType.GuildAnnouncement]},
{type:8,name:'required_role',description:'Role required to enter',required:false},
{type:8,name:'winner_role',description:'Role granted to manually selected winners',required:false},
{type:3,name:'title',description:'Custom giveaway title',required:false},
{type:3,name:'description',description:'Custom giveaway description',required:false},
{type:11,name:'image',description:'Upload the main giveaway image',required:false},
{type:11,name:'thumbnail',description:'Upload the giveaway thumbnail',required:false},
{type:3,name:'color',description:'Embed color, e.g. #5865F2',required:false},
{type:3,name:'entry_message',description:'Message sent after creation',required:false},
{type:3,name:'end_message',description:'Message sent when it ends',required:false},
{type:3,name:'winner_dm',description:'DM sent to selected winners',required:false},
{type:3,name:'winner_announcement',description:'Custom winner announcement',required:false},
{type:5,name:'mention_winners',description:'Mention winners publicly',required:false},
{type:5,name:'mention_required_role',description:'Mention the required role',required:false},
{type:3,name:'footer',description:'Custom embed footer',required:false},
{type:5,name:'allow_host_entry',description:'Allow the host to enter',required:false},
{type:5,name:'silent_end',description:'Disable the automatic end announcement',required:false}
];
const giveaway={name:'giveaway',description:'Professional FSMM giveaway management',default_member_permissions:PermissionFlagsBits.ManageGuild.toString(),options:[
{name:'create',description:'Create a giveaway',type:1,options:createOptions},
{name:'end',description:'End a giveaway early',type:1,options:[{type:3,name:'id',description:'Giveaway ID',required:true}]},
{name:'cancel',description:'Cancel a giveaway',type:1,options:[{type:3,name:'id',description:'Giveaway ID',required:true}]},
{name:'winner',description:'Manually declare an eligible winner',type:1,options:[{type:3,name:'id',description:'Giveaway ID',required:true},{type:6,name:'user',description:'Eligible entrant',required:true}]},
{name:'reroll',description:'Replace a winner manually',type:1,options:[{type:3,name:'id',description:'Giveaway ID',required:true},{type:6,name:'user',description:'Replacement eligible entrant',required:true}]},
{name:'edit',description:'Edit a live giveaway',type:1,options:[{type:3,name:'id',description:'Giveaway ID',required:true},{type:3,name:'prize',description:'New prize',required:false},{type:3,name:'title',description:'New title',required:false},{type:3,name:'description',description:'New description',required:false},{type:11,name:'image',description:'New image',required:false},{type:11,name:'thumbnail',description:'New thumbnail',required:false}]},
{name:'list',description:'List active giveaways',type:1},
{name:'info',description:'View giveaway details',type:1,options:[{type:3,name:'id',description:'Giveaway ID',required:true}]}
]};
if(TOKEN&&CLIENT_ID&&GUILD_ID){setTimeout(async()=>{try{const rest=new REST({version:'10'}).setToken(TOKEN);const current=await rest.get(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID));const banned=new Set(['announce','transcript','craft','exit','exist']);const body=current.filter(c=>!banned.has(c.name)&&c.name!=='giveaway');body.push(giveaway);await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body});console.log('[FSMM GIVEAWAY] force-registered full giveaway schema: 20 create options / 8 subcommands')}catch(e){console.error('[FSMM GIVEAWAY] registration failed:',e.message)}},12000)}
