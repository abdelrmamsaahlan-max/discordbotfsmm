const { EmbedBuilder, StringSelectMenuBuilder, Client, ActivityType, TextChannel } = require('discord.js');
const https = require('https');

const BRAND_IMAGE_URL='https://cdn.discordapp.com/attachments/1436074247725383710/1470434524881096816/1770649288038.png?ex=6aa6121e&is=6aa4c09c&hm=fd54c47226a79c68d96f0df59ed485c756ad0a689cc0ad9c85133d1da69c540c&';
const emojiByName=new Map();
const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const FIXED_EMOJI_IDS={moneypuggy:'1468915669612368096',garama:'1466193041558868122',lasupreme:'1466191694805602569',strawberryele:'1468915447557652523'};
const labelEmojiIds={'10m250m':null,'250m500m':FIXED_EMOJI_IDS.moneypuggy,'1b':FIXED_EMOJI_IDS.lasupreme,'og':null};
const aliases={candy:['candy'],lava:['lava'],galaxy:['galaxy'],yinyang:['yinyang','yinying','yin yang','yinyangbase'],radioactive:['radioactive','radiation','radioactivebase'],cursed:['cursed','crused','cursedbase'],rainbow:['rainbow'],diamond:['diamond'],divine:['divine','divinebase'],cyber:['cyber','cyberbase'],phantom:['phantom','phantombase'],crystal:['crystal','crystalbase'],'10m250m':['lagrand','lagrandemoji'],'250m500m':['moneypuggy','moneypug','cashpuggy','richpuggy','money'],'1b':['lasupreme','lasupremeemoji'],'og':['meowl','og','rare','ogitem','rareitem']};
function storeEmoji(emoji){if(!emoji?.name||!emoji?.id)return;emojiByName.set(normalize(emoji.name),{id:emoji.id,name:emoji.name,animated:Boolean(emoji.animated)});}
function fixedEmoji(id){if(!id)return undefined;for(const emoji of emojiByName.values())if(emoji.id===id)return emoji;return{id,name:'emoji',animated:false};}
function loadGuildEmojis(){const token=process.env.DISCORD_TOKEN,guildId=process.env.GUILD_ID;if(!token||!guildId)return;const req=https.get(`https://discord.com/api/v10/guilds/${guildId}/emojis`,{headers:{Authorization:`Bot ${token}`}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>{try{if(res.statusCode!==200)throw new Error(`Discord emoji API HTTP ${res.statusCode}`);const emojis=JSON.parse(Buffer.concat(chunks).toString('utf8'));for(const emoji of emojis)storeEmoji(emoji);console.log(`[FSMM] Loaded ${emojiByName.size} live server emojis`);}catch(e){console.error('[FSMM EMOJIS]',e.message);}});});req.on('error',e=>console.error('[FSMM EMOJIS]',e.message));req.setTimeout(10000,()=>req.destroy(new Error('emoji API timeout')));}
function findEmoji(label){const key=normalize(label);if(labelEmojiIds[key])return fixedEmoji(labelEmojiIds[key]);const candidates=(aliases[key]||[key]).map(normalize);for(const candidate of candidates){const emoji=emojiByName.get(candidate);if(emoji)return emoji;}for(const[name,emoji]of emojiByName){if(candidates.some(candidate=>name===candidate||name.includes(candidate)||candidate.includes(name)))return emoji;}return undefined;}

const MIDDLEMAN_TITLE='🗂️ {MIDDLE MAN SERVICE}';
const MIDDLEMAN_DESCRIPTION=`REQUEST A MIDDLE MAN FOR A SMOOTH AND QUICK TRADE

**Trade safely with FSMM. Our trusted middlemen help make sure both sides complete the deal fairly and securely.**

**How it works**
• Choose the value of your trade from the menu below.
• Open your ticket and wait for a middleman to claim it.
• Follow the middleman’s instructions throughout the trade.
• Once everything is completed, leave your vouch in the **Text《✅》vouches** channel. <:emoji_49:1466347975562363003>

**Please do not ping middlemen. A middleman will claim your ticket when available.**`;

async function updateMiddlemanOrderPanel(client){try{const guildId=process.env.GUILD_ID,guild=guildId?client.guilds.cache.get(guildId):null;if(!guild)return;const channel=guild.channels.cache.find(c=>c.isTextBased?.()&&c.name==='🤝・middleman');if(!channel)return;const messages=await channel.messages.fetch({limit:20});const panel=messages.find(m=>m.author.id===client.user.id&&m.components.length);if(!panel)return;const embed=new EmbedBuilder().setTitle(MIDDLEMAN_TITLE).setDescription(MIDDLEMAN_DESCRIPTION).setColor(0x5865f2).setImage(BRAND_IMAGE_URL).setFooter({text:'POWERED BY FSMM'});await panel.edit({embeds:[embed]});console.log('[FSMM] Middleman order panel updated automatically');}catch(e){console.error('[FSMM ORDER PANEL]',e.message);}}

const originalSetTitle=EmbedBuilder.prototype.setTitle;
EmbedBuilder.prototype.setTitle=function(title){if(title==='🤝 FSMM MIDDLEMAN'||title==='🎫 FSMM MIDDLEMAN TICKET'){this.__fsmmMiddleman=true;originalSetTitle.call(this,MIDDLEMAN_TITLE);return this.setImage(BRAND_IMAGE_URL);}return originalSetTitle.call(this,title);};
const originalSetDescription=EmbedBuilder.prototype.setDescription;EmbedBuilder.prototype.setDescription=function(description){if(this.__fsmmMiddleman)return originalSetDescription.call(this,MIDDLEMAN_DESCRIPTION);return originalSetDescription.call(this,description);};
const originalSetFooter=EmbedBuilder.prototype.setFooter;EmbedBuilder.prototype.setFooter=function(data){if(this.__fsmmMiddleman)return originalSetFooter.call(this,{text:'POWERED BY FSMM'});if(data&&typeof data==='object'&&typeof data.text==='string'&&(/^FSMM\s*[•|·-]\s*v?\d/i.test(data.text.trim())||data.text.trim()==='FSMM'))return this.setImage(BRAND_IMAGE_URL);return originalSetFooter.call(this,data);};

const originalAddOptions=StringSelectMenuBuilder.prototype.addOptions;
StringSelectMenuBuilder.prototype.addOptions=function(...args){const patch=option=>{if(Array.isArray(option))return option.map(patch);if(!option||typeof option!=='object'||!option.label)return option;if(option.emoji)return option;const emoji=findEmoji(option.label);return emoji?{...option,emoji}:option;};return originalAddOptions.apply(this,args.map(patch));};
const originalToJSON=StringSelectMenuBuilder.prototype.toJSON;
StringSelectMenuBuilder.prototype.toJSON=function(...args){const data=originalToJSON.apply(this,args);if(Array.isArray(data.options))data.options=data.options.map(option=>{if(!option?.label||option.emoji)return option;const emoji=findEmoji(option.label);return emoji?{...option,emoji}:option;});return data;};

// Remember the exact menu choice before the main ticket handler runs.
const pendingTicketChoices=new Map();
const originalEmit=Client.prototype.emit;
Client.prototype.emit=function(event,...args){try{if(event==='interactionCreate'){const i=args[0];if(i?.isStringSelectMenu?.()){if(i.customId==='fsmm_mm'||i.customId==='fsmm_base'||i.customId==='fsmm_support'){pendingTicketChoices.set(i.user.id,{customId:i.customId,value:i.values?.[0],at:Date.now()});}}}}catch(e){console.error('[FSMM TICKET CHOICE]',e.message);}return originalEmit.call(this,event,...args);};

// Ticket role routing. The bot finds the roles by name, so role IDs do not need to be hard-coded.
const MIDDLEMAN_ROLE_ALIASES={
  '10m250m':['10m - 250m','10m-250m','10m 250m','10m to 250m','10m250m'],
  '250m500m':['250m - 500m','250m-500m','250m 500m','250m to 500m','250m500m'],
  '1b':['1b+','1b +','1b','1bplus'],
  og:['og','og items','og item','rare items','rare']
};
const BASE_NAMES=['Candy','Lava','Galaxy','Yin Yang','Radioactive','Cursed','Divine','Cyber','Phantom','Crystal'];
function roleByPatterns(guild,patterns){if(!guild?.roles?.cache)return null;const wanted=patterns.map(normalize);return guild.roles.cache.find(role=>{const n=normalize(role.name);return wanted.includes(n)||wanted.some(x=>n===x||n.includes(x));})||null;}
function middlemanValueFromText(text){const n=normalize(text);if(n.includes('10m250m'))return '10m250m';if(n.includes('250m500m'))return '250m500m';if(n.includes('1b'))return '1b';if(n.includes('og'))return 'og';return null;}
function baseFromText(text){const n=normalize(text);return BASE_NAMES.find(base=>n.includes(normalize(base)))||null;}
function findTicketSpecificRole(guild,type,description,userId){const pending=pendingTicketChoices.get(userId);if(type==='middleman'){const key=middlemanValueFromText(pending?.customId==='fsmm_mm'?pending.value:'')||middlemanValueFromText(description);if(!key)return null;return roleByPatterns(guild,MIDDLEMAN_ROLE_ALIASES[key]);}if(type==='base-painting'){const base=(pending?.customId==='fsmm_base'?pending.value:null)||baseFromText(description);if(!base)return null;const n=normalize(base);return roleByPatterns(guild,[`${base} Index Provider`,`${base} Provider`,`${base} Index`,`${n}indexprovider`,`${n}provider`]);}if(type==='support')return roleByPatterns(guild,['FSMM Staff','Staff']);return null;}
function ticketInfoEmbed(type,description,role){const roleText=role?`<@&${role.id}>`:'the appropriate FSMM team';let text;if(type==='middleman')text=`**Please wait for ${roleText} to respond.**\n\n• Do not ping staff or middlemen repeatedly.\n• Never share your password, cookies, or private account information.\n• Follow the middleman’s instructions and keep the trade inside the ticket.\n• When the trade is complete, leave a vouch if applicable.`;else if(type==='base-painting'){const base=baseFromText(description)||'selected base';text=`**Your ${base} index request is ready.**\n\n• ${roleText} is the role responsible for this base.\n• Please wait for an index provider to claim/respond.\n• Do not share passwords, cookies, or private account information.\n• Follow the provider’s instructions and leave a vouch when completed.`;}else{text=`**FSMM Support**\n\n• ${roleText} will handle this ticket.\n• Explain your request clearly and include any useful screenshots or details.\n• Do not share passwords, cookies, or private account information.\n• Please wait patiently for staff to respond.`;}return new EmbedBuilder().setTitle('📌 IMPORTANT — FSMM TICKET').setDescription(text).setColor(0x5865f2).setFooter({text:'FSMM • Please keep your ticket clear and safe'});}

// The main ticket creator already sends the opening ping/embed. This hook adds the correct
// value/base role automatically and posts the important ticket information immediately.
const originalTextChannelSend=TextChannel.prototype.send;
TextChannel.prototype.send=async function(payload){try{const topic=this.topic||'';const firstEmbed=Array.isArray(payload?.embeds)?payload.embeds[0]:null;const title=firstEmbed?.data?.title||firstEmbed?.title||'';if(topic.includes('FSMM_USER:')&&topic.includes('TYPE:')&&String(title).startsWith('🎫 FSMM ')){const type=(topic.match(/TYPE:([^\s]+)/)||[])[1]||'support';const description=firstEmbed?.data?.description||firstEmbed?.description||'';const userId=(String(payload.content||'').match(/<@!?(\d+)>/)||[])[1];const role=findTicketSpecificRole(this.guild,type,description,userId);const roleMention=role?` <@&${role.id}>`:'';const content=String(payload.content||'');payload={...payload,content:content+roleMention,allowedMentions:{...(payload.allowedMentions||{}),roles:Array.from(new Set([...(payload.allowedMentions?.roles||[]),...(role?[role.id]:[])]))},embeds:[...(payload.embeds||[]),ticketInfoEmbed(type,description,role)]};console.log(`[FSMM] Ticket routing: ${type} -> ${role?.name||'no matching role found'}`);if(userId)pendingTicketChoices.delete(userId);}}catch(e){console.error('[FSMM TICKET ROUTING]',e.message);}return originalTextChannelSend.call(this,payload);};

const originalLogin=Client.prototype.login;
Client.prototype.login=async function(...args){const result=await originalLogin.apply(this,args);try{const guildId=process.env.GUILD_ID,guild=guildId?this.guilds.cache.get(guildId):null;if(guild?.emojis?.cache){for(const emoji of guild.emojis.cache.values())storeEmoji(emoji);console.log(`[FSMM] Synced ${guild.emojis.cache.size} live guild emojis from cache`);}this.user?.setPresence({activities:[{name:'FSMM',type:ActivityType.Watching}],status:'online'});console.log('[FSMM] Presence set to Watching FSMM');setTimeout(()=>updateMiddlemanOrderPanel(this),1500);}catch(e){console.error('[FSMM PRESENCE]',e.message);}return result;};
loadGuildEmojis();
