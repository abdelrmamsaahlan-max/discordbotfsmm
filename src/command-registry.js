'use strict';
const {REST,Routes}=require('discord.js');
const TOKEN=process.env.DISCORD_TOKEN;
if(!global.__fsmmRegistryPatched){
 global.__fsmmRegistryPatched=true;
 const originalPut=REST.prototype.put;let queue=Promise.resolve();
 REST.prototype.put=function(route,options={}){
  const CLIENT_ID=process.env.CLIENT_ID,GUILD_ID=process.env.GUILD_ID;
  if(!CLIENT_ID||!GUILD_ID||!String(route).includes(`/applications/${CLIENT_ID}/guilds/${GUILD_ID}/commands`))return originalPut.call(this,route,options);
  const incoming=Array.isArray(options.body)?options.body:[];
  queue=queue.then(async()=>{const rest=this;try{const current=await rest.get(Routes.applicationGuildCommands(CLIENT_ID,GUILD_ID));const banned=new Set(['announce','transcript','craft','exit','exist']);const map=new Map();for(const c of current||[])if(!banned.has(c.name))map.set(c.name,c);for(const c of incoming)if(c?.name&&!banned.has(c.name))map.set(c.name,c);const body=[...map.values()];console.log(`[FSMM REGISTRY] synced ${body.length} guild commands`);return originalPut.call(rest,route,{...options,body})}catch(e){console.error('[FSMM REGISTRY] sync failed:',e.message);throw e}});return queue;
 };
}
