'use strict';
require('dotenv').config();
const {Client,AuditLogEvent,EmbedBuilder}=require('discord.js');
const fs=require('fs');const path=require('path');
const DATA=process.env.DATA_FILE||path.join(__dirname,'..','data','store.json');
function getChannel(g){try{const d=JSON.parse(fs.readFileSync(DATA,'utf8'));const id=d.logsChannelId||d.logChannelId;return (id&&g.channels.cache.get(id))||g.channels.cache.find(c=>c.isTextBased?.()&&c.name==='fsmm-logs');}catch{return g.channels.cache.find(c=>c.isTextBased?.()&&c.name==='fsmm-logs');}}
const clean=v=>String(v??'Unknown').replace(/@everyone|@here/gi,'@ mention').slice(0,700);
async function send(g,title,desc){const c=getChannel(g);if(!c)return;await c.send({embeds:[new EmbedBuilder().setTitle(title).setDescription(desc).setColor(0x5865f2).setTimestamp().setFooter({text:'FSMM • Audit Logs'})]}).catch(()=>null);}
async function actor(g,type,targetId){try{const logs=await g.fetchAuditLogs({type,limit:8});const e=logs.entries.find(x=>x.target?.id===targetId&&Date.now()-x.createdTimestamp<15000);return e?.executor||null;}catch{return null;}}
const originalLogin=Client.prototype.login;
Client.prototype.login=function(...args){const c=this;if(!c.__fsmmAuditActor){c.__fsmmAuditActor=true;
 c.on('guildMemberUpdate',async(oldM,newM)=>{const oldIds=new Set(oldM.roles.cache.keys()),newIds=new Set(newM.roles.cache.keys());const added=[...newIds].filter(x=>!oldIds.has(x)).map(x=>newM.guild.roles.cache.get(x)).filter(r=>r&&r.id!==newM.guild.id);const removed=[...oldIds].filter(x=>!newIds.has(x)).map(x=>newM.guild.roles.cache.get(x)).filter(Boolean);if(!added.length&&!removed.length)return;const a=await actor(newM.guild,AuditLogEvent.MemberRoleUpdate,newM.id);const by=a?`<@${a.id}> (${clean(a.tag||a.username)})`:'Unknown / Discord did not expose the actor';const lines=[];if(added.length)lines.push(`**Added to member:** ${added.map(r=>`<@&${r.id}>`).join(', ')}`);if(removed.length)lines.push(`**Removed from member:** ${removed.map(r=>`<@&${r.id}>`).join(', ')}`);await send(newM.guild,'🎭 ROLE CHANGE',`**Member:** <@${newM.id}>\n**Changed by:** ${by}\n${lines.join('\n')}`);});
 c.on('roleCreate',async r=>{const a=await actor(r.guild,AuditLogEvent.RoleCreate,r.id);await send(r.guild,'🟢 ROLE CREATED',`**Role:** <@&${r.id}>\n**Created by:** ${a?`<@${a.id}>`:'Unknown'}\n**Name:** ${clean(r.name)}`);});
 c.on('roleDelete',async r=>{const a=await actor(r.guild,AuditLogEvent.RoleDelete,r.id);await send(r.guild,'🔴 ROLE DELETED',`**Role:** ${clean(r.name)}\n**Deleted by:** ${a?`<@${a.id}>`:'Unknown'}\n**Role ID:** ${r.id}`);});
 c.on('guildBanAdd',async b=>{const a=await actor(b.guild,AuditLogEvent.MemberBanAdd,b.user.id);await send(b.guild,'🔨 MEMBER BANNED',`**User:** <@${b.user.id}>\n**Banned by:** ${a?`<@${a.id}>`:'Unknown'}`);});
 c.on('guildBanRemove',async b=>{const a=await actor(b.guild,AuditLogEvent.MemberBanRemove,b.user.id);await send(b.guild,'♻️ MEMBER UNBANNED',`**User:** <@${b.user.id}>\n**Unbanned by:** ${a?`<@${a.id}>`:'Unknown'}`);});
 }return originalLogin.apply(this,args);};
