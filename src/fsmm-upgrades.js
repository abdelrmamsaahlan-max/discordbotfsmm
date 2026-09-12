'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { Client, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const EXIST_FILE = process.env.EXIST_DATA_FILE || path.join(__dirname, '..', 'data', 'exist-store.json');
const REPORT_FILE = path.join(__dirname, '..', 'data', 'reports-store.json');
const EXTRA_FILE = process.env.EXTRA_DATA_FILE || path.join(__dirname, '..', 'data', 'extra-store.json');
const VALUE_SOURCE = 'https://sabexistcount.com';

const commands = [
  new SlashCommandBuilder().setName('price').setDescription('Check current community value and SAB data for a Brainrot.').addStringOption(o => o.setName('brainrot').setDescription('Brainrot name').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('calculator').setDescription('Calculate Brainrot income from a base income and multiplier.').addStringOption(o => o.setName('income').setDescription('Example: 5.3m or 6400000').setRequired(true)).addNumberOption(o => o.setName('multiplier').setDescription('Total multiplier, for example 7.5').setMinValue(0).setRequired(true)),
  new SlashCommandBuilder().setName('report').setDescription('Report a member to FSMM staff with a reason.').addUserOption(o => o.setName('user').setDescription('Member to report').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('What happened').setMaxLength(500).setRequired(true)),
  new SlashCommandBuilder().setName('case').setDescription('Staff: view recent moderation cases for a member.').addUserOption(o => o.setName('user').setDescription('Member').setRequired(true))
].map(x => x.toJSON());

function loadJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function saveJson(file, value) { try { fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, 2)); fs.renameSync(tmp, file); } catch (e) { console.error('[FSMM UPGRADES] save:', e.message); } }
function clean(v, n = 500) { return String(v ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/@everyone|@here/gi, '@ mention').trim().slice(0, n) || 'Not provided'; }
function slugify(name) { return String(name).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase(); }
function httpGet(url) { return new Promise((resolve, reject) => { const req = https.get(url, { headers: { 'User-Agent': 'FSMM-Bot/13.0', Accept: 'text/html,application/xhtml+xml' } }, res => { if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(httpGet(new URL(res.headers.location, url).toString())); } if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); } const chunks=[]; res.on('data', c => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); }); req.setTimeout(12000, () => req.destroy(new Error('timeout'))); req.on('error', reject); }); }
function text(html) { return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim(); }
function parseNumber(v) { const s=String(v).trim().replace(/,/g,'').toUpperCase(); const m=s.match(/^([0-9]*\.?[0-9]+)\s*(K|M|B|T|QA|QI)?$/); if(!m) return null; const units={K:1e3,M:1e6,B:1e9,T:1e12,QA:1e15,QI:1e18}; return Number(m[1])*(units[m[2]]||1); }
function format(n) { if(!Number.isFinite(n)) return 'Unknown'; const units=[['Qi',1e18],['Qa',1e15],['T',1e12],['B',1e9],['M',1e6],['K',1e3]]; for(const [u,d] of units) if(Math.abs(n)>=d) return `${(n/d).toFixed((n/d)>=100?0:(n/d)>=10?1:2).replace(/\.0+$/,'').replace(/(\.\d*[1-9])0+$/,'$1')}${u}`; return Math.round(n).toLocaleString(); }
function readItems() { const db=loadJson(EXIST_FILE,{items:[]}); return Array.isArray(db.items)?db.items:[]; }
function findItem(name) { const q=String(name||'').toLowerCase().trim(); const items=readItems(); return items.find(x=>x.name.toLowerCase()===q)||items.find(x=>x.name.toLowerCase().includes(q)); }
async function getValuePage(item) { const html=await httpGet(`${VALUE_SOURCE}/products/${item.slug}`); const t=text(html); const value=(t.match(/(?:Trade Value|Current Value)\s*[:|]?\s*([0-9][0-9,.]*\s*(?:K|M|B|T|Qa|Qi)?)/i)||[])[1]||null; const demand=(t.match(/Demand\s*[:|]?\s*([A-Za-z]+)/i)||[])[1]||null; return { value, demand }; }
function isStaff(i) { return i.guild?.ownerId===i.user.id || Boolean(i.member?.permissions?.has(PermissionFlagsBits.Administrator)) || Boolean(i.member?.roles?.cache?.some(r => ['FSMM Staff','FSMM Moderator','FSMM Mod','Owner'].includes(r.name))); }
function reply(i, content) { return i.reply({ content, flags: MessageFlags.Ephemeral }); }

const originalLogin = Client.prototype.login;
Client.prototype.login = function(...args) {
  const client=this;
  if(!client.__fsmmUpgradesAttached) {
    client.__fsmmUpgradesAttached=true;
    client.once('clientReady', async()=>{
      try {
        const rest=new REST({version:'10'}).setToken(TOKEN);
        const existing=await rest.get(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID));
        const without=existing.filter(c=>!commands.some(x=>x.name===c.name));
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID),{body:[...without,...commands]});
        console.log('[FSMM UPGRADES] registered focused utility commands');
      } catch(e) { console.error('[FSMM UPGRADES] register:',e.message); }
    });
    client.on('interactionCreate',async i=>{
      try {
        if(i.isAutocomplete() && i.commandName==='price') {
          const q=i.options.getString('brainrot')?.toLowerCase()||'';
          const choices=readItems().filter(x=>!q||x.name.toLowerCase().includes(q)).slice(0,25).map(x=>({name:`${x.name} • ${x.rarity}`,value:x.name}));
          return i.respond(choices).catch(()=>null);
        }
        if(!i.isChatInputCommand()||!i.guild) return;
        if(i.commandName==='price') {
          await i.deferReply();
          const item=findItem(i.options.getString('brainrot'));
          if(!item) return i.editReply('❌ Brainrot not found in the current FSMM data snapshot.');
          let market={value:null,demand:null}; try { market=await getValuePage(item); } catch {}
          const e=new EmbedBuilder().setTitle(`🧠 ${item.name}`).setDescription(`**Rarity:** ${item.rarity}\n**Income:** ${item.income||'Unknown'}\n**Known Exist:** ${item.exist||'Unknown'}\n**Community Value:** ${market.value||'Not available'}\n**Demand:** ${market.demand||'Not available'}\n\n⚠️ Community value is a reference, not an official Roblox price.`).setColor(0x5865f2).setFooter({text:'FSMM • Source: SABExistCount • Values can change'}); return i.editReply({embeds:[e]});
        }
        if(i.commandName==='calculator') {
          const base=parseNumber(i.options.getString('income',true)); const mult=i.options.getNumber('multiplier',true); if(base===null) return reply(i,'❌ Invalid income. Example: `5.3m` or `6400000`.'); const total=base*mult; const e=new EmbedBuilder().setTitle('🧮 FSMM Income Calculator').setDescription(`**Base Income:** ${format(base)}/s\n**Multiplier:** ${mult}x\n\n💰 **Calculated Income:** **${format(total)}/s**`).setColor(0x5865f2).setFooter({text:'FSMM Calculator • Calculation only'}); return i.reply({embeds:[e]});
        }
        if(i.commandName==='report') {
          const target=i.options.getUser('user',true); const reason=clean(i.options.getString('reason',true)); const reports=loadJson(REPORT_FILE,[]); const id=Date.now().toString(36).toUpperCase(); reports.push({id,guildId:i.guild.id,targetId:target.id,reporterId:i.user.id,reason,createdAt:Date.now(),status:'open'}); saveJson(REPORT_FILE,reports.slice(-500)); const e=new EmbedBuilder().setTitle(`🚨 FSMM REPORT • ${id}`).setDescription(`**Reported:** <@${target.id}>\n**Reporter:** <@${i.user.id}>\n**Reason:** ${reason}\n**Status:** Open`).setColor(0xed4245); const logChannel=i.guild.channels.cache.find(c=>c.isTextBased()&&/report|modlog|moderator/i.test(c.name)); if(logChannel) await logChannel.send({embeds:[e]}).catch(()=>null); return reply(i,`✅ Report submitted to FSMM staff. Case ID: **${id}**`);
        }
        if(i.commandName==='case') {
          if(!isStaff(i)) return reply(i,'❌ Staff only.');
          const target=i.options.getUser('user',true); const data=loadJson(EXTRA_FILE,{actionLogs:{}}); const all=Array.isArray(data.actionLogs?.[i.guild.id])?data.actionLogs[i.guild.id]:[]; const cases=all.filter(x=>x.targetId===target.id).slice(-10).reverse(); if(!cases.length) return i.reply({embeds:[new EmbedBuilder().setTitle(`🛡️ Cases • ${target.tag}`).setDescription('No recorded moderation cases found.').setColor(0x5865f2)]}); const lines=cases.map((x,n)=>`**${n+1}. ${clean(x.action,40)}** • <t:${Math.floor(x.at/1000)}:R>\nReason: ${clean(x.reason,180)}\nBy: <@${x.by}>`).join('\n\n'); return i.reply({embeds:[new EmbedBuilder().setTitle(`🛡️ Cases • ${target.tag}`).setDescription(lines).setColor(0x5865f2).setFooter({text:'FSMM • Internal moderation record'})]});
        }
      } catch(e) { console.error('[FSMM UPGRADES] interaction:',e.message); if(i.deferred||i.replied) await i.editReply('⚠️ Something went wrong. No data was lost.').catch(()=>null); }
    });
  }
  return originalLogin.apply(this,args);
};
